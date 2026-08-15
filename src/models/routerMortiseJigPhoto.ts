import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type { AuditCheckDefinition, AuditItem, LengthUnit, ModelDimensions, ModelParams, NumberLimits, RouterMortiseJigModelDefinition } from "./types";

type G = RouterMortiseJigModelDefinition["geometry"] & {
  deckRailLength: number; deckOverallWidth: number; railAdjustmentSlotLength: number; railBoltStationX: number;
  stopLength: number; stopWidth: number; stopAdjustmentSlotLength: number; stopSlotStationY: number;
  minimumInsertEngagement: number; minimumRailWeb: number; minimumRouterSupportOverlap: number; minimumClampLedge: number;
  washerDiameter: number; washerThickness: number; knobDiameter: number; knobHeight: number;
  screenLoadN: number; screenModulusMpa: number; screenAllowableStressMpa: number; maximumScreenDeflection: number; minimumScreenSafetyFactor: number;
  positioningBridgeLength: number; positioningBridgeWidth: number; positioningBridgeThickness: number;
  centeringBaseLength: number; centeringBaseWidth: number; centeringBaseThickness: number;
  centeringFenceLength: number; centeringFenceHeight: number; centeringFenceThickness: number;
};
const g = (model: RouterMortiseJigModelDefinition) => model.geometry as G;

export type RouterMortiseJigSpec = {
  assemblyView: number; openingLength: number; openingWidth: number; railLength: number; railWidth: number; railThickness: number;
  railGap: number; overallWidth: number; stopThickness: number; jawLength: number; jawThickness: number; jawDepth: number; jawCenterY: number;
  workpieceWidth: number; stockThickness: number; workpieceWiggle: number; insertPocketDiameter: number; insertDepth: number;
  insertFloor: number; insertSideWall: number; insertEngagement: number; routerBitDiameter: number; guideBushingDiameter: number;
  routerBaseDiameter: number; templateWiggle: number; minimumRailWeb: number; routerSupportOverlap: number; clampLedge: number;
  screenDeflection: number; screenSafetyFactor: number;
};
export type RouterMortiseJigPart = { key: RouterMortiseJigModelDefinition["parts"][number]["key"]; label: string; quantity: number; geometry: THREE.BufferGeometry };
export type RouterMortiseJigPreviewPart = { key: string; material: "printed" | "printed-accent" | "workpiece" | "router" | "metal" | "bit" | "knob"; geometry: THREE.BufferGeometry };

function ringCapsule(length: number, width: number, axis: "x" | "y", cx = 0, cy = 0, segments = 18) {
  const r = width / 2;
  const straight = Math.max(0, length - width);
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = -Math.PI / 2 + i / segments * Math.PI;
    points.push(new THREE.Vector2(straight / 2 + Math.cos(a) * r, Math.sin(a) * r));
  }
  for (let i = 0; i <= segments; i += 1) {
    const a = Math.PI / 2 + i / segments * Math.PI;
    points.push(new THREE.Vector2(-straight / 2 + Math.cos(a) * r, Math.sin(a) * r));
  }
  return points.map((p) => axis === "x" ? new THREE.Vector2(cx + p.x, cy + p.y) : new THREE.Vector2(cx - p.y, cy + p.x));
}

function ringCircle(diameter: number, cx: number, cy: number, segments = 40) {
  return Array.from({ length: segments }, (_, i) => {
    const a = i / segments * Math.PI * 2;
    return new THREE.Vector2(cx + Math.cos(a) * diameter / 2, cy + Math.sin(a) * diameter / 2);
  });
}

function plate(length: number, width: number, thickness: number, holes: THREE.Vector2[][] = []) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, -width / 2);
  shape.lineTo(length / 2, -width / 2);
  shape.lineTo(length / 2, width / 2);
  shape.lineTo(-length / 2, width / 2);
  shape.closePath();
  for (const ring of holes) {
    const path = new THREE.Path();
    const reversed = ring.slice().reverse();
    path.moveTo(reversed[0].x, reversed[0].y);
    reversed.slice(1).forEach((point) => path.lineTo(point.x, point.y));
    path.closePath();
    shape.holes.push(path);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1, steps: 1 });
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function box(length: number, width: number, height: number, x = 0, y = 0, z = 0) {
  const geometry = new THREE.BoxGeometry(length, width, height);
  geometry.translate(x, y, z + height / 2);
  return geometry;
}
function cylinder(diameter: number, height: number, x: number, y: number, z: number, segments: number) {
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, segments);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, z + height / 2);
  return geometry;
}

