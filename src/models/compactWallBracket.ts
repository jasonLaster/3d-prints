import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  CompactWallBracketModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;
const LAYOUT_SAMPLES = 720;

export type CompactWallBracketSpec = {
  span: number;
  rise: number;
  sourceAspectRatio: number;
  bodyDepth: number;
  braceDepth: number;
  baseThickness: number;
  diagonalThickness: number;
  centerWebThickness: number;
  pairGap: number;
  plateSize: number;
  plateEdgeMargin: number;
  pairAngleDegrees: number;
  pairSeparationOffset: number;
  pairCenterOffset: number;
  pairCenterX: number;
  pairCenterY: number;
  twoUpWidth: number;
  twoUpDepth: number;
  twoUpFits: boolean;
  sparePlateWidth: number;
  sparePlateDepth: number;
  scaleFactor: number;
};

type SectionTriangle = {
  points: [THREE.Vector2, THREE.Vector2, THREE.Vector2];
  depth: number;
};

type EdgeUse = {
  start: THREE.Vector2;
  end: THREE.Vector2;
  depth: number;
};

type PairLayout = {
  angle: number;
  centerOffset: number;
  separationOffset: number;
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
};

function polygonArea(points: THREE.Vector2[]) {
  return points.reduce((area, current, index) => {
    const next = points[(index + 1) % points.length];
    return area + current.x * next.y - next.x * current.y;
  }, 0) / 2;
}

function ring(points: THREE.Vector2[], clockwise: boolean) {
  const copy = points.map((point) => point.clone());
  return (polygonArea(copy) < 0) === clockwise ? copy : copy.reverse();
}

function rotatePoint(point: THREE.Vector2, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new THREE.Vector2(
    point.x * cosine - point.y * sine,
    point.x * sine + point.y * cosine,
  );
}

function getOuterCorner(span: number, baseThickness: number) {
  return Math.min(4.5, baseThickness * 0.45, (span / 2) * 0.08);
}

function getPairPoints(
  span: number,
  rise: number,
  baseThickness: number,
  pairGap: number,
  angle: number,
) {
  const outerCorner = getOuterCorner(span, baseThickness);
  const diagonalRise = rise - outerCorner;
  const edgeGapFactor = diagonalRise / Math.hypot(diagonalRise, span / 2);
  const separationOffset = pairGap / edgeGapFactor;
  const pairCenterSeparation =
    (span / 2) * (rise / diagonalRise) + separationOffset;
  const centerOffset = pairCenterSeparation / 2;
  const upright = [
    new THREE.Vector2(-span / 2, -rise / 2 + outerCorner),
    new THREE.Vector2(-span / 2 + outerCorner, -rise / 2),
    new THREE.Vector2(span / 2 - outerCorner, -rise / 2),
    new THREE.Vector2(span / 2, -rise / 2 + outerCorner),
    new THREE.Vector2(0, rise / 2),
  ];
  const left = upright.map((point) =>
    rotatePoint(point.clone().add(new THREE.Vector2(-centerOffset, 0)), angle),
  );
  const right = upright.map((point) =>
    rotatePoint(
      rotatePoint(point.clone(), Math.PI).add(
        new THREE.Vector2(centerOffset, 0),
      ),
      angle,
    ),
  );
  return { centerOffset, points: [...left, ...right], separationOffset };
}

function measurePairAtAngle(
  span: number,
  rise: number,
  baseThickness: number,
  pairGap: number,
  angle: number,
) {
  const pair = getPairPoints(span, rise, baseThickness, pairGap, angle);
  const xs = pair.points.map((point) => point.x);
  const ys = pair.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    ...pair,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    depth: maxY - minY,
    score: Math.max(maxX - minX, maxY - minY),
    width: maxX - minX,
  };
}

