import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  DiningTableModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

type LoftLayer = {
  z: number;
  width: number;
  depth: number;
  radius: number;
};

const EPSILON = 1e-6;

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function roundedRectRing(
  width: number,
  depth: number,
  radius: number,
  cornerSegments: number,
) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const safeRadius = Math.max(
    0,
    Math.min(radius, halfWidth - EPSILON, halfDepth - EPSILON),
  );
  const centers = [
    new THREE.Vector2(halfWidth - safeRadius, halfDepth - safeRadius),
    new THREE.Vector2(-halfWidth + safeRadius, halfDepth - safeRadius),
    new THREE.Vector2(-halfWidth + safeRadius, -halfDepth + safeRadius),
    new THREE.Vector2(halfWidth - safeRadius, -halfDepth + safeRadius),
  ];

  return centers.flatMap((center, cornerIndex) =>
    Array.from({ length: cornerSegments }, (_, segmentIndex) => {
      const angle =
        (cornerIndex * Math.PI) / 2 +
        (segmentIndex / cornerSegments) * (Math.PI / 2);
      return new THREE.Vector2(
        center.x + Math.cos(angle) * safeRadius,
        center.y + Math.sin(angle) * safeRadius,
      );
    }),
  );
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
    let u = 0;
    let v = 0;
    if (nz >= nx && nz >= ny) {
      u = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      v = (y - bounds.min.y) / Math.max(size.y, EPSILON);
    } else if (nx >= ny) {
      u = (y - bounds.min.y) / Math.max(size.y, EPSILON);
      v = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    } else {
      u = (x - bounds.min.x) / Math.max(size.x, EPSILON);
      v = (z - bounds.min.z) / Math.max(size.z, EPSILON);
    }
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function createRoundedLoft(
  layers: LoftLayer[],
  cornerSegments: number,
) {
  const sorted = layers.slice().sort((a, b) => a.z - b.z);
  const rings = sorted.map((layer) =>
    roundedRectRing(
      layer.width,
      layer.depth,
      layer.radius,
      cornerSegments,
    ),
  );
  const positions: number[] = [];

  for (let layerIndex = 0; layerIndex < rings.length - 1; layerIndex += 1) {
    const lower = rings[layerIndex];
    const upper = rings[layerIndex + 1];
    for (let index = 0; index < lower.length; index += 1) {
      const next = (index + 1) % lower.length;
      const a = new THREE.Vector3(lower[index].x, lower[index].y, sorted[layerIndex].z);
      const b = new THREE.Vector3(lower[next].x, lower[next].y, sorted[layerIndex].z);
      const c = new THREE.Vector3(upper[next].x, upper[next].y, sorted[layerIndex + 1].z);
      const d = new THREE.Vector3(upper[index].x, upper[index].y, sorted[layerIndex + 1].z);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const addCap = (ring: THREE.Vector2[], z: number, upward: boolean) => {
    const triangles = THREE.ShapeUtils.triangulateShape(
      ring.map((point) => point.clone()),
      [],
    );
    for (const [aIndex, bIndex, cIndex] of triangles) {
      const a = new THREE.Vector3(ring[aIndex].x, ring[aIndex].y, z);
      const b = new THREE.Vector3(ring[bIndex].x, ring[bIndex].y, z);
      const c = new THREE.Vector3(ring[cIndex].x, ring[cIndex].y, z);
      if (upward) addTriangle(positions, a, b, c);
      else addTriangle(positions, a, c, b);
    }
  };
  addCap(rings[0], sorted[0].z, false);
  addCap(rings[rings.length - 1], sorted[sorted.length - 1].z, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  assignPlanarUvs(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function tabletopLayers(
  length: number,
  width: number,
  thickness: number,
  cornerRadius: number,
  bottomRadius: number,
  topRadius: number,
  segments: number,
) {
  const layers: LoftLayer[] = [];
  const add = (z: number, inset: number) => {
    const layer = {
      z,
      width: length - inset * 2,
      depth: width - inset * 2,
      radius: Math.max(cornerRadius - inset, EPSILON),
    };
    const previous = layers[layers.length - 1];
    if (
      previous &&
      Math.abs(previous.z - layer.z) < EPSILON &&
      Math.abs(previous.width - layer.width) < EPSILON
    ) {
      return;
    }
    layers.push(layer);
  };

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      bottomRadius - bottomRadius * Math.cos(angle),
      bottomRadius - bottomRadius * Math.sin(angle),
    );
  }
  add(thickness - topRadius, 0);
  for (let index = 1; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    add(
      thickness - topRadius + topRadius * Math.sin(angle),
      topRadius - topRadius * Math.cos(angle),
    );
  }
  return layers;
}

function scaled(params: ModelParams, key: string) {
  return getParam(params, key) / getParam(params, "mockScale");
}

function createTabletopGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const thickness = scaled(params, "topThickness");
  const cornerRadius = scaled(params, "tabletopCornerRadius");
  const topRadius = Math.min(scaled(params, "topRoundoverRadius"), thickness / 2);
  const bottomRadius = Math.min(
    scaled(params, "bottomRoundoverRadius"),
    thickness / 2,
  );
  const legHeight = scaled(params, "overallHeight") - thickness;
  const geometry = createRoundedLoft(
    tabletopLayers(
      length,
      width,
      thickness,
      cornerRadius,
      bottomRadius,
      topRadius,
      model.geometry.edgeProfileSegments,
    ),
    model.geometry.cornerSegments,
  );
  geometry.translate(0, 0, legHeight);
  return geometry;
}

function createLegGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
  x: number,
  y: number,
) {
  const size = scaled(params, "legSize");
  const radius = Math.min(scaled(params, "legCornerRadius"), size / 2);
  const thickness = scaled(params, "topThickness");
  const height = scaled(params, "overallHeight") - thickness;
  const topRoundover = Math.min(
    scaled(params, "legTopRoundoverRadius"),
    size / 2,
    height / 2,
  );
  const bottomRoundover = Math.min(
    scaled(params, "legBottomRoundoverRadius"),
    size / 2,
    height / 2,
  );
  const geometry = createRoundedLoft(
    tabletopLayers(
      size,
      size,
      height,
      radius,
      bottomRoundover,
      topRoundover,
      model.geometry.edgeProfileSegments,
    ),
    model.geometry.cornerSegments,
  );
  geometry.translate(x, y, 0);
  return geometry;
}

function getLegCenters(params: ModelParams) {
  const length = scaled(params, "tableLength");
  const width = scaled(params, "tableWidth");
  const size = scaled(params, "legSize");
  const inset = scaled(params, "legEdgeInset");
  const x = length / 2 - size / 2 - inset;
  const y = width / 2 - size / 2 - inset;
  return [
    new THREE.Vector2(-x, -y),
    new THREE.Vector2(-x, y),
    new THREE.Vector2(x, -y),
    new THREE.Vector2(x, y),
  ];
}

export function createDiningTableWoodGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  const geometries = [
    createTabletopGeometry(params, model),
    ...getLegCenters(params).map((center) =>
      createLegGeometry(params, model, center.x, center.y),
    ),
  ];
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge dining-table wood geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createDiningTableHardwareGeometries(
  params: ModelParams,
) {
  const scale = getParam(params, "mockScale");
  const length = getParam(params, "tableLength") / scale;
  const width = getParam(params, "tableWidth") / scale;
  const legInset = getParam(params, "legEdgeInset") / scale;
  const legHeight =
    (getParam(params, "overallHeight") - getParam(params, "topThickness")) /
    scale;
  const plateSize = getParam(params, "plateSize") / scale;
  const legSize = getParam(params, "legSize") / scale;
  const plateEdgeInset = getParam(params, "plateEdgeInset") / scale;
  const exposedPlateWidth = Math.max(
    plateSize + plateEdgeInset - legSize,
    0.01,
  );
  const coveredLegSpan = Math.max(legSize - plateEdgeInset, 0.01);
  const plateThickness = getParam(params, "plateThickness") / scale;
  const plates = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([xSign, ySign]) => {
    const inwardStrip = new THREE.BoxGeometry(
      exposedPlateWidth,
      plateSize,
      plateThickness,
    );
    inwardStrip.translate(
      xSign *
        (length / 2 - legInset - legSize - exposedPlateWidth / 2),
      ySign *
        (width / 2 - legInset - plateEdgeInset - plateSize / 2),
      legHeight + plateThickness / 2,
    );
    const crossStrip = new THREE.BoxGeometry(
      coveredLegSpan,
      exposedPlateWidth,
      plateThickness,
    );
    crossStrip.translate(
      xSign *
        (length / 2 - legInset - (legSize + plateEdgeInset) / 2),
      ySign *
        (width / 2 - legInset - legSize - exposedPlateWidth / 2),
      legHeight + plateThickness / 2,
    );
    const geometry = mergeGeometries([inwardStrip, crossStrip], false);
    inwardStrip.dispose();
    crossStrip.dispose();
    if (!geometry) throw new Error("Unable to build dining-table plate geometry");
    return geometry;
  });

  const channelLength = getParam(params, "channelLength") / scale;
  const channelWidth = getParam(params, "channelWidth") / scale;
  const channelDepth = getParam(params, "channelDepth") / scale;
  const channels = [1, 2, 3].map((index) => {
    const position = getParam(params, `channelPosition${index}`) / scale;
    const geometry = new THREE.BoxGeometry(
      channelWidth,
      channelLength,
      channelDepth,
    );
    geometry.translate(
      position - length / 2,
      0,
      legHeight + channelDepth / 2,
    );
    return geometry;
  });
  return { plates, channels };
}

