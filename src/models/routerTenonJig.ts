import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  RouterTenonJigModelDefinition,
} from "./types";

const EPSILON = 1e-6;
type Point = THREE.Vector2;

export type RouterTenonJigSpec = {
  baseLength: number;
  baseWidth: number;
  baseThickness: number;
  platformThickness: number;
  throatWidth: number;
  throatThickness: number;
  plateThickness: number;
  cheekPlateLength: number;
  cheekPlateWidth: number;
  edgePlateLength: number;
  edgePlateWidth: number;
  tenonWidth: number;
  tenonThickness: number;
  tenonLength: number;
  workpieceWidth: number;
  workpieceThickness: number;
  cutterDiameter: number;
  bearingDiameter: number;
  tenonAllowance: number;
  guideOpeningWidth: number;
  guideOpeningThickness: number;
  activeGuidePair: "width" | "thickness";
  cheekGuideCenterX: number;
  edgeGuideCenterY: number;
  insertPocketDiameter: number;
  insertDepth: number;
  insertFloor: number;
  minimumInsertWeb: number;
  screwEngagement: number;
  screwTipClearance: number;
  slotTravelMargin: number;
  minimumPlateWeb: number;
  minimumBaseWeb: number;
  clampLedge: number;
  routerSupportOverlap: number;
  routerSupportRequiredDiameter: number;
  baseScreenDeflection: number;
  baseScreenStress: number;
  baseScreenSafetyFactor: number;
  guideScreenSpan: number;
  guideScreenDeflection: number;
  guideScreenStress: number;
  guideScreenSafetyFactor: number;
  shoulderWidth: number;
  shoulderThickness: number;
  routerBaseDiameter: number;
};

export type RouterTenonJigPart = {
  key:
    | "base-bridge"
    | "left-cheek-guide"
    | "right-cheek-guide"
    | "front-edge-guide"
    | "rear-edge-guide";
  label: string;
  quantity: number;
  geometry: THREE.BufferGeometry;
};

export type RouterTenonJigPreviewPart = {
  key: string;
  material: "printed" | "workpiece" | "tenon" | "router" | "metal" | "bit";
  geometry: THREE.BufferGeometry;
};

function roundedRectangleRing(
  length: number,
  width: number,
  radius: number,
  cornerSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const safeRadius = Math.max(
    EPSILON,
    Math.min(radius, halfLength - EPSILON, halfWidth - EPSILON),
  );
  const corners = [
    { x: halfLength - safeRadius, y: -halfWidth + safeRadius, start: -Math.PI / 2 },
    { x: halfLength - safeRadius, y: halfWidth - safeRadius, start: 0 },
    { x: -halfLength + safeRadius, y: halfWidth - safeRadius, start: Math.PI / 2 },
    { x: -halfLength + safeRadius, y: -halfWidth + safeRadius, start: Math.PI },
  ];
  return corners.flatMap((corner) =>
    Array.from({ length: cornerSegments }, (_, index) => {
      const angle = corner.start + (index / (cornerSegments - 1)) * Math.PI / 2;
      return new THREE.Vector2(
        centerX + corner.x + Math.cos(angle) * safeRadius,
        centerY + corner.y + Math.sin(angle) * safeRadius,
      );
    }),
  );
}

function circleRing(radius: number, segments: number, centerX = 0, centerY = 0) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    );
  });
}

function capsuleRing(
  length: number,
  width: number,
  axis: "x" | "y",
  arcSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const radius = width / 2;
  const straight = Math.max(0, length - width);
  const points: Point[] = [];
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = -Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        -straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  return points.map((point) =>
    axis === "x"
      ? new THREE.Vector2(centerX + point.x, centerY + point.y)
      : new THREE.Vector2(centerX - point.y, centerY + point.x),
  );
}

function crossRing(
  horizontalLength: number,
  horizontalWidth: number,
  verticalLength: number,
  verticalWidth: number,
) {
  const horizontalHalf = horizontalLength / 2;
  const horizontalBandHalf = horizontalWidth / 2;
  const verticalHalf = verticalLength / 2;
  const verticalBandHalf = verticalWidth / 2;
  return [
    new THREE.Vector2(-verticalBandHalf, -verticalHalf),
    new THREE.Vector2(verticalBandHalf, -verticalHalf),
    new THREE.Vector2(verticalBandHalf, -horizontalBandHalf),
    new THREE.Vector2(horizontalHalf, -horizontalBandHalf),
    new THREE.Vector2(horizontalHalf, horizontalBandHalf),
    new THREE.Vector2(verticalBandHalf, horizontalBandHalf),
    new THREE.Vector2(verticalBandHalf, verticalHalf),
    new THREE.Vector2(-verticalBandHalf, verticalHalf),
    new THREE.Vector2(-verticalBandHalf, horizontalBandHalf),
    new THREE.Vector2(-horizontalHalf, horizontalBandHalf),
    new THREE.Vector2(-horizontalHalf, -horizontalBandHalf),
    new THREE.Vector2(-verticalBandHalf, -horizontalBandHalf),
  ];
}

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addRingBridge(
  positions: number[],
  lower: Point[],
  upper: Point[],
  lowerZ: number,
  upperZ: number,
  inward = false,
) {
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    const a = new THREE.Vector3(lower[index].x, lower[index].y, lowerZ);
    const b = new THREE.Vector3(lower[next].x, lower[next].y, lowerZ);
    const c = new THREE.Vector3(upper[next].x, upper[next].y, upperZ);
    const d = new THREE.Vector3(upper[index].x, upper[index].y, upperZ);
    if (inward) {
      addTriangle(positions, a, c, b);
      addTriangle(positions, a, d, c);
    } else {
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }
}