function getOptimalPairLayout(
  span: number,
  rise: number,
  baseThickness: number,
  pairGap: number,
): PairLayout {
  let bestAngle = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  const step = Math.PI / 2 / LAYOUT_SAMPLES;
  for (let index = 0; index <= LAYOUT_SAMPLES; index += 1) {
    const angle = index * step;
    const score = measurePairAtAngle(
      span,
      rise,
      baseThickness,
      pairGap,
      angle,
    ).score;
    if (score < bestScore) {
      bestAngle = angle;
      bestScore = score;
    }
  }

  let low = Math.max(0, bestAngle - step);
  let high = Math.min(Math.PI / 2, bestAngle + step);
  for (let index = 0; index < 36; index += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (
      measurePairAtAngle(span, rise, baseThickness, pairGap, left).score <
      measurePairAtAngle(span, rise, baseThickness, pairGap, right).score
    ) {
      high = right;
    } else {
      low = left;
    }
  }
  const angle = (low + high) / 2;
  const measured = measurePairAtAngle(
    span,
    rise,
    baseThickness,
    pairGap,
    angle,
  );
  return {
    angle,
    centerOffset: measured.centerOffset,
    separationOffset: measured.separationOffset,
    centerX: measured.centerX,
    centerY: measured.centerY,
    width: measured.width,
    depth: measured.depth,
  };
}

export function getCompactWallBracketSpec(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
): CompactWallBracketSpec {
  const span = getParam(params, "span");
  const sourceAspectRatio = model.geometry.sourceSpan / model.geometry.sourceRise;
  const rise = span / sourceAspectRatio;
  const bodyDepth = getParam(params, "bodyDepth");
  const braceDepth = getParam(params, "braceDepth");
  const baseThickness = getParam(params, "baseThickness");
  const diagonalThickness = getParam(params, "diagonalThickness");
  const centerWebThickness = getParam(params, "centerWebThickness");
  const pairGap = getParam(params, "pairGap");
  const plateSize = getParam(params, "plateSize");
  const plateEdgeMargin = getParam(params, "plateEdgeMargin");
  const layout = getOptimalPairLayout(
    span,
    rise,
    baseThickness,
    pairGap,
  );
  const usablePlateSpan = plateSize - plateEdgeMargin * 2;
  return {
    span,
    rise,
    sourceAspectRatio,
    bodyDepth,
    braceDepth,
    baseThickness,
    diagonalThickness,
    centerWebThickness,
    pairGap,
    plateSize,
    plateEdgeMargin,
    pairAngleDegrees: THREE.MathUtils.radToDeg(layout.angle),
    pairSeparationOffset: layout.separationOffset,
    pairCenterOffset: layout.centerOffset,
    pairCenterX: layout.centerX,
    pairCenterY: layout.centerY,
    twoUpWidth: layout.width,
    twoUpDepth: layout.depth,
    twoUpFits:
      layout.width <= usablePlateSpan + EPSILON &&
      layout.depth <= usablePlateSpan + EPSILON,
    sparePlateWidth: usablePlateSpan - layout.width,
    sparePlateDepth: usablePlateSpan - layout.depth,
    scaleFactor: span / model.geometry.sourceSpan,
  };
}

function getSectionRings(spec: CompactWallBracketSpec) {
  const halfSpan = spec.span / 2;
  const outerCorner = getOuterCorner(spec.span, spec.baseThickness);
  const slope = (spec.rise - outerCorner) / halfSpan;
  const diagonalOffset =
    spec.diagonalThickness * Math.sqrt(slope * slope + 1);
  const innerLineY = (x: number) =>
    slope * x + spec.rise - diagonalOffset;
  const innerLineX = (y: number) =>
    (y - spec.rise + diagonalOffset) / slope;
  const cornerRise = Math.min(3, spec.diagonalThickness * 0.48);
  const bottomFlare = Math.min(5, spec.centerWebThickness * 0.8);
  const webChamfer = Math.min(4, spec.centerWebThickness * 0.62);
  const topFlare = Math.min(4, spec.centerWebThickness * 0.5);
  const topChamfer = Math.min(2.2, spec.centerWebThickness * 0.35);
  const railBottomY = spec.baseThickness + cornerRise;
  const railBottomX = innerLineX(railBottomY);
  const railTopX = -(spec.centerWebThickness / 2 + topFlare);
  const railTopY = innerLineY(railTopX);
  const webHalf = spec.centerWebThickness / 2;

  const outer = ring(
    [
      new THREE.Vector2(-halfSpan, outerCorner),
      new THREE.Vector2(-halfSpan + outerCorner, 0),
      new THREE.Vector2(halfSpan - outerCorner, 0),
      new THREE.Vector2(halfSpan, outerCorner),
      new THREE.Vector2(0, spec.rise),
    ],
    false,
  );
  const leftHole = ring(
    [
      new THREE.Vector2(railBottomX, railBottomY),
      new THREE.Vector2(railTopX, railTopY),
      new THREE.Vector2(-webHalf, railTopY - topChamfer),
      new THREE.Vector2(-webHalf, spec.baseThickness + webChamfer),
      new THREE.Vector2(-(webHalf + bottomFlare), spec.baseThickness),
      new THREE.Vector2(railBottomX + cornerRise * 0.45, spec.baseThickness),
    ],
    true,
  );
  const rightHole = ring(
    leftHole.map((point) => new THREE.Vector2(-point.x, point.y)),
    true,
  );
  return { leftHole, outer, rightHole };
}