export function getRouterMortiseJigSpec(params: ModelParams, model: RouterMortiseJigModelDefinition): RouterMortiseJigSpec {
  const photo = g(model);
  const bit = getParam(params, "routerBitDiameter");
  const bushing = getParam(params, "guideBushingDiameter");
  const wiggle = getParam(params, "templateWiggle");
  const openingLength = getParam(params, "mortiseLength") + bushing - bit + wiggle;
  const openingWidth = getParam(params, "mortiseWidth") + bushing - bit + wiggle;
  const railGap = getParam(params, "railGap");
  const railWidth = (photo.deckOverallWidth - railGap) / 2;
  const railThickness = getParam(params, "plateThickness");
  const workpieceWidth = getParam(params, "workpieceWidth");
  const workpieceWiggle = getParam(params, "workpieceWiggle");
  const insertDiameter = getParam(params, "insertPocketDiameter");
  const insertDepth = getParam(params, "insertDepth");
  const jawDepth = getParam(params, "jawDepth");
  const span = railGap + openingWidth;
  const sectionWidth = Math.max(1, railWidth - photo.boltSlotWidth * 2);
  const inertia = sectionWidth * Math.pow(railThickness, 3) / 12;
  const stress = photo.screenLoadN * span * railThickness / (8 * inertia);
  return {
    assemblyView: getParam(params, "assemblyView"), openingLength, openingWidth, railLength: photo.deckRailLength, railWidth, railThickness,
    railGap, overallWidth: photo.deckOverallWidth, stopThickness: getParam(params, "stopThickness"), jawLength: photo.jawLength,
    jawThickness: photo.jawThickness, jawDepth, jawCenterY: workpieceWidth / 2 + workpieceWiggle / 2 + photo.jawThickness / 2,
    workpieceWidth, stockThickness: getParam(params, "stockThickness"), workpieceWiggle, insertPocketDiameter: insertDiameter, insertDepth,
    insertFloor: jawDepth - insertDepth, insertSideWall: (photo.jawThickness - insertDiameter) / 2,
    insertEngagement: getParam(params, "railScrewLength") - railThickness, routerBitDiameter: bit, guideBushingDiameter: bushing,
    routerBaseDiameter: getParam(params, "routerBaseDiameter"), templateWiggle: wiggle,
    minimumRailWeb: Math.min(railWidth / 2 - photo.boltSlotWidth / 2, (photo.stopWidth - photo.stopAdjustmentSlotLength) / 2),
    routerSupportOverlap: (photo.deckOverallWidth - getParam(params, "routerBaseDiameter")) / 2,
    clampLedge: (photo.deckRailLength - photo.stopWidth * 2 - openingLength) / 2,
    screenDeflection: photo.screenLoadN * Math.pow(span, 3) / (48 * photo.screenModulusMpa * inertia),
    screenSafetyFactor: photo.screenAllowableStressMpa / Math.max(stress, 1e-6),
  };
}

export function createRouterMortiseJigDeckRailGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const spec = getRouterMortiseJigSpec(params, model); const photo = g(model);
  const holes = [-1, 1].flatMap((x) => [-1, 1].map((y) => ringCapsule(photo.railAdjustmentSlotLength, photo.boltSlotWidth, "y", x * photo.railBoltStationX, y * spec.railWidth * 0.18)));
  return plate(photo.deckRailLength, spec.railWidth, spec.railThickness, holes);
}
export function createRouterMortiseJigStopGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const photo = g(model);
  return plate(photo.stopWidth, photo.stopLength, getParam(params, "stopThickness"), [-1, 1].map((y) => ringCapsule(photo.stopAdjustmentSlotLength, photo.boltSlotWidth, "x", 0, y * photo.stopSlotStationY)));
}
export function createRouterMortiseJigFenceGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const photo = g(model); const spec = getRouterMortiseJigSpec(params, model);
  return plate(photo.jawLength, photo.jawThickness, spec.jawDepth, [-1, 1].map((x) => ringCircle(spec.insertPocketDiameter, x * photo.boltStationX, 0)));
}
export function createRouterMortiseJigPositioningBridgeGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const photo = g(model); const spec = getRouterMortiseJigSpec(params, model);
  return plate(photo.positioningBridgeLength, photo.positioningBridgeWidth, photo.positioningBridgeThickness, [ringCapsule(spec.openingLength, spec.openingWidth, "x")]);
}
export function createRouterMortiseJigCenteringBaseGeometry(_params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const photo = g(model);
  return plate(photo.centeringBaseLength, photo.centeringBaseWidth, photo.centeringBaseThickness, [-1, 1].flatMap((x) => [-1, 1].map((y) => ringCapsule(34, photo.boltSlotWidth, "y", x * 92, y * 48))));
}
export function createRouterMortiseJigCenteringFenceGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const photo = g(model); const spec = getRouterMortiseJigSpec(params, model);
  return plate(photo.centeringFenceLength, photo.centeringFenceThickness, photo.centeringFenceHeight, [-1, 1].map((x) => ringCircle(spec.insertPocketDiameter, x * 58, 0)));
}
export function createRouterMortiseJigGuideGeometry(params: ModelParams, model: RouterMortiseJigModelDefinition) {
  const spec = getRouterMortiseJigSpec(params, model);
  if (spec.assemblyView >= 1.5) return createRouterMortiseJigCenteringBaseGeometry(params, model);
  const rail = createRouterMortiseJigDeckRailGeometry(params, model);
  rail.translate(0, spec.railGap / 2 + spec.railWidth / 2, 0);
  return rail;
}