function addHorizontalFace(
  positions: number[],
  contour: Point[],
  holes: Point[][],
  z: number,
  upward: boolean,
) {
  const outer = contour.slice().reverse().map((point) => point.clone());
  const inner = holes.map((hole) => hole.map((point) => point.clone()));
  const triangles = THREE.ShapeUtils.triangulateShape(outer, inner);
  const points = [...outer, ...inner.flat()];
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = new THREE.Vector3(points[aIndex].x, points[aIndex].y, z);
    const b = new THREE.Vector3(points[bIndex].x, points[bIndex].y, z);
    const c = new THREE.Vector3(points[cIndex].x, points[cIndex].y, z);
    const cross = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a)).z;
    if ((cross > 0) === upward) addTriangle(positions, a, b, c);
    else addTriangle(positions, a, c, b);
  }
}

function buildGeometry(positions: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function orientCylinderAlongZ(geometry: THREE.BufferGeometry) {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function getRouterTenonJigSpec(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
): RouterTenonJigSpec {
  const tenonWidth = getParam(params, "tenonWidth");
  const tenonThickness = getParam(params, "tenonThickness");
  const cutterDiameter = getParam(params, "routerCutterDiameter");
  const bearingDiameter = getParam(params, "guideBearingDiameter");
  const tenonAllowance = getParam(params, "tenonAllowance");
  const guideOpeningWidth =
    tenonWidth - bearingDiameter + cutterDiameter + tenonAllowance;
  const guideOpeningThickness =
    tenonThickness - bearingDiameter + cutterDiameter + tenonAllowance;
  const insertPocketDiameter = getParam(params, "insertPocketDiameter");
  const baseThickness = getParam(params, "baseThickness");
  const plateThickness = getParam(params, "guidePlateThickness");
  const insertDepth = getParam(params, "insertDepth");
  const pocketRadius = insertPocketDiameter / 2;
  const minimumInsertWeb = Math.min(
    model.geometry.horizontalRecessWidth / 2 -
      model.geometry.cheekInsertY -
      pocketRadius,
    model.geometry.verticalRecessWidth / 2 -
      model.geometry.edgeInsertX -
      pocketRadius,
    model.geometry.cheekInsertY -
      model.geometry.throatThickness / 2 -
      pocketRadius,
    model.geometry.edgeInsertY -
      model.geometry.throatThickness / 2 -
      pocketRadius,
  );
  const cheekGuideCenterX =
    guideOpeningWidth / 2 + model.geometry.cheekPlateLength / 2;
  const edgeGuideCenterY =
    guideOpeningThickness / 2 + model.geometry.edgePlateWidth / 2;
  const cheekScrewLocalX = model.geometry.cheekInsertX - cheekGuideCenterX;
  const edgeScrewLocalY = model.geometry.edgeInsertY - edgeGuideCenterY;
  const cheekTravelMargin =
    (model.geometry.adjustmentSlotLength - 5) / 2 -
    Math.abs(cheekScrewLocalX - model.geometry.cheekSlotCenterLocalX);
  const edgeTravelMargin =
    (model.geometry.edgeAdjustmentSlotLength - 5) / 2 -
    Math.abs(edgeScrewLocalY - model.geometry.edgeSlotCenterLocalY);
  const activeGuidePair =
    getParam(params, "activeGuidePair") >= 0.5 ? "thickness" : "width";
  const routerCenterX =
    activeGuidePair === "width"
      ? guideOpeningWidth / 2 + bearingDiameter / 2
      : 0;
  const routerCenterY =
    activeGuidePair === "thickness"
      ? guideOpeningThickness / 2 + bearingDiameter / 2
      : 0;
  const cornerStartX = model.geometry.verticalRecessWidth / 2;
  const cornerStartY = model.geometry.horizontalRecessWidth / 2;
  const distanceToRaisedCorner = Math.hypot(
    Math.max(0, cornerStartX - Math.abs(routerCenterX)),
    Math.max(0, cornerStartY - Math.abs(routerCenterY)),
  );
  const routerBaseDiameter = getParam(params, "routerBaseDiameter");
  const routerSupportOverlap =
    routerBaseDiameter / 2 - distanceToRaisedCorner;
  const effectiveBeamWidth =
    (model.geometry.baseWidth - model.geometry.throatThickness) / 2 -
    insertPocketDiameter;
  const beamMoment = (effectiveBeamWidth * baseThickness ** 3) / 12;
  const baseScreenDeflection =
    (model.geometry.screenLoadN * model.geometry.throatWidth ** 3) /
    (48 * model.geometry.screenModulusMpa * beamMoment);
  const baseScreenStress =
    (3 * model.geometry.screenLoadN * model.geometry.throatWidth) /
    (2 * effectiveBeamWidth * baseThickness ** 2);
  const cheekGuideSpan =
    model.geometry.throatWidth / 2 - guideOpeningWidth / 2;
  const edgeGuideSpan =
    model.geometry.throatThickness / 2 - guideOpeningThickness / 2;
  const cheekGuideBeamWidth =
    model.geometry.cheekPlateWidth - 2 * model.geometry.boltSlotWidth;
  const edgeGuideBeamWidth =
    model.geometry.edgePlateLength - 2 * model.geometry.boltSlotWidth;
  const guideScreens = [
    { span: cheekGuideSpan, width: cheekGuideBeamWidth },
    { span: edgeGuideSpan, width: edgeGuideBeamWidth },
  ].map(({ span, width }) => {
    const moment = (width * plateThickness ** 3) / 12;
    const deflection =
      (model.geometry.screenLoadN * span ** 3) /
      (3 * model.geometry.screenModulusMpa * moment);
    const stress =
      (6 * model.geometry.screenLoadN * span) /
      (width * plateThickness ** 2);
    return { deflection, span, stress };
  });
  const worstGuideDeflection = Math.max(
    ...guideScreens.map(({ deflection }) => deflection),
  );
  const worstGuideStress = Math.max(
    ...guideScreens.map(({ stress }) => stress),
  );
  const screwEngagement =
    getParam(params, "knobScrewLength") -
    model.geometry.washerThickness -
    plateThickness;
  return {
    baseLength: model.geometry.baseLength,
    baseWidth: model.geometry.baseWidth,
    baseThickness,
    platformThickness: baseThickness + plateThickness,
    throatWidth: model.geometry.throatWidth,
    throatThickness: model.geometry.throatThickness,
    plateThickness,
    cheekPlateLength: model.geometry.cheekPlateLength,
    cheekPlateWidth: model.geometry.cheekPlateWidth,
    edgePlateLength: model.geometry.edgePlateLength,
    edgePlateWidth: model.geometry.edgePlateWidth,
    tenonWidth,
    tenonThickness,
    tenonLength: getParam(params, "tenonLength"),
    workpieceWidth: getParam(params, "workpieceWidth"),
    workpieceThickness: getParam(params, "workpieceThickness"),
    cutterDiameter,
    bearingDiameter,
    tenonAllowance,
    guideOpeningWidth,
    guideOpeningThickness,
    activeGuidePair,
    cheekGuideCenterX,
    edgeGuideCenterY,
    insertPocketDiameter,
    insertDepth,
    insertFloor: baseThickness - insertDepth,
    minimumInsertWeb,
    screwEngagement,
    screwTipClearance: insertDepth - screwEngagement,
    slotTravelMargin: Math.min(cheekTravelMargin, edgeTravelMargin),
    minimumPlateWeb: Math.min(
      model.geometry.cheekPlateWidth / 2 -
        model.geometry.cheekInsertY -
        model.geometry.boltSlotWidth / 2,
      model.geometry.edgePlateLength / 2 -
        model.geometry.edgeInsertX -
        model.geometry.boltSlotWidth / 2,
      model.geometry.cheekPlateLength / 2 -
        (model.geometry.cheekSlotCenterLocalX +
          model.geometry.adjustmentSlotLength / 2),
      model.geometry.edgePlateWidth / 2 -
        (model.geometry.edgeSlotCenterLocalY +
          model.geometry.edgeAdjustmentSlotLength / 2),
    ),
    minimumBaseWeb: Math.min(
      (model.geometry.baseLength - model.geometry.throatWidth) / 2,
      (model.geometry.baseWidth - model.geometry.throatThickness) / 2,
      minimumInsertWeb,
    ),
    clampLedge:
      (model.geometry.baseWidth - model.geometry.verticalRecessLength) / 2,
    routerSupportOverlap,
    routerSupportRequiredDiameter:
      2 *
      (distanceToRaisedCorner + model.geometry.minimumRouterSupportOverlap),
    baseScreenDeflection,
    baseScreenStress,
    baseScreenSafetyFactor:
      model.geometry.screenAllowableStressMpa / baseScreenStress,
    guideScreenSpan: Math.max(...guideScreens.map(({ span }) => span)),
    guideScreenDeflection: worstGuideDeflection,
    guideScreenStress: worstGuideStress,
    guideScreenSafetyFactor:
      model.geometry.screenAllowableStressMpa / worstGuideStress,
    shoulderWidth: (getParam(params, "workpieceWidth") - tenonWidth) / 2,
    shoulderThickness: (getParam(params, "workpieceThickness") - tenonThickness) / 2,
    routerBaseDiameter,
  };
}

function insertCenters(model: RouterTenonJigModelDefinition) {
  return [
    ...[-1, 1].flatMap((xSign) =>
      [-1, 1].map((ySign) => ({
        x: xSign * model.geometry.cheekInsertX,
        y: ySign * model.geometry.cheekInsertY,
      })),
    ),
    ...[-1, 1].flatMap((ySign) =>
      [-1, 1].map((xSign) => ({
        x: xSign * model.geometry.edgeInsertX,
        y: ySign * model.geometry.edgeInsertY,
      })),
    ),
  ];
}

export function createRouterTenonJigBaseGeometry(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
) {
  const spec = getRouterTenonJigSpec(params, model);
  const outer = roundedRectangleRing(
    spec.baseLength,
    spec.baseWidth,
    model.geometry.baseCornerRadius,
    model.geometry.cornerSegments,
  );
  const throat = roundedRectangleRing(
    spec.throatWidth,
    spec.throatThickness,
    model.geometry.throatCornerRadius,
    model.geometry.cornerSegments,
  );
  const recess = crossRing(
    model.geometry.horizontalRecessLength,
    model.geometry.horizontalRecessWidth,
    model.geometry.verticalRecessLength,
    model.geometry.verticalRecessWidth,
  );
  const nominalPockets = insertCenters(model).map(({ x, y }) =>
    circleRing(spec.insertPocketDiameter / 2, model.geometry.radialSegments, x, y),
  );
  const entryPockets = insertCenters(model).map(({ x, y }) =>
    circleRing(
      spec.insertPocketDiameter / 2 + model.geometry.insertLeadIn,
      model.geometry.radialSegments,
      x,
      y,
    ),
  );
  const leadInHeight = Math.min(model.geometry.insertLeadIn, spec.insertDepth / 2);
  const positions: number[] = [];
  addHorizontalFace(positions, outer, [throat], 0, false);
  addRingBridge(positions, outer, outer, 0, spec.platformThickness);
  addRingBridge(positions, throat, throat, 0, spec.baseThickness, true);
  addHorizontalFace(
    positions,
    recess,
    [throat, ...entryPockets],
    spec.baseThickness,
    true,
  );
  addRingBridge(
    positions,
    recess,
    recess,
    spec.baseThickness,
    spec.platformThickness,
    true,
  );
  addHorizontalFace(
    positions,
    outer,
    [recess],
    spec.platformThickness,
    true,
  );
  nominalPockets.forEach((pocket, index) => {
    addHorizontalFace(positions, pocket, [], spec.insertFloor, true);
    addRingBridge(
      positions,
      pocket,
      pocket,
      spec.insertFloor,
      spec.baseThickness - leadInHeight,
      true,
    );
    addRingBridge(
      positions,
      pocket,
      entryPockets[index],
      spec.baseThickness - leadInHeight,
      spec.baseThickness,
      true,
    );
  });
  return buildGeometry(positions);
}

function createThroughPlate(
  length: number,
  width: number,
  thickness: number,
  holes: Point[][],
  model: RouterTenonJigModelDefinition,
) {
  const outer = roundedRectangleRing(
    length,
    width,
    model.geometry.plateCornerRadius,
    model.geometry.cornerSegments,
  );
  const positions: number[] = [];
  addHorizontalFace(positions, outer, holes, 0, false);
  addRingBridge(positions, outer, outer, 0, thickness);
  holes.forEach((hole) => addRingBridge(positions, hole, hole, 0, thickness, true));
  addHorizontalFace(positions, outer, holes, thickness, true);
  return buildGeometry(positions);
}

function cheekPresetMarkerRings(
  sideSign: -1 | 1,
  model: RouterTenonJigModelDefinition,
  params: ModelParams,
) {
  const cutter = getParam(params, "routerCutterDiameter");
  const bearing = getParam(params, "guideBearingDiameter");
  const allowance = getParam(params, "tenonAllowance");
  return model.geometry.presetTenonWidthsMm.flatMap((tenonWidth) => {
    const opening = tenonWidth - bearing + cutter + allowance;
    const guideCenter = sideSign * (opening / 2 + model.geometry.cheekPlateLength / 2);
    const screwX = sideSign * model.geometry.cheekInsertX;
    const localX = screwX - guideCenter;
    return [-1, 1].map((ySign) =>
      capsuleRing(
        model.geometry.markerLength,
        model.geometry.markerWidth,
        "y",
        model.geometry.markerArcSegments,
        localX,
        ySign * (model.geometry.cheekInsertY - 8),
      ),
    );
  });
}

export function createRouterTenonJigCheekGuideGeometry(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
  sideSign: -1 | 1,
) {
  const spec = getRouterTenonJigSpec(params, model);
  const holes = [
    ...[-1, 1].map((ySign) =>
      capsuleRing(
        model.geometry.adjustmentSlotLength,
        model.geometry.boltSlotWidth,
        "x",
        model.geometry.slotArcSegments,
        sideSign * model.geometry.cheekSlotCenterLocalX,
        ySign * model.geometry.cheekInsertY,
      ),
    ),
    ...cheekPresetMarkerRings(sideSign, model, params),
  ];
  return createThroughPlate(
    spec.cheekPlateLength,
    spec.cheekPlateWidth,
    spec.plateThickness,
    holes,
    model,
  );
}

function edgePresetMarkerRings(
  sideSign: -1 | 1,
  model: RouterTenonJigModelDefinition,
  params: ModelParams,
) {
  const cutter = getParam(params, "routerCutterDiameter");
  const bearing = getParam(params, "guideBearingDiameter");
  const allowance = getParam(params, "tenonAllowance");
  return model.geometry.presetTenonThicknessesMm.flatMap((tenonThickness) => {
    const opening = tenonThickness - bearing + cutter + allowance;
    const guideCenter = sideSign * (opening / 2 + model.geometry.edgePlateWidth / 2);
    const screwY = sideSign * model.geometry.edgeInsertY;
    const localY = screwY - guideCenter;
    return [-1, 1].map((xSign) =>
      capsuleRing(
        model.geometry.markerLength,
        model.geometry.markerWidth,
        "x",
        model.geometry.markerArcSegments,
        xSign * (model.geometry.edgeInsertX - 8),
        localY,
      ),
    );
  });
}

export function createRouterTenonJigEdgeGuideGeometry(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
  sideSign: -1 | 1,
) {
  const spec = getRouterTenonJigSpec(params, model);
  const holes = [
    ...[-1, 1].map((xSign) =>
      capsuleRing(
        model.geometry.edgeAdjustmentSlotLength,
        model.geometry.boltSlotWidth,
        "y",
        model.geometry.slotArcSegments,
        xSign * model.geometry.edgeInsertX,
        sideSign * model.geometry.edgeSlotCenterLocalY,
      ),
    ),
    ...edgePresetMarkerRings(sideSign, model, params),
  ];
  return createThroughPlate(
    spec.edgePlateLength,
    spec.edgePlateWidth,
    spec.plateThickness,
    holes,
    model,
  );
}

export function createRouterTenonJigPartGeometries(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
): RouterTenonJigPart[] {
  return [
    { key: "base-bridge", label: "Base bridge", quantity: 1, geometry: createRouterTenonJigBaseGeometry(params, model) },
    { key: "left-cheek-guide", label: "Left cheek guide", quantity: 1, geometry: createRouterTenonJigCheekGuideGeometry(params, model, -1) },
    { key: "right-cheek-guide", label: "Right cheek guide", quantity: 1, geometry: createRouterTenonJigCheekGuideGeometry(params, model, 1) },
    { key: "front-edge-guide", label: "Front edge guide", quantity: 1, geometry: createRouterTenonJigEdgeGuideGeometry(params, model, -1) },
    { key: "rear-edge-guide", label: "Rear edge guide", quantity: 1, geometry: createRouterTenonJigEdgeGuideGeometry(params, model, 1) },
  ];
}

export function createRouterTenonJigPreviewParts(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
): RouterTenonJigPreviewPart[] {
  const spec = getRouterTenonJigSpec(params, model);
  const parts: RouterTenonJigPreviewPart[] = [];
  for (const sideSign of [-1, 1] as const) {
    if (spec.activeGuidePair === "width") {
      const cheek = createRouterTenonJigCheekGuideGeometry(params, model, sideSign);
      cheek.translate(
        sideSign * spec.cheekGuideCenterX,
        0,
        spec.baseThickness,
      );
      parts.push({
        key: sideSign < 0 ? "left-cheek-guide" : "right-cheek-guide",
        material: "printed",
        geometry: cheek,
      });
    } else {
      const edge = createRouterTenonJigEdgeGuideGeometry(params, model, sideSign);
      edge.translate(0, sideSign * spec.edgeGuideCenterY, spec.baseThickness);
      parts.push({
        key: sideSign < 0 ? "front-edge-guide" : "rear-edge-guide",
        material: "printed",
        geometry: edge,
      });
    }
  }

  const guideTop = spec.platformThickness;
  const stockHeight = model.geometry.workpiecePreviewHeight;
  const stock = new THREE.BoxGeometry(
    spec.workpieceWidth,
    spec.workpieceThickness,
    stockHeight,
  );
  stock.translate(
    0,
    0,
    spec.baseThickness - spec.tenonLength - stockHeight / 2,
  );
  parts.push({ key: "workpiece-stock", material: "workpiece", geometry: stock });

  const tenon = new THREE.BoxGeometry(
    spec.tenonWidth,
    spec.tenonThickness,
    spec.tenonLength,
  );
  tenon.translate(0, 0, spec.baseThickness - spec.tenonLength / 2);
  parts.push({ key: "finished-tenon", material: "tenon", geometry: tenon });

  const routerX =
    spec.activeGuidePair === "width"
      ? spec.guideOpeningWidth / 2 + spec.bearingDiameter / 2
      : 0;
  const routerY =
    spec.activeGuidePair === "thickness"
      ? spec.guideOpeningThickness / 2 + spec.bearingDiameter / 2
      : 0;
  const baseGap = 0;
  const routerBase = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.routerBaseDiameter / 2,
      spec.routerBaseDiameter / 2,
      model.geometry.routerBaseThickness,
      model.geometry.radialSegments,
    ),
  );
  routerBase.translate(
    routerX,
    routerY,
    guideTop + baseGap + model.geometry.routerBaseThickness / 2,
  );
  parts.push({ key: "router-base", material: "router", geometry: routerBase });

  const motor = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      model.geometry.routerMotorDiameter / 2,
      model.geometry.routerMotorDiameter / 2,
      model.geometry.routerMotorHeight,
      model.geometry.radialSegments,
    ),
  );
  motor.translate(
    routerX,
    routerY,
    guideTop + baseGap + model.geometry.routerBaseThickness + model.geometry.routerMotorHeight / 2,
  );
  parts.push({ key: "router-motor", material: "router", geometry: motor });

  const hoseBand = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      model.geometry.routerMotorDiameter / 2 + 1.8,
      model.geometry.routerMotorDiameter / 2 + 1.8,
      model.geometry.hoseBandHeight,
      model.geometry.radialSegments,
      1,
      true,
    ),
  );
  hoseBand.translate(
    routerX,
    routerY,
    guideTop + baseGap + model.geometry.routerBaseThickness + model.geometry.routerMotorHeight * 0.28,
  );
  parts.push({ key: "depth-stop-band", material: "metal", geometry: hoseBand });

  const bearing = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.bearingDiameter / 2,
      spec.bearingDiameter / 2,
      model.geometry.bearingHeight,
      model.geometry.radialSegments,
    ),
  );
  bearing.translate(
    routerX,
    routerY,
    guideTop - model.geometry.bearingHeight / 2,
  );
  parts.push({ key: "guide-bearing", material: "metal", geometry: bearing });

  const cutterLength = Math.min(spec.tenonLength, model.geometry.cutterPreviewLength);
  const cutter = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.cutterDiameter / 2,
      spec.cutterDiameter / 2,
      cutterLength,
      model.geometry.radialSegments,
    ),
  );
  cutter.translate(
    routerX,
    routerY,
    spec.baseThickness - cutterLength / 2,
  );
  parts.push({ key: "router-cutter", material: "bit", geometry: cutter });

  for (const [index, center] of insertCenters(model).entries()) {
    const insert = orientCylinderAlongZ(
      new THREE.CylinderGeometry(
        spec.insertPocketDiameter / 2 - 0.2,
        spec.insertPocketDiameter / 2 - 0.2,
        spec.insertDepth,
        model.geometry.radialSegments,
      ),
    );
    insert.translate(center.x, center.y, spec.baseThickness - spec.insertDepth / 2);
    parts.push({ key: `m5-insert-${index + 1}`, material: "metal", geometry: insert });
  }
  const activeCenters = insertCenters(model).slice(
    spec.activeGuidePair === "width" ? 0 : 4,
    spec.activeGuidePair === "width" ? 4 : 8,
  );
  for (const [index, center] of activeCenters.entries()) {
    const washer = orientCylinderAlongZ(
      new THREE.CylinderGeometry(
        model.geometry.washerDiameter / 2,
        model.geometry.washerDiameter / 2,
        model.geometry.washerThickness,
        model.geometry.radialSegments,
      ),
    );
    washer.translate(
      center.x,
      center.y,
      spec.platformThickness + model.geometry.washerThickness / 2,
    );
    parts.push({ key: `active-washer-${index + 1}`, material: "metal", geometry: washer });

    const screw = orientCylinderAlongZ(
      new THREE.CylinderGeometry(2.5, 2.5, spec.screwEngagement + spec.plateThickness, 24),
    );
    screw.translate(
      center.x,
      center.y,
      spec.platformThickness - (spec.screwEngagement + spec.plateThickness) / 2,
    );
    parts.push({ key: `active-screw-${index + 1}`, material: "metal", geometry: screw });
  }
  return parts;
}

