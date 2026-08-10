import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  DrillBitHolderModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;
export const DRILL_BIT_PARAMETER_KEYS = [
  "bitDiameter1",
  "bitDiameter2",
  "bitDiameter3",
  "bitDiameter4",
  "bitDiameter5",
  "bitDiameter6",
  "bitDiameter7",
] as const;

export function isDrillBitDiameterKey(key: string) {
  return /^bitDiameter[1-9]\d*$/.test(key);
}

export function getDrillBitDiameters(
  params: ModelParams,
  model?: DrillBitHolderModelDefinition,
) {
  const fallback = model?.geometry.defaultBitDiametersMm ?? [];
  const rawCount = params.bitCount;
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.round(rawCount))
    : fallback.length;
  return Array.from({ length: count }, (_, index) => {
    const value = params[`bitDiameter${index + 1}`];
    if (Number.isFinite(value)) return value;
    return fallback[index] ?? fallback[fallback.length - 1] ?? 6.35;
  });
}

type Point = THREE.Vector2;

export type DrillBitHolderLayout = {
  bitDiameters: number[];
  holeDiameters: number[];
  holeCenters: number[];
  length: number;
  width: number;
  height: number;
  edgeMargin: number;
  floorThickness: number;
  minimumWeb: number;
};

function circleRing(radius: number, segments: number, centerX = 0) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      centerX + Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
}

function roundedRectangleRing(
  length: number,
  width: number,
  radius: number,
  cornerSegments: number,
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
        corner.x + Math.cos(angle) * safeRadius,
        corner.y + Math.sin(angle) * safeRadius,
      );
    }),
  );
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
  // ShapeUtils expects a clockwise contour and counter-clockwise holes.
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

export function getDrillBitHolderLayout(
  params: ModelParams,
  model: DrillBitHolderModelDefinition,
): DrillBitHolderLayout {
  const clearance = getParam(params, "bitClearance");
  const spacing = getParam(params, "bitSpacing");
  const edgeMargin = getParam(params, "edgeMargin");
  const height = getParam(params, "holderHeight");
  const holeDepth = Math.min(getParam(params, "holeDepth"), height);
  const bitDiameters = getDrillBitDiameters(params, model);
  const holeDiameters = bitDiameters.map((diameter) => diameter + clearance);
  const openingSpan =
    holeDiameters.reduce((sum, diameter) => sum + diameter, 0) +
    spacing * (holeDiameters.length - 1);
  const holeCenters: number[] = [];
  let cursor = -openingSpan / 2;
  holeDiameters.forEach((diameter) => {
    cursor += diameter / 2;
    holeCenters.push(cursor);
    cursor += diameter / 2 + spacing;
  });
  return {
    bitDiameters,
    holeDiameters,
    holeCenters,
    length: openingSpan + edgeMargin * 2,
    width: Math.max(...holeDiameters) + edgeMargin * 2,
    height,
    edgeMargin,
    floorThickness: height - holeDepth,
    minimumWeb: spacing,
  };
}