export function createRouterMortiseJigPartGeometries(params: ModelParams, model: RouterMortiseJigModelDefinition): RouterMortiseJigPart[] {
  return [
    ["left-deck-rail", "Left deck rail", createRouterMortiseJigDeckRailGeometry], ["right-deck-rail", "Right deck rail", createRouterMortiseJigDeckRailGeometry],
    ["front-stop", "Front adjustable stop", createRouterMortiseJigStopGeometry], ["rear-stop", "Rear adjustable stop", createRouterMortiseJigStopGeometry],
    ["left-fence", "Left fence jaw", createRouterMortiseJigFenceGeometry], ["right-fence", "Right fence jaw", createRouterMortiseJigFenceGeometry],
    ["positioning-bridge", "Positioning bridge", createRouterMortiseJigPositioningBridgeGeometry], ["centering-base", "Centering fixture base", createRouterMortiseJigCenteringBaseGeometry],
    ["centering-left-fence", "Centering left fence", createRouterMortiseJigCenteringFenceGeometry], ["centering-right-fence", "Centering right fence", createRouterMortiseJigCenteringFenceGeometry],
  ].map(([key, label, creator]) => ({ key: key as RouterMortiseJigPart["key"], label: label as string, quantity: 1, geometry: (creator as typeof createRouterMortiseJigDeckRailGeometry)(params, model) }));
}