export function getRouterTenonJigDimensions(
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
): ModelDimensions {
  const spec = getRouterTenonJigSpec(params, model);
  return {
    length: Math.max(spec.baseLength, spec.routerBaseDiameter),
    width: Math.max(spec.baseWidth, spec.routerBaseDiameter),
    height:
      spec.platformThickness +
      model.geometry.routerBaseThickness +
      model.geometry.routerMotorHeight +
      5,
  };
}

export function updateRouterTenonJigGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: RouterTenonJigModelDefinition,
) {
  const spec = getRouterTenonJigSpec(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    spec.baseLength,
    spec.baseWidth,
    spec.platformThickness,
  );
  mesh.position.z = spec.platformThickness / 2;
}

export function getRouterTenonJigParameterLimits(
  model: RouterTenonJigModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const cutter = getParam(params, "routerCutterDiameter");
  const bearing = getParam(params, "guideBearingDiameter");
  const allowance = getParam(params, "tenonAllowance");
  if (key === "tenonWidth") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumGuideOpening + bearing - cutter - allowance,
    );
    limits.max = Math.min(
      limits.max,
      model.geometry.maximumGuideOpeningWidth + bearing - cutter - allowance,
      getParam(params, "workpieceWidth") - 6,
    );
  } else if (key === "tenonThickness") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumGuideOpening + bearing - cutter - allowance,
    );
    limits.max = Math.min(
      limits.max,
      model.geometry.maximumGuideOpeningThickness + bearing - cutter - allowance,
      getParam(params, "workpieceThickness") - 6,
    );
  } else if (key === "workpieceWidth") {
    limits.min = Math.max(limits.min, getParam(params, "tenonWidth") + 6);
    limits.max = Math.min(limits.max, model.geometry.throatWidth - 4);
  } else if (key === "workpieceThickness") {
    limits.min = Math.max(limits.min, getParam(params, "tenonThickness") + 6);
    limits.max = Math.min(limits.max, model.geometry.throatThickness - 4);
  } else if (key === "guideBearingDiameter") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "tenonWidth") +
        cutter +
        allowance -
        model.geometry.maximumGuideOpeningWidth,
      getParam(params, "tenonThickness") +
        cutter +
        allowance -
        model.geometry.maximumGuideOpeningThickness,
    );
    limits.max = Math.min(
      limits.max,
      Math.min(getParam(params, "tenonWidth"), getParam(params, "tenonThickness")) +
        cutter +
        allowance -
        model.geometry.minimumGuideOpening,
    );
  } else if (key === "routerCutterDiameter") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumGuideOpening -
        Math.min(getParam(params, "tenonWidth"), getParam(params, "tenonThickness")) +
        bearing -
        allowance,
    );
    limits.max = Math.min(
      limits.max,
      model.geometry.maximumGuideOpeningWidth -
        getParam(params, "tenonWidth") +
        bearing -
        allowance,
      model.geometry.maximumGuideOpeningThickness -
        getParam(params, "tenonThickness") +
        bearing -
        allowance,
    );
  } else if (key === "tenonAllowance") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumGuideOpening -
        Math.min(getParam(params, "tenonWidth"), getParam(params, "tenonThickness")) +
        bearing -
        cutter,
    );
    limits.max = Math.min(
      limits.max,
      model.geometry.maximumGuideOpeningWidth -
        getParam(params, "tenonWidth") +
        bearing -
        cutter,
      model.geometry.maximumGuideOpeningThickness -
        getParam(params, "tenonThickness") +
        bearing -
        cutter,
    );
  } else if (key === "insertDepth") {
    const engagement =
      getParam(params, "knobScrewLength") -
      model.geometry.washerThickness -
      getParam(params, "guidePlateThickness");
    limits.min = Math.max(
      limits.min,
      engagement + model.geometry.minimumPocketTipClearance,
    );
    limits.max = Math.min(
      limits.max,
      getParam(params, "baseThickness") - model.geometry.minimumInsertFloor,
    );
  } else if (key === "baseThickness") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "insertDepth") + model.geometry.minimumInsertFloor,
    );
  } else if (key === "guidePlateThickness") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "knobScrewLength") -
        model.geometry.washerThickness -
        getParam(params, "insertDepth") +
        model.geometry.minimumPocketTipClearance,
    );
    limits.max = Math.min(
      limits.max,
      getParam(params, "knobScrewLength") -
        model.geometry.washerThickness -
        model.geometry.minimumInsertEngagement,
    );
  } else if (key === "knobScrewLength") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "guidePlateThickness") +
        model.geometry.washerThickness +
        model.geometry.minimumInsertEngagement,
    );
    limits.max = Math.min(
      limits.max,
      getParam(params, "guidePlateThickness") +
        model.geometry.washerThickness +
        getParam(params, "insertDepth") -
        model.geometry.minimumPocketTipClearance,
    );
  } else if (key === "routerBaseDiameter") {
    const spec = getRouterTenonJigSpec(params, model);
    limits.min = Math.max(limits.min, spec.routerSupportRequiredDiameter);
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getRouterTenonJigAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: RouterTenonJigModelDefinition,
): AuditItem {
  const spec = getRouterTenonJigSpec(params, model);
  const pass = (value: string): AuditItem => ({ label: check.label, value, status: "pass" });
  const warn = (value: string): AuditItem => ({ label: check.label, value, status: "warn" });
  switch (check.key) {
    case "tenonTarget":
      return pass(
        `${formatLength(spec.tenonThickness, unit)} T × ${formatLength(spec.tenonWidth, unit)} W × ${formatLength(spec.tenonLength, unit)} L`,
      );
    case "guideOpenings":
      return pass(
        `${formatLength(spec.guideOpeningThickness, unit)} T × ${formatLength(spec.guideOpeningWidth, unit)} W · ${formatLength(spec.tenonAllowance, unit)} total extra material`,
      );
    case "routerInterface":
      return pass(
        `${formatLength(spec.cutterDiameter, unit)} cutter · ${formatLength(spec.bearingDiameter, unit)} guide bearing · ${formatLength(spec.routerBaseDiameter, unit)} auxiliary sub-base`,
      );
    case "shoulderMargins":
      return spec.shoulderWidth >= 3 && spec.shoulderThickness >= 3
        ? pass(
            `${formatLength(spec.shoulderThickness, unit)} per face · ${formatLength(spec.shoulderWidth, unit)} per edge`,
          )
        : warn("Keep at least 3 mm of shoulder on every side");
    case "assemblyClearance": {
      const cheekOuter = spec.guideOpeningWidth / 2 + spec.cheekPlateLength;
      const edgeOuter = spec.guideOpeningThickness / 2 + spec.edgePlateWidth;
      const seated =
        cheekOuter <= model.geometry.horizontalRecessLength / 2 &&
        edgeOuter <= model.geometry.verticalRecessLength / 2;
      return seated
        ? pass(
            `${spec.activeGuidePair === "width" ? "Width / cheek" : "Thickness / edge"} pair installed · guides flush at ${formatLength(spec.platformThickness, unit)}`,
          )
        : warn("A guide extends beyond its recessed support floor");
    }
    case "fastenerEngagement":
      return spec.screwEngagement >= model.geometry.minimumInsertEngagement &&
        spec.screwTipClearance >= model.geometry.minimumPocketTipClearance
        ? pass(
            `${formatLength(spec.screwEngagement, unit)} engagement · ${formatLength(spec.screwTipClearance, unit)} tip clearance · 2 screws per guide`,
          )
        : warn(
            `${formatLength(spec.screwEngagement, unit)} engagement · ${formatLength(spec.screwTipClearance, unit)} tip clearance`,
          );
    case "heatSetInserts":
      return spec.minimumInsertWeb >= model.geometry.minimumInsertSideWall &&
        spec.insertFloor >= model.geometry.minimumInsertFloor
        ? pass(
            `8 × M5 · ${formatLength(spec.insertPocketDiameter, unit)} Ø × ${formatLength(spec.insertDepth, unit)} deep blind pockets`,
          )
        : warn(
            `${formatLength(spec.minimumInsertWeb, unit)} side web · ${formatLength(spec.insertFloor, unit)} floor`,
          );
    case "adjustmentRange":
      return spec.slotTravelMargin >= 0
        ? pass(
            `${formatLength(spec.slotTravelMargin, unit)} bolt-center margin · ${model.geometry.presetTenonThicknessesMm.map((value) => formatLength(value, unit)).join(" · ")} T · ${model.geometry.presetTenonWidthsMm.map((value) => formatLength(value, unit)).join(" · ")} W`,
          )
        : warn(`${formatLength(spec.slotTravelMargin, unit)} slot travel margin`);
    case "routerSupport":
      return spec.routerSupportOverlap >= model.geometry.minimumRouterSupportOverlap
        ? pass(
            `${formatLength(spec.routerSupportOverlap, unit)} reach onto a raised support region · ${formatLength(spec.routerSupportRequiredDiameter, unit)} minimum sub-base`,
          )
        : warn(
            `${formatLength(spec.routerSupportOverlap, unit)} reach · enlarge the auxiliary sub-base to ${formatLength(spec.routerSupportRequiredDiameter, unit)}`,
          );
    case "baseStrength":
      return spec.baseScreenDeflection <= model.geometry.maximumScreenDeflection &&
        spec.baseScreenSafetyFactor >= model.geometry.minimumScreenSafetyFactor
        ? pass(
            `${formatLength(spec.baseScreenDeflection, unit)} beam-screen deflection · ${spec.baseScreenStress.toFixed(2)} MPa · ${spec.baseScreenSafetyFactor.toFixed(1)}× stress margin at ${model.geometry.screenLoadN} N`,
          )
        : warn(
            `${formatLength(spec.baseScreenDeflection, unit)} deflection · ${spec.baseScreenSafetyFactor.toFixed(1)}× stress margin`,
          );
    case "guideStrength":
      return spec.guideScreenDeflection <= model.geometry.maximumScreenDeflection &&
        spec.guideScreenSafetyFactor >= model.geometry.minimumScreenSafetyFactor
        ? pass(
            `${formatLength(spec.guideScreenDeflection, unit)} cantilever-screen deflection · ${spec.guideScreenStress.toFixed(2)} MPa · ${spec.guideScreenSafetyFactor.toFixed(1)}× stress margin at ${model.geometry.screenLoadN} N`,
          )
        : warn(
            `${formatLength(spec.guideScreenDeflection, unit)} deflection · ${spec.guideScreenSafetyFactor.toFixed(1)}× stress margin`,
          );
    case "minimumBaseWeb":
      return spec.minimumBaseWeb >= model.geometry.minimumInsertSideWall &&
        spec.minimumPlateWeb >= model.geometry.minimumInsertSideWall &&
        spec.clampLedge >= model.geometry.minimumClampLedge
        ? pass(
            `${formatLength(spec.minimumBaseWeb, unit)} base web · ${formatLength(spec.minimumPlateWeb, unit)} guide web · ${formatLength(spec.clampLedge, unit)} front/rear clamp ledge`,
          )
        : warn(
            `${formatLength(spec.minimumBaseWeb, unit)} base · ${formatLength(spec.minimumPlateWeb, unit)} guide · ${formatLength(spec.clampLedge, unit)} clamp ledge`,
          );
    case "printSet":
      return pass("5 individual STLs · bridge + 2 cheek guides + 2 edge guides");
    case "previewStandIn":
      return pass("Auxiliary sub-base, bearing bit, depth-stop band, 8 inserts, active screws, and sample stock · preview only");
    case "printOrientation":
      return pass("Base recess and insert pockets up · all four guides slot faces up · no supports");
    default:
      return warn("Unsupported audit check");
  }
}
