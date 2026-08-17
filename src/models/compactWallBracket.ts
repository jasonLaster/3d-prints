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
const MIN_HOLE_EDGE_WALL = 1;
const MIN_HOLE_ROW_WEB = 2;
const MIN_HOLE_END_WALL = 10;

export type CompactWallBracketSpec = {
  span: number;
  rise: number;
  sourceAspectRatio: number;
  bodyDepth: number;
  braceDepth: number;
  baseThickness: number;
  diagonalThickness: number;
  centerWebThickness: number;
  mountingHoleDiameter: number;
  mountingHoleApexInset: number;
  mountingHoleRowSpacing: number;
  mountingHoleEdgeInset: number;
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
  const mountingHoleDiameter = getParam(params, "mountingHoleDiameter");
  const mountingHoleApexInset = getParam(params, "mountingHoleApexInset");
  const mountingHoleRowSpacing = getParam(params, "mountingHoleRowSpacing");
  const mountingHoleEdgeInset = getParam(params, "mountingHoleEdgeInset");
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
    mountingHoleDiameter,
    mountingHoleApexInset,
    mountingHoleRowSpacing,
    mountingHoleEdgeInset,
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

function addMappedTriangle(
  positions: number[],
  points: [THREE.Vector2, THREE.Vector2, THREE.Vector2],
  mapPoint: (point: THREE.Vector2) => THREE.Vector3,
  reverse = false,
) {
  const ordered = reverse ? [points[2], points[1], points[0]] : points;
  ordered.forEach((point) => positions.push(...mapPoint(point).toArray()));
}

function addDrilledDiagonalFaces(
  positions: number[],
  spec: CompactWallBracketSpec,
  side: -1 | 1,
  outerEdge: EdgeUse,
  innerEdge: EdgeUse,
) {
  const apex = new THREE.Vector2(0, spec.rise);
  const outerCorner = getOuterCorner(spec.span, spec.baseThickness);
  const base = new THREE.Vector2(side * spec.span / 2, outerCorner);
  const tangent = base.clone().sub(apex).normalize();
  const projectU = (point: THREE.Vector2) =>
    point.clone().sub(apex).dot(tangent);
  const holeCenters = [
    spec.mountingHoleApexInset,
    spec.mountingHoleApexInset + spec.mountingHoleRowSpacing,
  ].flatMap((alongRail) => [
    new THREE.Vector2(alongRail, spec.mountingHoleEdgeInset),
    new THREE.Vector2(alongRail, spec.braceDepth - spec.mountingHoleEdgeInset),
  ]);
  const radius = spec.mountingHoleDiameter / 2;
  const segments = 32;
  const circle = (center: THREE.Vector2) =>
    Array.from({ length: segments }, (_, index) => {
      const angle = index / segments * Math.PI * 2;
      return new THREE.Vector2(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
      );
    });

  const addFace = (edge: EdgeUse, reverse: boolean) => {
    const edgeStartU = projectU(edge.start);
    const low = Math.min(edgeStartU, projectU(edge.end));
    const high = Math.max(edgeStartU, projectU(edge.end));
    const contour = ring(
      [
        new THREE.Vector2(low, 0),
        new THREE.Vector2(high, 0),
        new THREE.Vector2(high, spec.braceDepth),
        new THREE.Vector2(low, spec.braceDepth),
      ],
      false,
    );
    const holes = holeCenters.map((center) => ring(circle(center), true));
    const vertices = [...contour, ...holes.flat()];
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const mapPoint = (point: THREE.Vector2) => {
      const planar = edge.start
        .clone()
        .addScaledVector(tangent, point.x - edgeStartU);
      return new THREE.Vector3(planar.x, planar.y, point.y);
    };
    faces.forEach((face) =>
      addMappedTriangle(
        positions,
        face.map((index) => vertices[index]) as [
          THREE.Vector2,
          THREE.Vector2,
          THREE.Vector2,
        ],
        mapPoint,
        reverse,
      ),
    );
  };

  addFace(outerEdge, side < 0);
  addFace(innerEdge, side > 0);

  const outerStartU = projectU(outerEdge.start);
  const innerStartU = projectU(innerEdge.start);
  const mapOnEdge = (
    edge: EdgeUse,
    edgeStartU: number,
    point: THREE.Vector2,
  ) => {
    const planar = edge.start
      .clone()
      .addScaledVector(tangent, point.x - edgeStartU);
    return new THREE.Vector3(planar.x, planar.y, point.y);
  };
  for (const center of holeCenters) {
    const points = circle(center);
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const outerCurrent = mapOnEdge(outerEdge, outerStartU, current);
      const outerNext = mapOnEdge(outerEdge, outerStartU, next);
      const innerCurrent = mapOnEdge(innerEdge, innerStartU, current);
      const innerNext = mapOnEdge(innerEdge, innerStartU, next);
      const quad = side > 0
        ? [outerCurrent, innerCurrent, innerNext, outerNext]
        : [outerCurrent, outerNext, innerNext, innerCurrent];
      positions.push(
        ...quad[0].toArray(), ...quad[1].toArray(), ...quad[2].toArray(),
        ...quad[0].toArray(), ...quad[2].toArray(), ...quad[3].toArray(),
      );
    }
  }
}