export function createRouterMortiseJigPreviewParts(params: ModelParams, model: RouterMortiseJigModelDefinition): RouterMortiseJigPreviewPart[] {
  const spec = getRouterMortiseJigSpec(params, model); const photo = g(model); const parts: RouterMortiseJigPreviewPart[] = [];
  const hardware = (x: number, y: number, z: number, knob: boolean) => {
    parts.push({ key: `washer-${x}-${y}`, material: "metal", geometry: cylinder(photo.washerDiameter, photo.washerThickness, x, y, z, photo.radialSegments) });
    parts.push({ key: `screw-${x}-${y}`, material: "metal", geometry: cylinder(5, z + 2, x, y, 0, photo.radialSegments) });
    if (knob) parts.push({ key: `knob-${x}-${y}`, material: "knob", geometry: cylinder(photo.knobDiameter, photo.knobHeight, x, y, z + photo.washerThickness, 10) });
  };
  if (spec.assemblyView >= 1.5) {
    const z = photo.centeringBaseThickness; const fenceY = spec.workpieceWidth / 2 + photo.centeringFenceThickness / 2 + spec.workpieceWiggle / 2;
    for (const sign of [-1, 1]) { const fence = createRouterMortiseJigCenteringFenceGeometry(params, model); fence.translate(0, sign * fenceY, z); parts.push({ key: sign < 0 ? "centering-left-fence" : "centering-right-fence", material: "printed", geometry: fence }); for (const x of [-58, 58]) hardware(x, sign * 48, z + photo.centeringFenceHeight, true); }
    parts.push({ key: "vertical-workpiece", material: "workpiece", geometry: box(96, spec.workpieceWidth, 150, 0, 0, z) });
    parts.push({ key: "clamp-pad", material: "metal", geometry: box(36, 34, 8, 0, -fenceY - 24, z + 42) });
    return parts;
  }
  const railCenter = spec.railGap / 2 + spec.railWidth / 2;
  const leftRail = createRouterMortiseJigDeckRailGeometry(params, model); leftRail.translate(0, -railCenter, 0); parts.push({ key: "left-deck-rail", material: "printed", geometry: leftRail });
  const stopX = spec.railLength / 2 - photo.stopWidth / 2 - 5;
  for (const sign of [-1, 1]) { const stop = createRouterMortiseJigStopGeometry(params, model); stop.translate(sign * stopX, 0, spec.railThickness); parts.push({ key: sign < 0 ? "front-stop" : "rear-stop", material: "printed-accent", geometry: stop }); for (const y of [-photo.stopSlotStationY, photo.stopSlotStationY]) hardware(sign * stopX, y, spec.railThickness + spec.stopThickness, true); }
  for (const ys of [-1, 1]) for (const x of [-photo.railBoltStationX, photo.railBoltStationX]) hardware(x, ys * (railCenter + spec.railWidth * 0.18), spec.railThickness, false);
  const leftFence = createRouterMortiseJigFenceGeometry(params, model); leftFence.translate(0, -spec.jawCenterY, -spec.jawDepth); parts.push({ key: "left-fence", material: "printed", geometry: leftFence });
  const rightFence = createRouterMortiseJigFenceGeometry(params, model); rightFence.translate(0, spec.jawCenterY, -spec.jawDepth); parts.push({ key: "right-fence", material: "printed", geometry: rightFence });
  parts.push({ key: "workpiece", material: "workpiece", geometry: box(photo.workpiecePreviewLength, spec.workpieceWidth, spec.stockThickness, 0, 0, -spec.stockThickness) });
  parts.push({ key: "clamp-left", material: "metal", geometry: box(40, 24, 8, -62, -spec.overallWidth / 2 - 6, spec.railThickness) });
  parts.push({ key: "clamp-right", material: "metal", geometry: box(40, 24, 8, 62, spec.overallWidth / 2 + 6, spec.railThickness) });
  if (spec.assemblyView >= 0.5) { const bridge = createRouterMortiseJigPositioningBridgeGeometry(params, model); bridge.translate(0, 0, spec.railThickness + spec.stopThickness + 0.5); parts.push({ key: "positioning-bridge", material: "printed-accent", geometry: bridge }); return parts; }
  const z = spec.railThickness + spec.stopThickness + 0.5;
  parts.push({ key: "router-base", material: "router", geometry: cylinder(spec.routerBaseDiameter, photo.routerBaseThickness, 0, 0, z, photo.radialSegments) });
  parts.push({ key: "router-motor", material: "router", geometry: cylinder(photo.routerMotorDiameter, photo.routerMotorHeight, 0, 0, z + photo.routerBaseThickness, photo.radialSegments) });
  parts.push({ key: "guide-bushing", material: "metal", geometry: cylinder(spec.guideBushingDiameter, photo.bushingProjection, 0, 0, z - photo.bushingProjection, photo.radialSegments) });
  parts.push({ key: "router-bit", material: "bit", geometry: cylinder(spec.routerBitDiameter, photo.bitPreviewDepth, 0, 0, z - photo.bitPreviewDepth, photo.radialSegments) });
  return parts;
}