function dedupePolygon(points: THREE.Vector2[]) {
  const deduped: THREE.Vector2[] = [];
  for (const point of points) {
    if (
      !deduped.length ||
      point.distanceToSquared(deduped[deduped.length - 1]) > 1e-12
    ) {
      deduped.push(point);
    }
  }
  if (
    deduped.length > 1 &&
    deduped[0].distanceToSquared(deduped[deduped.length - 1]) <= 1e-12
  ) {
    deduped.pop();
  }
  return deduped;
}

function clipAtY(
  input: THREE.Vector2[],
  splitY: number,
  keepAbove: boolean,
) {
  const output: THREE.Vector2[] = [];
  const inside = (point: THREE.Vector2) =>
    keepAbove ? point.y >= splitY - EPSILON : point.y <= splitY + EPSILON;
  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[(index + 1) % input.length];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside) output.push(current.clone());
    if (currentInside !== nextInside) {
      const t = (splitY - current.y) / (next.y - current.y);
      output.push(
        new THREE.Vector2(
          THREE.MathUtils.lerp(current.x, next.x, t),
          splitY,
        ),
      );
    }
  }
  return dedupePolygon(output);
}

function triangulateSection(spec: CompactWallBracketSpec) {
  const { leftHole, outer, rightHole } = getSectionRings(spec);
  const vertices = [...outer, ...leftHole, ...rightHole];
  const faces = THREE.ShapeUtils.triangulateShape(outer, [leftHole, rightHole]);
  const triangles: SectionTriangle[] = [];
  const addPolygon = (polygon: THREE.Vector2[], depth: number) => {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      triangles.push({
        depth,
        points: [polygon[0].clone(), polygon[index].clone(), polygon[index + 1].clone()],
      });
    }
  };
  for (const face of faces) {
    const triangle = face.map((index) => vertices[index].clone());
    const base = clipAtY(triangle, spec.baseThickness, false);
    const brace = clipAtY(triangle, spec.baseThickness, true);
    if (base.length >= 3 && Math.abs(polygonArea(base)) > EPSILON) {
      addPolygon(base, spec.bodyDepth);
    }
    if (brace.length >= 3 && Math.abs(polygonArea(brace)) > EPSILON) {
      addPolygon(brace, spec.braceDepth);
    }
  }
  return triangles;
}

function pointKey(point: THREE.Vector2) {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
}

function edgeKey(start: THREE.Vector2, end: THREE.Vector2) {
  return [pointKey(start), pointKey(end)].sort().join("|");
}

function addTriangle(
  positions: number[],
  a: THREE.Vector2,
  b: THREE.Vector2,
  c: THREE.Vector2,
  z: number,
  reverse = false,
) {
  const points = reverse ? [c, b, a] : [a, b, c];
  points.forEach((point) => positions.push(point.x, point.y, z));
}

function addQuad(
  positions: number[],
  start: THREE.Vector2,
  end: THREE.Vector2,
  low: number,
  high: number,
) {
  positions.push(
    start.x, start.y, low,
    end.x, end.y, low,
    end.x, end.y, high,
    start.x, start.y, low,
    end.x, end.y, high,
    start.x, start.y, high,
  );
}