function orientClosedTriangles(positions: number[]) {
  const triangleCount = positions.length / 9;
  const vertexKey = (triangle: number, corner: number) => {
    const offset = triangle * 9 + corner * 3;
    return positions
      .slice(offset, offset + 3)
      .map((value) => value.toFixed(6))
      .join(",");
  };
  const edgeUses = new Map<string, { triangle: number; direction: number }[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const keys = [0, 1, 2].map((corner) => vertexKey(triangle, corner));
    for (const [start, end] of [
      [keys[0], keys[1]],
      [keys[1], keys[2]],
      [keys[2], keys[0]],
    ]) {
      const key = start < end ? `${start}|${end}` : `${end}|${start}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push({ triangle, direction: start < end ? 1 : -1 });
      edgeUses.set(key, uses);
    }
  }
  const adjacent = Array.from({ length: triangleCount }, () => [] as {
    triangle: number;
    sameDirection: boolean;
  }[]);
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) continue;
    adjacent[uses[0].triangle].push({
      triangle: uses[1].triangle,
      sameDirection: uses[0].direction === uses[1].direction,
    });
    adjacent[uses[1].triangle].push({
      triangle: uses[0].triangle,
      sameDirection: uses[0].direction === uses[1].direction,
    });
  }
  const flips = new Array<boolean | undefined>(triangleCount);
  const components: number[][] = [];
  for (let start = 0; start < triangleCount; start += 1) {
    if (flips[start] !== undefined) continue;
    flips[start] = false;
    const queue = [start];
    const component: number[] = [];
    while (queue.length) {
      const triangle = queue.pop()!;
      component.push(triangle);
      for (const neighbor of adjacent[triangle]) {
        const expected = Boolean(flips[triangle]) !== neighbor.sameDirection;
        if (flips[neighbor.triangle] === undefined) {
          flips[neighbor.triangle] = expected;
          queue.push(neighbor.triangle);
        }
      }
    }
    components.push(component);
  }
  const swapTriangle = (triangle: number) => {
    const offset = triangle * 9;
    for (let axis = 0; axis < 3; axis += 1) {
      [positions[offset + 3 + axis], positions[offset + 6 + axis]] = [
        positions[offset + 6 + axis],
        positions[offset + 3 + axis],
      ];
    }
  };
  flips.forEach((flip, triangle) => {
    if (flip) swapTriangle(triangle);
  });
  for (const component of components) {
    let signedVolume = 0;
    for (const triangle of component) {
      const offset = triangle * 9;
      const a = new THREE.Vector3(...positions.slice(offset, offset + 3));
      const b = new THREE.Vector3(...positions.slice(offset + 3, offset + 6));
      const c = new THREE.Vector3(...positions.slice(offset + 6, offset + 9));
      signedVolume += a.dot(b.cross(c)) / 6;
    }
    if (signedVolume < 0) component.forEach(swapTriangle);
  }
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

  const diagonalBoundaryUses = [...edges.values()]
    .filter((uses) => {
      if (uses.length !== 1 || uses[0].depth !== spec.braceDepth) return false;
      const delta = uses[0].end.clone().sub(uses[0].start);
      return Math.abs(delta.x) > spec.span * 0.2 &&
        Math.abs(delta.y) > spec.rise * 0.2;
    })
    .map((uses) => uses[0]);
  const drilledEdges = new Set(diagonalBoundaryUses);
  for (const side of [-1, 1] as const) {
    const sideEdges = diagonalBoundaryUses
      .filter((use) => (use.start.x + use.end.x) / 2 * side > 0)
      .sort((left, right) => {
        const leftMid = Math.abs((left.start.x + left.end.x) / 2);
        const rightMid = Math.abs((right.start.x + right.end.x) / 2);
        return rightMid - leftMid;
      });
    if (sideEdges.length === 2) {
      addDrilledDiagonalFaces(
        positions,
        spec,
        side,
        sideEdges[0],
        sideEdges[1],
      );
    }
  }

  for (const uses of edges.values()) {
    if (uses.length === 1) {
      if (drilledEdges.has(uses[0])) continue;
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

  orientClosedTriangles(positions);

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
  const spec = getCompactWallBracketSpec(params, model);
  return createSteppedFrameGeometry(spec);
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
  const mountingHoleDiameter = getParam(params, "mountingHoleDiameter");
  const mountingHoleApexInset = getParam(params, "mountingHoleApexInset");
  const mountingHoleRowSpacing = getParam(params, "mountingHoleRowSpacing");
  const mountingHoleEdgeInset = getParam(params, "mountingHoleEdgeInset");
  const rise = span / (model.geometry.sourceSpan / model.geometry.sourceRise);
  const limitSpec = getCompactWallBracketSpec(params, model);
  const { leftHole: leftSectionHole } = getSectionRings(limitSpec);
  const limitApex = new THREE.Vector2(0, rise);
  const limitTangent = new THREE.Vector2(
    -span / 2,
    getOuterCorner(span, baseThickness) - rise,
  ).normalize();
  const innerDiagonalUs = [leftSectionHole[0], leftSectionHole[1]].map(
    (point) => point.clone().sub(limitApex).dot(limitTangent),
  );
  const innerDiagonalMinU = Math.min(...innerDiagonalUs);
  const innerDiagonalMaxU = Math.max(...innerDiagonalUs);
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
    limits.min = Math.max(
      limits.min,
      model.geometry.sourceCoreDepth,
      mountingHoleEdgeInset * 2 + mountingHoleDiameter + MIN_HOLE_ROW_WEB,
    );
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
  } else if (key === "mountingHoleDiameter") {
    limits.max = Math.min(
      limits.max,
      (mountingHoleEdgeInset - MIN_HOLE_EDGE_WALL) * 2,
      braceDepth - mountingHoleEdgeInset * 2 - MIN_HOLE_ROW_WEB,
    );
  } else if (key === "mountingHoleApexInset") {
    limits.min = Math.max(
      limits.min,
      innerDiagonalMinU + mountingHoleDiameter / 2 + MIN_HOLE_END_WALL,
    );
    limits.max = Math.min(
      limits.max,
      innerDiagonalMaxU - mountingHoleRowSpacing - mountingHoleDiameter / 2 - MIN_HOLE_END_WALL,
    );
  } else if (key === "mountingHoleRowSpacing") {
    limits.min = Math.max(
      limits.min,
      mountingHoleDiameter + MIN_HOLE_ROW_WEB,
    );
    limits.max = Math.min(
      limits.max,
      innerDiagonalMaxU - mountingHoleApexInset - mountingHoleDiameter / 2 - MIN_HOLE_END_WALL,
    );
  } else if (key === "mountingHoleEdgeInset") {
    limits.min = Math.max(
      limits.min,
      mountingHoleDiameter / 2 + MIN_HOLE_EDGE_WALL,
    );
    limits.max = Math.min(
      limits.max,
      (braceDepth - mountingHoleDiameter - MIN_HOLE_ROW_WEB) / 2,
    );
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
    const edgeWall = spec.mountingHoleEdgeInset - spec.mountingHoleDiameter / 2;
    const rowWeb =
      spec.braceDepth -
      spec.mountingHoleEdgeInset * 2 -
      spec.mountingHoleDiameter;
    return {
      label: check.label,
      value: `8 × ${formatLength(spec.mountingHoleDiameter, unit)} through-holes · ${formatLength(spec.mountingHoleApexInset, unit)} first row · ${formatLength(spec.mountingHoleRowSpacing, unit)} spacing`,
      status:
        edgeWall + EPSILON >= MIN_HOLE_EDGE_WALL &&
        rowWeb + EPSILON >= MIN_HOLE_ROW_WEB
          ? "pass"
          : "warn",
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