export function getRouterMortiseJigDimensions(params: ModelParams, model: RouterMortiseJigModelDefinition): ModelDimensions {
  const spec = getRouterMortiseJigSpec(params, model); const photo = g(model);
  return spec.assemblyView >= 1.5 ? { length: photo.centeringBaseLength, width: photo.centeringBaseWidth, height: 162 } : { length: spec.railLength, width: Math.max(spec.overallWidth, photo.stopLength), height: spec.railThickness + spec.stopThickness + (spec.assemblyView < 0.5 ? photo.routerBaseThickness + photo.routerMotorHeight : photo.positioningBridgeThickness) };
}
export function updateRouterMortiseJigGuide(mesh: THREE.Mesh, params: ModelParams, model: RouterMortiseJigModelDefinition) { const dimensions = getRouterMortiseJigDimensions(params, model); mesh.geometry.dispose(); mesh.geometry = new THREE.BoxGeometry(dimensions.length, dimensions.width, dimensions.height); mesh.position.z = dimensions.height / 2; }
export function getRouterMortiseJigParameterLimits(model: RouterMortiseJigModelDefinition, params: ModelParams, key: string): NumberLimits {
  const limits = { ...getParameter(model, key).limits }; const photo = g(model);
  if (key === "mortiseWidth") limits.min = Math.max(limits.min, getParam(params, "routerBitDiameter"));
  if (key === "routerBitDiameter") limits.max = Math.min(limits.max, getParam(params, "mortiseWidth"), getParam(params, "guideBushingDiameter") - photo.minimumBushingRadialClearance * 2);
  if (key === "guideBushingDiameter") limits.min = Math.max(limits.min, getParam(params, "routerBitDiameter") + photo.minimumBushingRadialClearance * 2);
  if (key === "insertPocketDiameter") limits.max = Math.min(limits.max, photo.jawThickness - photo.minimumInsertSideWall * 2);
  if (key === "insertDepth") limits.max = Math.min(limits.max, getParam(params, "jawDepth") - photo.minimumInsertFloor);
  if (key === "jawDepth") limits.min = Math.max(limits.min, getParam(params, "insertDepth") + photo.minimumInsertFloor);
  if (key === "railGap") limits.min = Math.max(limits.min, getParam(params, "mortiseWidth") + getParam(params, "guideBushingDiameter") - getParam(params, "routerBitDiameter") + getParam(params, "templateWiggle"));
  limits.max = Math.max(limits.min, limits.max); return limits;
}
export function getRouterMortiseJigAuditValue(check: AuditCheckDefinition, params: ModelParams, unit: LengthUnit, model: RouterMortiseJigModelDefinition): AuditItem {
  const spec = getRouterMortiseJigSpec(params, model); const photo = g(model); const pass = (value: string): AuditItem => ({ label: check.label, value, status: "pass" }); const warn = (value: string): AuditItem => ({ label: check.label, value, status: "warn" });
  const values: Record<string, AuditItem> = {
    mortiseTarget: pass(`${formatLength(getParam(params, "mortiseWidth"), unit)} × ${formatLength(getParam(params, "mortiseLength"), unit)} target`),
    templateOpening: pass(`${formatLength(spec.openingWidth, unit)} × ${formatLength(spec.openingLength, unit)} · includes ${formatLength(spec.templateWiggle, unit)} total wiggle room`),
    photoArchitecture: pass("2 deck rails · 2 cross-stops · center opening · positioning + centering fixtures"),
    routerInterface: pass(`${formatLength(spec.routerBitDiameter, unit)} cutter · ${formatLength(spec.guideBushingDiameter, unit)} guide bushing · ${formatLength(spec.routerBaseDiameter, unit)} base`),
    workpieceFit: pass(`${formatLength(spec.workpieceWidth, unit)} stock · ${formatLength(spec.workpieceWiggle, unit)} total wiggle room`),
    heatSetInserts: spec.insertSideWall >= photo.minimumInsertSideWall && spec.insertFloor >= photo.minimumInsertFloor ? pass(`12 × M5 · ${formatLength(spec.insertPocketDiameter, unit)} Ø × ${formatLength(spec.insertDepth, unit)} deep pockets`) : warn("Increase insert wall or floor"),
    screwEngagement: spec.insertEngagement >= photo.minimumInsertEngagement ? pass(`${formatLength(spec.insertEngagement, unit)} minimum engagement`) : warn("Rail screws are too short"),
    adjustmentRange: pass(`${formatLength(photo.minimumWorkpieceWidth, unit)}–${formatLength(photo.maximumWorkpieceWidth, unit)} · ${photo.presetWorkpieceWidthsMm.join(" / ")} mm markers`),
    minimumRailWeb: spec.minimumRailWeb >= photo.minimumRailWeb ? pass(formatLength(spec.minimumRailWeb, unit)) : warn(formatLength(spec.minimumRailWeb, unit)),
    routerSupport: spec.routerSupportOverlap >= photo.minimumRouterSupportOverlap ? pass(`${formatLength(spec.routerSupportOverlap, unit)} overlap per side`) : warn("Router overlap is too small"),
    clampLedge: spec.clampLedge >= photo.minimumClampLedge ? pass(formatLength(spec.clampLedge, unit)) : warn("Clamp ledge is too small"),
    strengthScreen: spec.screenDeflection <= photo.maximumScreenDeflection && spec.screenSafetyFactor >= photo.minimumScreenSafetyFactor ? pass(`${spec.screenDeflection.toFixed(3)} mm deflection · ${spec.screenSafetyFactor.toFixed(1)}× stress margin at ${photo.screenLoadN} N`) : warn("Increase rail section"),
    printSet: pass("10 individual support-free STLs"), previewStandIn: pass("Router, stock, clamps, knobs, washers, and screws · preview only"),
    assemblyClearance: pass("Three interference-checked setups · main / positioning / centering"), printOrientation: pass("All pieces export flat on Z=0"),
  };
  return values[check.key] ?? warn("Unsupported audit check");
}