function createSteppedFrameGeometry(spec: CompactWallBracketSpec) {
  const triangles = triangulateSection(spec);
  const positions: number[] = [];
  const edges = new Map<string, EdgeUse[]>();

  for (const triangle of triangles) {
    let [a, b, c] = triangle.points;
    if (polygonArea([a, b, c]) < 0) [b, c] = [c, b];
    addTriangle(positions, a, b, c, triangle.depth);
    addTriangle(positions, a, b, c, 0, true);
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(start, end);
      const uses = edges.get(key) ?? [];
      uses.push({ start, end, depth: triangle.depth });
      edges.set(key, uses);
    }
  }

  for (const uses of edges.values()) {
    if (uses.length === 1) {
      if (uses[0].depth > spec.braceDepth + EPSILON) {
        addQuad(
          positions,
          uses[0].start,
          uses[0].end,
          0,
          spec.braceDepth,
        );
        addQuad(
          positions,
          uses[0].start,
          uses[0].end,
          spec.braceDepth,
          uses[0].depth,
        );
      } else {
        addQuad(positions, uses[0].start, uses[0].end, 0, uses[0].depth);
      }
      continue;
    }
    const depths = [...new Set(uses.map((use) => use.depth.toFixed(6)))].map(Number);
    if (depths.length > 1) {
      addQuad(
        positions,
        uses[0].start,
        uses[0].end,
        Math.min(...depths),
        Math.max(...depths),
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.translate(0, -spec.rise / 2, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCompactWallBracketGeometry(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
) {
  return createSteppedFrameGeometry(getCompactWallBracketSpec(params, model));
}

export function createCompactWallBracketTwoUpGeometries(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
) {
  const spec = getCompactWallBracketSpec(params, model);
  const left = createSteppedFrameGeometry(spec);
  const right = createSteppedFrameGeometry(spec);
  left.translate(-spec.pairCenterOffset, 0, 0);
  right.rotateZ(Math.PI);
  right.translate(spec.pairCenterOffset, 0, 0);
  const angle = THREE.MathUtils.degToRad(spec.pairAngleDegrees);
  left.rotateZ(angle);
  right.rotateZ(angle);
  for (const geometry of [left, right]) {
    geometry.translate(-spec.pairCenterX, -spec.pairCenterY, 0);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return [left, right];
}

export function getCompactWallBracketDimensions(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
): ModelDimensions {
  const spec = getCompactWallBracketSpec(params, model);
  return {
    length: spec.span,
    width: spec.rise,
    height: spec.bodyDepth,
  };
}

export function updateCompactWallBracketGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
) {
  const dimensions = getCompactWallBracketDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

function pairFits(
  span: number,
  model: CompactWallBracketModelDefinition,
  baseThickness: number,
  pairGap: number,
  usablePlateSpan: number,
) {
  const rise = span / (model.geometry.sourceSpan / model.geometry.sourceRise);
  const layout = getOptimalPairLayout(span, rise, baseThickness, pairGap);
  return Math.max(layout.width, layout.depth) <= usablePlateSpan + EPSILON;
}

function maximumFittingValue(
  low: number,
  high: number,
  fits: (value: number) => boolean,
) {
  if (!fits(low)) return low;
  if (fits(high)) return high;
  for (let index = 0; index < 32; index += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function getCompactWallBracketParameterLimits(
  model: CompactWallBracketModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const plateSize = getParam(params, "plateSize");
  const plateEdgeMargin = getParam(params, "plateEdgeMargin");
  const pairGap = getParam(params, "pairGap");
  const span = getParam(params, "span");
  const bodyDepth = getParam(params, "bodyDepth");
  const braceDepth = getParam(params, "braceDepth");
  const baseThickness = getParam(params, "baseThickness");
  const diagonalThickness = getParam(params, "diagonalThickness");
  const centerWebThickness = getParam(params, "centerWebThickness");
  const rise = span / (model.geometry.sourceSpan / model.geometry.sourceRise);
  const usablePlateSpan = plateSize - plateEdgeMargin * 2;
  const layout = getOptimalPairLayout(span, rise, baseThickness, pairGap);

  if (key === "span") {
    limits.min = Math.max(
      limits.min,
      centerWebThickness * 5 + diagonalThickness * 4,
    );
    limits.max = Math.min(
      limits.max,
      maximumFittingValue(limits.min, limits.max, (value) =>
        pairFits(value, model, baseThickness, pairGap, usablePlateSpan),
      ),
    );
  } else if (key === "bodyDepth") {
    limits.min = Math.max(limits.min, braceDepth);
  } else if (key === "braceDepth") {
    limits.min = Math.max(limits.min, model.geometry.sourceCoreDepth);
    limits.max = Math.min(limits.max, bodyDepth);
  } else if (key === "baseThickness") {
    limits.min = Math.max(limits.min, model.geometry.sourceBaseThickness);
    limits.max = Math.min(limits.max, rise / 3);
  } else if (key === "diagonalThickness") {
    limits.min = Math.max(
      limits.min,
      model.geometry.sourceDiagonalThickness,
    );
    limits.max = Math.min(limits.max, rise / 4, span / 8);
  } else if (key === "centerWebThickness") {
    limits.min = Math.max(
      limits.min,
      model.geometry.sourceDiagonalThickness,
    );
    limits.max = Math.min(limits.max, span / 5);
  } else if (key === "pairGap") {
    limits.max = Math.min(
      limits.max,
      maximumFittingValue(limits.min, limits.max, (value) =>
        pairFits(span, model, baseThickness, value, usablePlateSpan),
      ),
    );
  } else if (key === "plateSize") {
    limits.min = Math.max(
      limits.min,
      Math.ceil(
        Math.max(layout.width, layout.depth) + plateEdgeMargin * 2,
      ),
    );
  } else if (key === "plateEdgeMargin") {
    limits.max = Math.min(
      limits.max,
      (plateSize - Math.max(layout.width, layout.depth)) / 2,
    );
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getCompactWallBracketAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: CompactWallBracketModelDefinition,
): AuditItem {
  const spec = getCompactWallBracketSpec(params, model);
  if (check.key === "compactEnvelope") {
    return {
      label: check.label,
      value: `${formatLength(spec.span, unit)} × ${formatLength(spec.rise, unit)} × ${formatLength(spec.bodyDepth, unit)}`,
      status: "pass",
    };
  }
  if (check.key === "sourceScale") {
    return {
      label: check.label,
      value: `${(spec.scaleFactor * 100).toFixed(1)}% span and rise · source ratio ${spec.sourceAspectRatio.toFixed(3)}:1`,
      status: "pass",
    };
  }
  if (check.key === "depthProfile") {
    const valid =
      spec.bodyDepth + EPSILON >= spec.braceDepth &&
      spec.braceDepth + EPSILON >= model.geometry.sourceCoreDepth;
    return {
      label: check.label,
      value: `${formatLength(spec.bodyDepth, unit)} base body · ${formatLength(spec.braceDepth, unit)} diagonal and center · one face flush`,
      status: valid ? "pass" : "warn",
    };
  }
  if (check.key === "memberSections") {
    const preserved =
      spec.baseThickness + EPSILON >= model.geometry.sourceBaseThickness &&
      spec.diagonalThickness + EPSILON >=
        model.geometry.sourceDiagonalThickness &&
      spec.centerWebThickness + EPSILON >=
        model.geometry.sourceDiagonalThickness;
    return {
      label: check.label,
      value: `${formatLength(spec.baseThickness, unit)} base · ${formatLength(spec.diagonalThickness, unit)} diagonal · ${formatLength(spec.centerWebThickness, unit)} center`,
      status: preserved ? "pass" : "warn",
    };
  }
  if (check.key === "boltInterface") {
    return {
      label: check.label,
      value: "Source mesh has no bolt bores; none were resized or invented",
      status: "pass",
    };
  }
  if (check.key === "twoUpFootprint") {
    return {
      label: check.label,
      value: `${formatLength(spec.twoUpWidth, unit)} × ${formatLength(spec.twoUpDepth, unit)} at ${spec.pairAngleDegrees.toFixed(1)}° on ${formatLength(spec.plateSize, unit)} plate`,
      status: spec.twoUpFits ? "pass" : "warn",
    };
  }
  return {
    label: check.label,
    value: spec.twoUpFits
      ? `${formatLength(spec.sparePlateWidth, unit)} width and ${formatLength(spec.sparePlateDepth, unit)} depth spare inside margins`
      : "Increase the plate size or reduce span, gap, or edge margin",
    status: spec.twoUpFits ? "pass" : "warn",
  };
}