export function createDrillBitHolderGeometry(
  params: ModelParams,
  model: DrillBitHolderModelDefinition,
) {
  const layout = getDrillBitHolderLayout(params, model);
  const cornerRadius = getParam(params, "cornerRadius");
  const bevel = getParam(params, "edgeBevel");
  const bevelHeight = Math.min(bevel, layout.height / 2);
  const nominalOuter = roundedRectangleRing(
    layout.length,
    layout.width,
    cornerRadius,
    model.geometry.cornerSegments,
  );
  const beveledOuter = roundedRectangleRing(
    layout.length - bevel * 2,
    layout.width - bevel * 2,
    Math.max(cornerRadius - bevel, EPSILON),
    model.geometry.cornerSegments,
  );
  const nominalHoles = layout.holeDiameters.map((diameter, index) =>
    circleRing(diameter / 2, model.geometry.radialSegments, layout.holeCenters[index]),
  );
  const entryHoles = layout.holeDiameters.map((diameter, index) =>
    circleRing(
      diameter / 2 + bevel,
      model.geometry.radialSegments,
      layout.holeCenters[index],
    ),
  );
  const positions: number[] = [];

  addHorizontalFace(positions, beveledOuter, [], 0, false);
  addRingBridge(positions, beveledOuter, nominalOuter, 0, bevelHeight);
  addRingBridge(
    positions,
    nominalOuter,
    nominalOuter,
    bevelHeight,
    layout.height - bevelHeight,
  );
  addRingBridge(
    positions,
    nominalOuter,
    beveledOuter,
    layout.height - bevelHeight,
    layout.height,
  );
  addHorizontalFace(positions, beveledOuter, entryHoles, layout.height, true);

  nominalHoles.forEach((hole, index) => {
    const floorZ = layout.floorThickness;
    addHorizontalFace(positions, hole, [], floorZ, true);
    addRingBridge(
      positions,
      hole,
      hole,
      floorZ,
      layout.height - bevelHeight,
      true,
    );
    addRingBridge(
      positions,
      hole,
      entryHoles[index],
      layout.height - bevelHeight,
      layout.height,
      true,
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getDrillBitHolderDimensions(
  params: ModelParams,
  model: DrillBitHolderModelDefinition,
): ModelDimensions {
  const layout = getDrillBitHolderLayout(params, model);
  return { length: layout.length, width: layout.width, height: layout.height };
}

export function updateDrillBitHolderGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: DrillBitHolderModelDefinition,
) {
  const dimensions = getDrillBitHolderDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.z = dimensions.height / 2;
}

export function getDrillBitHolderParameterLimits(
  model: DrillBitHolderModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  if (key === "holeDepth") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "holderHeight") - model.geometry.minimumFloorThickness,
    );
  } else if (key === "holderHeight") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "holeDepth") + model.geometry.minimumFloorThickness,
    );
  } else if (key === "cornerRadius") {
    const layout = getDrillBitHolderLayout(params, model);
    limits.max = Math.min(limits.max, layout.width / 2 - EPSILON);
  } else if (key === "edgeBevel") {
    limits.max = Math.max(
      limits.min,
      Math.min(
        limits.max,
        (getParam(params, "bitSpacing") - model.geometry.minimumWallThickness) / 2,
        (getParam(params, "edgeMargin") - model.geometry.minimumWallThickness) / 2,
        getParam(params, "cornerRadius"),
      ),
    );
  }
  return limits;
}

export function getDrillBitHolderAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: DrillBitHolderModelDefinition,
): AuditItem {
  const layout = getDrillBitHolderLayout(params, model);
  const bevel = getParam(params, "edgeBevel");
  const topWeb = layout.minimumWeb - bevel * 2;
  const topSideWall = layout.edgeMargin - bevel * 2;
  const pass = (value: string): AuditItem => ({ label: check.label, value, status: "pass" });
  const warn = (value: string): AuditItem => ({ label: check.label, value, status: "warn" });

  switch (check.key) {
    case "bitSet":
      return pass(
        layout.bitDiameters
          .map((diameter) => formatLength(diameter, unit))
          .join(" · "),
      );
    case "largestBit":
      return pass(formatLength(Math.max(...layout.bitDiameters), unit));
    case "bitClearance":
      return pass(
        `${formatLength(getParam(params, "bitClearance"), unit)} total · ${formatLength(getParam(params, "bitClearance") / 2, unit)} per side`,
      );
    case "holeSpacing":
      return topWeb >= model.geometry.minimumWallThickness
        ? pass(`${formatLength(layout.minimumWeb, unit)} nominal; ${formatLength(topWeb, unit)} at entries`)
        : warn(`${formatLength(topWeb, unit)} at beveled entries`);
    case "edgeMargin":
      return topSideWall >= model.geometry.minimumWallThickness
        ? pass(`${formatLength(layout.edgeMargin, unit)} nominal; ${formatLength(topSideWall, unit)} at entries`)
        : warn(`${formatLength(topSideWall, unit)} at beveled entries`);
    case "holderEnvelope":
      return pass(
        `${formatLength(layout.length, unit)} × ${formatLength(layout.width, unit)} × ${formatLength(layout.height, unit)}`,
      );
    case "printOrientation":
      return pass("Upright · base flat, holes up · continuous walls, no supports");
    case "holeDepth":
      return layout.floorThickness >= model.geometry.minimumFloorThickness
        ? pass(`${formatLength(getParam(params, "holeDepth"), unit)} deep`)
        : warn(`${formatLength(layout.floorThickness, unit)} floor remaining`);
    case "roundedCorners":
      return pass(`${formatLength(getParam(params, "cornerRadius"), unit)} radius`);
    case "bevels":
      return pass(`${formatLength(bevel, unit)} outer edges and hole entries`);
    case "minimumWalls":
      return Math.min(topWeb, topSideWall, layout.floorThickness) >=
        model.geometry.minimumWallThickness
        ? pass(`${formatLength(Math.min(topWeb, topSideWall, layout.floorThickness), unit)} minimum`)
        : warn(`${formatLength(Math.min(topWeb, topSideWall, layout.floorThickness), unit)} minimum`);
    default:
      return warn("Unsupported audit check");
  }
}
