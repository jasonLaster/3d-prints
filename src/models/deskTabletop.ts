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

const EPSILON = 1e-6;
const MINIMUM_MODELED_CORNER_RADIUS = 1;
const MINIMUM_BAND_REMAINDER = 6.35;

type DeskTabletopSpec = {
  scale: number;
  length: number;
  width: number;
  coreThickness: number;
  surfaceThickness: number;
  totalThickness: number;
  edgeBandWidth: number;
  cornerRadius: number;
  topRoundoverRadius: number;
  bottomRoundoverRadius: number;
  undersideBevelInset: number;
  undersideBevelDepth: number;
  finishSystem: "plywood-veneer" | "flooring-strips";
  stripWidth: number;
  stripLengthMin: number;
  stripLengthMax: number;
  seamGap: number;
  innerLength: number;
  innerWidth: number;
};

type LoftLayer = {
  z: number;
  inset: number;
};

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function roundedRectRing(
  length: number,
  width: number,
  radius: number,
  segments: number,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const safeRadius = Math.max(
    MINIMUM_MODELED_CORNER_RADIUS,
    Math.min(radius, halfLength - EPSILON, halfWidth - EPSILON),
  );
  const centers = [
    new THREE.Vector2(halfLength - safeRadius, halfWidth - safeRadius),
    new THREE.Vector2(-halfLength + safeRadius, halfWidth - safeRadius),
    new THREE.Vector2(-halfLength + safeRadius, -halfWidth + safeRadius),
    new THREE.Vector2(halfLength - safeRadius, -halfWidth + safeRadius),
  ];
  return centers.flatMap((center, cornerIndex) =>
    Array.from({ length: segments }, (_, segmentIndex) => {
      const angle =
        (cornerIndex * Math.PI) / 2 +
        (segmentIndex / segments) * (Math.PI / 2);
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
  const size = bounds.getSize(new THREE.Vector3());
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

function createRoundedPrism(
  length: number,
  width: number,
  height: number,
  radius: number,
  segments: number,
  z = 0,
) {
  const ring = roundedRectRing(length, width, radius, segments);
  const shape = new THREE.Shape(ring);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, z);
  assignPlanarUvs(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function createEdgeBandGeometry(
  spec: DeskTabletopSpec,
  cornerSegments: number,
  edgeProfileSegments: number,
) {
  const layers: LoftLayer[] = [];
  const addLayer = (z: number, inset: number) => {
    const safeLayer = {
      z: Math.max(0, Math.min(spec.totalThickness, z)),
      inset: Math.max(0, inset),
    };
    const previous = layers[layers.length - 1];
    if (
      previous &&
      Math.abs(previous.z - safeLayer.z) < EPSILON &&
      Math.abs(previous.inset - safeLayer.inset) < EPSILON
    ) {
      return;
    }
    layers.push(safeLayer);
  };

  const bottomRadius = Math.min(
    spec.bottomRoundoverRadius,
    spec.totalThickness / 2,
  );
  for (let index = 0; index <= edgeProfileSegments; index += 1) {
    const angle = (index / edgeProfileSegments) * (Math.PI / 2);
    addLayer(
      bottomRadius - bottomRadius * Math.cos(angle),
      spec.undersideBevelInset + bottomRadius - bottomRadius * Math.sin(angle),
    );
  }
  addLayer(
    Math.max(spec.undersideBevelDepth, bottomRadius),
    0,
  );

  const topRadius = Math.min(
    spec.topRoundoverRadius,
    spec.totalThickness / 2,
  );
  addLayer(spec.totalThickness - topRadius, 0);
  for (let index = 1; index <= edgeProfileSegments; index += 1) {
    const angle = (index / edgeProfileSegments) * (Math.PI / 2);
    addLayer(
      spec.totalThickness - topRadius + topRadius * Math.sin(angle),
      topRadius - topRadius * Math.cos(angle),
    );
  }

  layers.sort((a, b) => a.z - b.z || b.inset - a.inset);
  const outerRings = layers.map((layer) =>
    roundedRectRing(
      spec.length - layer.inset * 2,
      spec.width - layer.inset * 2,
      Math.max(EPSILON, spec.cornerRadius - layer.inset),
      cornerSegments,
    ),
  );
  const innerRadius = Math.max(EPSILON, spec.cornerRadius - spec.edgeBandWidth);
  const innerBottom = roundedRectRing(
    spec.innerLength,
    spec.innerWidth,
    innerRadius,
    cornerSegments,
  );
  const innerTop = innerBottom.map((point) => point.clone());
  const positions: number[] = [];

  for (let layerIndex = 0; layerIndex < outerRings.length - 1; layerIndex += 1) {
    const lower = outerRings[layerIndex];
    const upper = outerRings[layerIndex + 1];
    for (let index = 0; index < lower.length; index += 1) {
      const next = (index + 1) % lower.length;
      const a = new THREE.Vector3(lower[index].x, lower[index].y, layers[layerIndex].z);
      const b = new THREE.Vector3(lower[next].x, lower[next].y, layers[layerIndex].z);
      const c = new THREE.Vector3(upper[next].x, upper[next].y, layers[layerIndex + 1].z);
      const d = new THREE.Vector3(upper[index].x, upper[index].y, layers[layerIndex + 1].z);
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }

  const outerBottom = outerRings[0];
  const outerTop = outerRings[outerRings.length - 1];
  const bottomZ = layers[0].z;
  const topZ = layers[layers.length - 1].z;
  for (let index = 0; index < outerBottom.length; index += 1) {
    const next = (index + 1) % outerBottom.length;
    const ob = new THREE.Vector3(outerBottom[index].x, outerBottom[index].y, bottomZ);
    const obn = new THREE.Vector3(outerBottom[next].x, outerBottom[next].y, bottomZ);
    const ib = new THREE.Vector3(innerBottom[index].x, innerBottom[index].y, bottomZ);
    const ibn = new THREE.Vector3(innerBottom[next].x, innerBottom[next].y, bottomZ);
    addTriangle(positions, ob, ibn, obn);
    addTriangle(positions, ob, ib, ibn);

    const ot = new THREE.Vector3(outerTop[index].x, outerTop[index].y, topZ);
    const otn = new THREE.Vector3(outerTop[next].x, outerTop[next].y, topZ);
    const it = new THREE.Vector3(innerTop[index].x, innerTop[index].y, topZ);
    const itn = new THREE.Vector3(innerTop[next].x, innerTop[next].y, topZ);
    addTriangle(positions, ot, otn, itn);
    addTriangle(positions, ot, itn, it);

    addTriangle(positions, ib, itn, ibn);
    addTriangle(positions, ib, it, itn);
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

export function isDeskTabletopParams(params: ModelParams) {
  return Number.isFinite(params.coreThickness) && Number.isFinite(params.surfaceThickness);
}

export function getDeskTabletopSpec(params: ModelParams): DeskTabletopSpec {
  const scale = getParam(params, "mockScale");
  const divide = (key: string) => getParam(params, key) / scale;
  const length = divide("tableLength");
  const width = divide("tableWidth");
  const coreThickness = divide("coreThickness");
  const surfaceThickness = divide("surfaceThickness");
  const edgeBandWidth = divide("edgeBandWidth");
  return {
    scale,
    length,
    width,
    coreThickness,
    surfaceThickness,
    totalThickness: coreThickness + surfaceThickness,
    edgeBandWidth,
    cornerRadius: divide("tabletopCornerRadius"),
    topRoundoverRadius: divide("topRoundoverRadius"),
    bottomRoundoverRadius: divide("bottomRoundoverRadius"),
    undersideBevelInset: divide("undersideBevelInset"),
    undersideBevelDepth: divide("undersideBevelDepth"),
    finishSystem:
      getParam(params, "finishSystem") >= 0.5
        ? "flooring-strips"
        : "plywood-veneer",
    stripWidth: divide("stripWidth"),
    stripLengthMin: divide("stripLengthMin"),
    stripLengthMax: divide("stripLengthMax"),
    seamGap: divide("seamGap"),
    innerLength: length - edgeBandWidth * 2,
    innerWidth: width - edgeBandWidth * 2,
  };
}

export function createDeskTabletopSurfaceGeometries(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  const spec = getDeskTabletopSpec(params);
  const z = spec.coreThickness;
  if (spec.finishSystem === "plywood-veneer") {
    const perimeterReveal = Math.max(spec.seamGap, 0.1);
    return [
      createRoundedPrism(
        spec.innerLength - perimeterReveal,
        spec.innerWidth - perimeterReveal,
        spec.surfaceThickness,
        Math.max(EPSILON, spec.cornerRadius - spec.edgeBandWidth),
        model.geometry.cornerSegments,
        z,
      ),
    ];
  }

  const geometries: THREE.BufferGeometry[] = [];
  let row = 0;
  let y = -spec.innerWidth / 2;
  while (y < spec.innerWidth / 2 - EPSILON) {
    const rawRowWidth = Math.min(spec.stripWidth, spec.innerWidth / 2 - y);
    const visibleWidth = Math.max(EPSILON, rawRowWidth - spec.seamGap);
    let x = -spec.innerLength / 2;
    let piece = 0;
    while (x < spec.innerLength / 2 - EPSILON) {
      const remaining = spec.innerLength / 2 - x;
      const sequence = ((row * 37 + piece * 53 + 17) % 101) / 100;
      let rawLength = Math.min(
        remaining,
        spec.stripLengthMin +
          (spec.stripLengthMax - spec.stripLengthMin) * sequence,
      );
      if (remaining - rawLength < spec.stripLengthMin * 0.4) {
        rawLength = remaining;
      }
      const visibleLength = Math.max(EPSILON, rawLength - spec.seamGap);
      const box = new THREE.BoxGeometry(
        visibleLength,
        visibleWidth,
        spec.surfaceThickness,
      );
      const geometry = box.toNonIndexed();
      box.dispose();
      geometry.translate(
        x + rawLength / 2,
        y + rawRowWidth / 2,
        z + spec.surfaceThickness / 2,
      );
      assignPlanarUvs(geometry);
      geometries.push(geometry);
      x += rawLength;
      piece += 1;
    }
    y += rawRowWidth;
    row += 1;
  }
  return geometries;
}

export function createDeskTabletopGeometry(
  params: ModelParams,
  model: DiningTableModelDefinition,
) {
  const spec = getDeskTabletopSpec(params);
  const band = createEdgeBandGeometry(
    spec,
    model.geometry.cornerSegments,
    model.geometry.edgeProfileSegments,
  );
  const coreBandOverlap = Math.min(1, spec.edgeBandWidth / 4);
  const core = createRoundedPrism(
    spec.innerLength + coreBandOverlap * 2,
    spec.innerWidth + coreBandOverlap * 2,
    spec.coreThickness,
    Math.max(EPSILON, spec.cornerRadius - spec.edgeBandWidth),
    model.geometry.cornerSegments,
  );
  const surface = createDeskTabletopSurfaceGeometries(params, model);
  const sources = [band, core, ...surface];
  const merged = mergeGeometries(sources, false);
  sources.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge desk tabletop geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function getDeskTabletopDimensions(params: ModelParams): ModelDimensions {
  const spec = getDeskTabletopSpec(params);
  return {
    length: spec.length,
    width: spec.width,
    height: spec.totalThickness,
  };
}

export function updateDeskTabletopGuide(mesh: THREE.Mesh, params: ModelParams) {
  const dimensions = getDeskTabletopDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

export function getDeskTabletopParameterLimits(
  model: DiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const coreThickness = getParam(params, "coreThickness");
  const surfaceThickness = getParam(params, "surfaceThickness");
  const totalThickness = coreThickness + surfaceThickness;
  const bandWidth = getParam(params, "edgeBandWidth");
  const bevelInset = getParam(params, "undersideBevelInset");
  const stripMin = getParam(params, "stripLengthMin");
  const stripMax = getParam(params, "stripLengthMax");

  if (key === "edgeBandWidth") {
    limits.max = Math.min(limits.max, Math.min(length, width) / 4);
  } else if (key === "tabletopCornerRadius") {
    limits.max = Math.min(limits.max, bandWidth);
  } else if (key === "topRoundoverRadius") {
    limits.max = Math.min(
      limits.max,
      totalThickness / 2,
      bandWidth - MINIMUM_BAND_REMAINDER,
    );
  } else if (key === "bottomRoundoverRadius") {
    limits.max = Math.min(
      limits.max,
      totalThickness / 2,
      bandWidth - bevelInset - MINIMUM_BAND_REMAINDER,
    );
  } else if (key === "undersideBevelInset") {
    limits.max = Math.min(
      limits.max,
      bandWidth - getParam(params, "bottomRoundoverRadius") - MINIMUM_BAND_REMAINDER,
    );
  } else if (key === "undersideBevelDepth") {
    limits.max = Math.min(
      limits.max,
      totalThickness - getParam(params, "topRoundoverRadius"),
    );
  } else if (key === "stripWidth") {
    limits.max = Math.min(limits.max, width - bandWidth * 2);
    limits.min = Math.max(limits.min, getParam(params, "seamGap") * 4);
  } else if (key === "stripLengthMin") {
    limits.max = Math.min(limits.max, stripMax, length - bandWidth * 2);
  } else if (key === "stripLengthMax") {
    limits.min = Math.max(limits.min, stripMin);
    limits.max = Math.min(limits.max, length - bandWidth * 2);
  } else if (key === "seamGap") {
    limits.max = Math.min(limits.max, getParam(params, "stripWidth") / 4);
  }

  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

function item(
  label: string,
  value: string,
  status: "pass" | "warn" = "pass",
): AuditItem {
  return { label, value, status };
}

export function getDeskTabletopAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const spec = getDeskTabletopSpec(params);
  const fullLength = getParam(params, "tableLength");
  const fullWidth = getParam(params, "tableWidth");
  const coreThickness = getParam(params, "coreThickness");
  const surfaceThickness = getParam(params, "surfaceThickness");
  const totalThickness = coreThickness + surfaceThickness;
  const bandWidth = getParam(params, "edgeBandWidth");
  const finish =
    spec.finishSystem === "plywood-veneer"
      ? "White-oak plywood veneer"
      : "Unfinished white-oak flooring strips";
  switch (check.key) {
    case "deskEnvelope":
      return item(
        check.label,
        `${formatLength(fullLength, unit)} × ${formatLength(fullWidth, unit)} × ${formatLength(totalThickness, unit)}`,
      );
    case "deskLayerBuild":
      return item(
        check.label,
        `${formatLength(coreThickness, unit)} core + ${formatLength(surfaceThickness, unit)} ${finish.toLowerCase()}`,
      );
    case "deskEdgeBand":
      return item(
        check.label,
        `${formatLength(bandWidth, unit)} solid white oak around all four sides`,
        bandWidth >= 25.4 && bandWidth <= 50.8 ? "pass" : "warn",
      );
    case "deskEdgeProfile":
      return item(
        check.label,
        `${formatLength(getParam(params, "topRoundoverRadius"), unit)} top · ${formatLength(getParam(params, "bottomRoundoverRadius"), unit)} bottom · ${formatLength(getParam(params, "undersideBevelInset"), unit)} inset over ${formatLength(getParam(params, "undersideBevelDepth"), unit)}`,
      );
    case "deskCornerRadius":
      return item(
        check.label,
        `${formatLength(getParam(params, "tabletopCornerRadius"), unit)} plan radius inside ${formatLength(bandWidth, unit)} band`,
        getParam(params, "tabletopCornerRadius") <= bandWidth ? "pass" : "warn",
      );
    case "deskStripLayout":
      return spec.finishSystem === "plywood-veneer"
        ? item(check.label, "Continuous inset veneer field; strip controls retained for switching")
        : item(
            check.label,
            `${formatLength(getParam(params, "stripWidth"), unit)} rows · ${formatLength(getParam(params, "stripLengthMin"), unit)}–${formatLength(getParam(params, "stripLengthMax"), unit)} staggered lengths · ${formatLength(getParam(params, "seamGap"), unit)} reveal`,
          );
    case "deskCoreCoverage": {
      const innerLength = fullLength - bandWidth * 2;
      const innerWidth = fullWidth - bandWidth * 2;
      return item(
        check.label,
        `${formatLength(innerLength, unit)} × ${formatLength(innerWidth, unit)} inset field; band carries every routed edge`,
        innerLength > 0 && innerWidth > 0 ? "pass" : "warn",
      );
    }
    case "deskMockEnvelope":
      return item(
        check.label,
        `1:${spec.scale.toFixed(0)} · ${spec.length.toFixed(1)} × ${spec.width.toFixed(1)} × ${spec.totalThickness.toFixed(1)} mm`,
        spec.length <= 256 && spec.width <= 256 ? "pass" : "warn",
      );
    case "deskMinimumFeature": {
      const feature = Math.min(
        getParam(params, "surfaceThickness"),
        getParam(params, "seamGap"),
        getParam(params, "topRoundoverRadius"),
        getParam(params, "bottomRoundoverRadius"),
      ) / spec.scale;
      return item(
        check.label,
        `${feature.toFixed(2)} mm at model scale`,
        feature >= 0.19 ? "pass" : "warn",
      );
    }
    default:
      return item(check.label, "Unsupported audit check", "warn");
  }
}
