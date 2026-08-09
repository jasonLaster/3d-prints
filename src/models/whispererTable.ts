import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  DiningTableModelDefinition,
  LengthUnit,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-5;
const LEG_SPLAY_RADIANS = THREE.MathUtils.degToRad(15);

type RingPoint = { x: number; y: number };
type LoftLayer = {
  z: number;
  centerX?: number;
  centerY?: number;
  points: RingPoint[];
};

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function assignPlanarUvs(geometry: THREE.BufferGeometry) {
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const bounds = geometry.boundingBox;
  if (!bounds) return;

  const size = new THREE.Vector3();
  bounds.getSize(size);
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (nz >= nx && nz >= ny) {
      uvs[index * 2] = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      uvs[index * 2 + 1] = (y - bounds.min.y) / Math.max(size.y, EPSILON);
    } else if (nx >= ny) {
      uvs[index * 2] = (y - bounds.min.y) / Math.max(size.y, EPSILON);
      uvs[index * 2 + 1] = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    } else {
      uvs[index * 2] = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      uvs[index * 2 + 1] = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function createLoftGeometry(layers: LoftLayer[]) {
  if (layers.length < 2) throw new Error("A loft requires at least two layers");
  const pointCount = layers[0].points.length;
  if (
    pointCount < 3 ||
    layers.some((layer) => layer.points.length !== pointCount)
  ) {
    throw new Error("Every loft layer must share one polygon topology");
  }

  const vectorAt = (layer: LoftLayer, index: number) =>
    new THREE.Vector3(
      layer.points[index].x + (layer.centerX ?? 0),
      layer.points[index].y + (layer.centerY ?? 0),
      layer.z,
    );
  const positions: number[] = [];

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const lower = layers[layerIndex];
    const upper = layers[layerIndex + 1];
    for (let index = 0; index < pointCount; index += 1) {
      const next = (index + 1) % pointCount;
      const a = vectorAt(lower, index);
      const b = vectorAt(lower, next);
      const c = vectorAt(upper, next);
      const d = vectorAt(upper, index);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const addCap = (layer: LoftLayer, upward: boolean) => {
    const contour = layer.points.map(
      (point) =>
        new THREE.Vector2(
          point.x + (layer.centerX ?? 0),
          point.y + (layer.centerY ?? 0),
        ),
    );
    for (const [aIndex, bIndex, cIndex] of THREE.ShapeUtils.triangulateShape(
      contour,
      [],
    )) {
      const a = vectorAt(layer, aIndex);
      const b = vectorAt(layer, bIndex);
      const c = vectorAt(layer, cIndex);
      if (upward) addTriangle(positions, a, b, c);
      else addTriangle(positions, a, c, b);
    }
  };
  addCap(layers[0], false);
  addCap(layers[layers.length - 1], true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignPlanarUvs(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function rectanglePoints(width: number, depth: number): RingPoint[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ];
}

function chamferedRectanglePoints(
  width: number,
  depth: number,
  requestedChamfer: number,
): RingPoint[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const chamfer = Math.max(
    EPSILON,
    Math.min(requestedChamfer, halfWidth - EPSILON, halfDepth - EPSILON),
  );
  return [
    { x: -halfWidth + chamfer, y: -halfDepth },
    { x: halfWidth - chamfer, y: -halfDepth },
    { x: halfWidth, y: -halfDepth + chamfer },
    { x: halfWidth, y: halfDepth - chamfer },
    { x: halfWidth - chamfer, y: halfDepth },
    { x: -halfWidth + chamfer, y: halfDepth },
    { x: -halfWidth, y: halfDepth - chamfer },
    { x: -halfWidth, y: -halfDepth + chamfer },
  ];
}

function createPrismAlongX(length: number, crossSection: THREE.Vector2[]) {
  const positions: number[] = [];
  const xMin = -length / 2;
  const xMax = length / 2;
  const vectorAt = (x: number, point: THREE.Vector2) =>
    new THREE.Vector3(x, point.x, point.y);

  for (let index = 0; index < crossSection.length; index += 1) {
    const next = (index + 1) % crossSection.length;
    const a = vectorAt(xMin, crossSection[index]);
    const b = vectorAt(xMin, crossSection[next]);
    const c = vectorAt(xMax, crossSection[next]);
    const d = vectorAt(xMax, crossSection[index]);
    addTriangle(positions, a, c, b);
    addTriangle(positions, a, d, c);
  }
  const triangles = THREE.ShapeUtils.triangulateShape(crossSection, []);
  for (const [aIndex, bIndex, cIndex] of triangles) {
    addTriangle(
      positions,
      vectorAt(xMin, crossSection[aIndex]),
      vectorAt(xMin, crossSection[bIndex]),
      vectorAt(xMin, crossSection[cIndex]),
    );
    addTriangle(
      positions,
      vectorAt(xMax, crossSection[aIndex]),
      vectorAt(xMax, crossSection[cIndex]),
      vectorAt(xMax, crossSection[bIndex]),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignPlanarUvs(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function createPrismAlongY(length: number, crossSection: THREE.Vector2[]) {
  const alongX = createPrismAlongX(length, crossSection);
  alongX.rotateZ(-Math.PI / 2);
  return alongX;
}

function scaled(params: ModelParams, key: string) {
  return getParam(params, key) / getParam(params, "mockScale");
}

function getWhispererLegHeight(params: ModelParams) {
  return scaled(params, "overallHeight") - scaled(params, "topThickness");
}

function createWhispererTopGeometry(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const thickness = scaled(params, "topThickness");
  const edgeThickness = Math.min(
    scaled(params, "topEdgeThickness"),
    thickness - EPSILON,
  );
  const bevelInset = Math.min(
    scaled(params, "undersideBevelInset"),
    length / 2 - EPSILON,
    width / 2 - EPSILON,
  );
  const legHeight = getWhispererLegHeight(params);
  const innerLength = length - bevelInset * 2;
  const innerWidth = width - bevelInset * 2;
  return createLoftGeometry([
    {
      z: legHeight,
      points: rectanglePoints(innerLength, innerWidth),
    },
    {
      z: legHeight + thickness - edgeThickness,
      points: rectanglePoints(length, width),
    },
    {
      z: legHeight + thickness,
      points: rectanglePoints(length, width),
    },
  ]);
}

function createWhispererLegGeometry(
  params: ModelParams,
  xSign: -1 | 1,
  ySign: -1 | 1,
) {
  const height = getWhispererLegHeight(params);
  const topWidth = scaled(params, "legTopWidth");
  const footWidth = scaled(params, "legFootWidth");
  const thickness = scaled(params, "legThickness");
  const footChamfer = scaled(params, "legFootChamfer");
  const topCenterX = xSign * scaled(params, "longApronLength") / 2;
  const bottomCenterX =
    topCenterX + xSign * height * Math.tan(LEG_SPLAY_RADIANS);
  const centerY = ySign * scaled(params, "sideApronLength") / 2;

  return createLoftGeometry([
    {
      z: 0,
      centerX: bottomCenterX,
      centerY,
      points: chamferedRectanglePoints(
        footWidth,
        thickness,
        footChamfer,
      ),
    },
    {
      z: height,
      centerX: topCenterX,
      centerY,
      points: chamferedRectanglePoints(topWidth, thickness, EPSILON),
    },
  ]);
}

function apronCrossSection(depth: number, height: number, chamferRise: number) {
  const halfDepth = depth / 2;
  const rise = Math.min(chamferRise, height / 2, depth - EPSILON);
  return [
    new THREE.Vector2(-halfDepth, 0),
    new THREE.Vector2(-halfDepth, height),
    new THREE.Vector2(halfDepth, height),
    new THREE.Vector2(halfDepth, rise),
    new THREE.Vector2(halfDepth - rise, 0),
  ];
}

function createLongApronGeometry(params: ModelParams, ySign: -1 | 1) {
  const length = scaled(params, "longApronLength");
  const height = scaled(params, "longApronHeight");
  const thickness = scaled(params, "apronThickness");
  const setback = scaled(params, "apronSetback");
  const legDepth = scaled(params, "legThickness");
  const y =
    ySign *
    (scaled(params, "sideApronLength") / 2 + legDepth / 2 - setback - thickness / 2);
  const geometry = createPrismAlongX(
    length,
    apronCrossSection(thickness, height, thickness / 2),
  );
  geometry.translate(0, y, getWhispererLegHeight(params) - height);
  return geometry;
}

function createSideApronGeometry(params: ModelParams, xSign: -1 | 1) {
  const length = scaled(params, "sideApronLength");
  const height = scaled(params, "sideApronHeight");
  const thickness = scaled(params, "apronThickness");
  const setback = scaled(params, "apronSetback");
  const topCenter =
    xSign *
    (scaled(params, "longApronLength") / 2 +
      scaled(params, "legTopWidth") / 2 -
      setback -
      thickness / 2);
  const crossSection = apronCrossSection(
    thickness,
    height,
    thickness * Math.tan(THREE.MathUtils.degToRad(30)),
  ).map(
    (point) =>
      new THREE.Vector2(
        point.x +
          xSign * (height - point.y) * Math.tan(LEG_SPLAY_RADIANS),
        point.y,
      ),
  );
  const geometry = createPrismAlongY(length, crossSection);
  geometry.translate(topCenter, 0, getWhispererLegHeight(params) - height);
  return geometry;
}

export function isWhispererParams(params: ModelParams) {
  return Number.isFinite(params.undersideBevelInset);
}

export function createWhispererTableWoodGeometry(params: ModelParams) {
  const geometries = [
    createWhispererTopGeometry(params),
    createWhispererLegGeometry(params, -1, -1),
    createWhispererLegGeometry(params, -1, 1),
    createWhispererLegGeometry(params, 1, -1),
    createWhispererLegGeometry(params, 1, 1),
    createLongApronGeometry(params, -1),
    createLongApronGeometry(params, 1),
    createSideApronGeometry(params, -1),
    createSideApronGeometry(params, 1),
  ];
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge Whisperer table geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function getWhispererTableParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const topThickness = getParam(params, "topThickness");
  const overallHeight = getParam(params, "overallHeight");
  const legTopWidth = getParam(params, "legTopWidth");
  const legFootWidth = getParam(params, "legFootWidth");
  const legThickness = getParam(params, "legThickness");

  if (key === "topThickness") {
    limits.max = Math.min(limits.max, overallHeight / 4);
    limits.min = Math.max(limits.min, getParam(params, "topEdgeThickness"));
  } else if (key === "topEdgeThickness") {
    limits.max = Math.min(limits.max, topThickness - limits.step);
  } else if (key === "undersideBevelInset") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 2 - limits.step);
  } else if (key === "overallHeight") {
    limits.min = Math.max(limits.min, topThickness + 20 * 25.4);
  } else if (key === "legTopWidth") {
    limits.max = Math.min(limits.max, length / 8);
    limits.min = Math.max(limits.min, legFootWidth);
  } else if (key === "legFootWidth") {
    limits.max = Math.min(limits.max, legTopWidth);
  } else if (key === "legThickness") {
    limits.max = Math.min(limits.max, width / 8);
    limits.min = Math.max(
      limits.min,
      getParam(params, "legFootChamfer") * 2 + limits.step,
    );
  } else if (key === "legFootChamfer") {
    limits.max = Math.min(
      limits.max,
      legFootWidth / 2 - limits.step,
      legThickness / 2 - limits.step,
    );
  } else if (key === "longApronLength") {
    limits.max = Math.min(limits.max, length - legTopWidth);
  } else if (key === "sideApronLength") {
    limits.max = Math.min(limits.max, width - legThickness);
  } else if (key === "longApronHeight" || key === "sideApronHeight") {
    limits.max = Math.min(limits.max, overallHeight - topThickness);
  } else if (key === "apronThickness") {
    limits.max = Math.min(limits.max, legThickness);
  } else if (key === "apronSetback") {
    limits.max = Math.min(limits.max, legThickness / 2 - limits.step);
  }
  return limits;
}

function item(
  label: string,
  value: string,
  status: "pass" | "warn" = "pass",
): AuditItem {
  return { label, value, status };
}

export function getWhispererTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const scale = getParam(params, "mockScale");
  const legVerticalHeight =
    getParam(params, "overallHeight") - getParam(params, "topThickness");
  const legBlankLength = legVerticalHeight / Math.cos(LEG_SPLAY_RADIANS);
  switch (check.key) {
    case "tableEnvelope":
      return item(
        check.label,
        `${formatLength(getParam(params, "tableLength"), unit)} × ${formatLength(getParam(params, "tableWidth"), unit)} × ${formatLength(getParam(params, "overallHeight"), unit)}`,
      );
    case "tabletopProfile":
      return item(
        check.label,
        `${formatLength(getParam(params, "topThickness"), unit)} top · ${formatLength(getParam(params, "topEdgeThickness"), unit)} edge · ${formatLength(getParam(params, "undersideBevelInset"), unit)} bevel inset`,
      );
    case "legGeometry":
      return item(
        check.label,
        `4 × ${formatLength(legBlankLength, unit)} blanks · 15° splay · ${formatLength(getParam(params, "legTopWidth"), unit)} to ${formatLength(getParam(params, "legFootWidth"), unit)} taper`,
      );
    case "legEndRoundovers":
      return item(
        check.label,
        `${formatLength(getParam(params, "legFootChamfer"), unit)} foot chamfers taper to zero at the top`,
      );
    case "cornerPlates":
      return item(
        check.label,
        `2 long + 2 side aprons · ${formatLength(getParam(params, "apronThickness"), unit)} thick · ${formatLength(getParam(params, "apronSetback"), unit)} setback`,
      );
    case "channelLayout":
      return item(
        check.label,
        `1 top · 4 legs · 2 × ${formatLength(getParam(params, "longApronLength"), unit)} long aprons · 2 × ${formatLength(getParam(params, "sideApronLength"), unit)} side aprons`,
      );
    case "printEnvelope": {
      const length = getParam(params, "tableLength") / scale;
      const width = getParam(params, "tableWidth") / scale;
      const height = getParam(params, "overallHeight") / scale;
      return item(
        check.label,
        `1:${scale}; ${length.toFixed(1)} × ${width.toFixed(1)} × ${height.toFixed(1)} mm`,
        length <= 256 && width <= 256 ? "pass" : "warn",
      );
    }
    case "minimumMockFeature": {
      const feature =
        Math.min(
          getParam(params, "topEdgeThickness"),
          getParam(params, "legFootChamfer"),
          getParam(params, "apronSetback"),
        ) / scale;
      return item(
        check.label,
        `${feature.toFixed(2)} mm`,
        feature >= 0.3 ? "pass" : "warn",
      );
    }
    default:
      return item(check.label, "Unsupported audit check", "warn");
  }
}