export function getDiningTableDimensions(params: ModelParams): ModelDimensions {
  const scale = getParam(params, "mockScale");
  return {
    length: getParam(params, "tableLength") / scale,
    width: getParam(params, "tableWidth") / scale,
    height: getParam(params, "overallHeight") / scale,
  };
}

export function updateDiningTableGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const dimensions = getDiningTableDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

export function getDiningTableParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const thickness = getParam(params, "topThickness");
  const legSize = getParam(params, "legSize");

  if (key === "topThickness") {
    limits.max = Math.min(limits.max, getParam(params, "overallHeight") / 4);
    limits.min = Math.max(
      limits.min,
      getParam(params, "topRoundoverRadius") * 2,
      getParam(params, "bottomRoundoverRadius") * 2,
      getParam(params, "channelDepth"),
      getParam(params, "plateThickness"),
    );
  } else if (key === "overallHeight") {
    limits.min = Math.max(limits.min, thickness + legSize * 2);
  } else if (key === "tabletopCornerRadius") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 2);
  } else if (key === "topRoundoverRadius" || key === "bottomRoundoverRadius") {
    limits.max = Math.min(limits.max, thickness / 2);
  } else if (key === "legSize") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 3);
    limits.min = Math.max(limits.min, getParam(params, "legCornerRadius") * 2);
  } else if (key === "legCornerRadius") {
    limits.max = Math.min(limits.max, legSize / 2);
  } else if (
    key === "legTopRoundoverRadius" ||
    key === "legBottomRoundoverRadius"
  ) {
    limits.max = Math.min(
      limits.max,
      legSize / 2,
      (getParam(params, "overallHeight") - thickness) / 2,
    );
  } else if (key === "plateSize") {
    limits.min = Math.max(limits.min, legSize);
    limits.max = Math.min(limits.max, Math.min(length, width) / 2);
  } else if (key === "plateEdgeInset") {
    limits.max = Math.min(limits.max, legSize - limits.step);
  } else if (key === "plateThickness" || key === "channelDepth") {
    limits.max = Math.min(limits.max, thickness);
  } else if (key === "channelLength") {
    limits.max = Math.min(limits.max, width - 2 * getParam(params, "legEdgeInset"));
  } else if (key.startsWith("channelPosition")) {
    const index = Number(key.slice(-1));
    const previous = index > 1 ? getParam(params, `channelPosition${index - 1}`) : 0;
    const next = index < 3 ? getParam(params, `channelPosition${index + 1}`) : length;
    limits.min = Math.max(limits.min, previous + getParam(params, "channelWidth"));
    limits.max = Math.min(limits.max, next - getParam(params, "channelWidth"), length);
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

export function getDiningTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const scale = getParam(params, "mockScale");
  const topThickness = getParam(params, "topThickness");
  const topRadius = getParam(params, "topRoundoverRadius");
  const bottomRadius = getParam(params, "bottomRoundoverRadius");
  const flatBand = topThickness - topRadius - bottomRadius;
  const dimensions = getDiningTableDimensions(params);
  switch (check.key) {
    case "tableEnvelope":
      return item(
        check.label,
        `${formatLength(getParam(params, "tableLength"), unit)} × ${formatLength(getParam(params, "tableWidth"), unit)} × ${formatLength(getParam(params, "overallHeight"), unit)}`,
      );
    case "tabletopProfile":
      return item(
        check.label,
        `${formatLength(topThickness, unit)} top; ${formatLength(flatBand, unit)} flat band`,
        flatBand >= 0 ? "pass" : "warn",
      );
    case "legGeometry":
      return item(
        check.label,
        `4 × ${formatLength(getParam(params, "legSize"), unit)} posts; ${formatLength(getParam(params, "legCornerRadius"), unit)} radius`,
      );
    case "legEndRoundovers":
      return item(
        check.label,
        `${formatLength(getParam(params, "legTopRoundoverRadius"), unit)} top · ${formatLength(getParam(params, "legBottomRoundoverRadius"), unit)} bottom`,
      );
    case "cornerPlates":
      return item(
        check.label,
        `4 × ${formatLength(getParam(params, "plateSize"), unit)} square × ${formatLength(getParam(params, "plateThickness"), unit)}; ${formatLength(getParam(params, "plateEdgeInset"), unit)} setback`,
      );
    case "channelLayout":
      return item(
        check.label,
        [1, 2, 3]
          .map((index) => formatLength(getParam(params, `channelPosition${index}`), unit))
          .join(" · "),
      );
    case "printEnvelope":
      return item(
        check.label,
        `1:${scale}; ${dimensions.length.toFixed(1)} × ${dimensions.width.toFixed(1)} × ${dimensions.height.toFixed(1)} mm`,
        dimensions.length <= 256 && dimensions.width <= 256 ? "pass" : "warn",
      );
    case "minimumMockFeature": {
      const feature = Math.min(
        getParam(params, "legTopRoundoverRadius") / scale,
        getParam(params, "legBottomRoundoverRadius") / scale,
        getParam(params, "plateThickness") / scale,
      );
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
