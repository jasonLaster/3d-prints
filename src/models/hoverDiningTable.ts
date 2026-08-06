import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength, formatSignedLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  HoverDiningTableModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-5;
const MIN_BRACE_SPAN = 101.6;

type BracePlaneSpec = {
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  spanX: number;
  spanY: number;
  endpointY: number;
  diagonalLength: number;
  angleRadians: number;
  zBottom: number;
  zTop: number;
  halfLapDepth: number;
};

export type HoverDiningTableSpec = {
  scale: number;
  length: number;
  width: number;
  height: number;
  topThickness: number;
  topBottom: number;
  topEdgeRoll: number;
  topEdgeTension: number;
  sideOverhang: number;
  endOverhang: number;
  frameDepth: number;
  frameSideWidth: number;
  frameBottomRailHeight: number;
  frameTopRailHeight: number;
  frameBottomSpread: number;
  frameOuterCornerRadius: number;
  frameInnerCornerRadius: number;
  frameOuterCurveTension: number;
  frameInnerCurveTension: number;
  frameEdgeRoundover: number;
  halfLapClearance: number;
  frameHeight: number;
  frameTopWidth: number;
  frameBottomWidth: number;
  openingTopWidth: number;
  openingBottomWidth: number;
  openingHeight: number;
  openingBottom: number;
  openingTop: number;
  frameCenterX: number;
  braceSpanX: number;
  upperBrace: BracePlaneSpec;
  lowerBrace: BracePlaneSpec;
};

function createBracePlaneSpec({
  width,
  thickness,
  endpointInset,
  edgeRadius,
  spanX,
  frameWidth,
  frameSideWidth,
  zBottom,
  zTop,
}: {
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  spanX: number;
  frameWidth: number;
  frameSideWidth: number;
  zBottom: number;
  zTop: number;
}): BracePlaneSpec {
  const endpointY = frameWidth / 2 - frameSideWidth / 2 - endpointInset;
  const spanY = endpointY * 2;
  return {
    width,
    thickness,
    endpointInset,
    edgeRadius,
    spanX,
    spanY,
    endpointY,
    diagonalLength: Math.hypot(spanX, spanY),
    angleRadians: Math.atan2(spanY, spanX),
    zBottom,
    zTop,
    halfLapDepth: thickness / 2,
  };
}

function rawHoverDiningTableSpec(params: ModelParams): HoverDiningTableSpec {
  const scale = getParam(params, "mockScale");
  const length = getParam(params, "tableLength");
  const width = getParam(params, "tableWidth");
  const height = getParam(params, "overallHeight");
  const topThickness = getParam(params, "topThickness");
  const topBottom = height - topThickness;
  const sideOverhang = getParam(params, "sideOverhang");
  const frameTopWidth = width - sideOverhang * 2;
  const frameBottomSpread = getParam(params, "frameBottomSpread");
  const frameBottomWidth = frameTopWidth + frameBottomSpread;
  const frameSideWidth = getParam(params, "frameSideWidth");
  const openingTopWidth = frameTopWidth - frameSideWidth * 2;
  const openingBottomWidth = frameBottomWidth - frameSideWidth * 2;
  const frameBottomRailHeight = getParam(params, "frameBottomRailHeight");
  const frameTopRailHeight = getParam(params, "frameTopRailHeight");
  const frameHeight = topBottom;
  const openingBottom = frameBottomRailHeight;
  const openingTop = frameHeight - frameTopRailHeight;
  const frameDepth = getParam(params, "frameDepth");
  const endOverhang = getParam(params, "endOverhang");
  const braceSpanX = length - 2 * (endOverhang + frameDepth);
  const upperBraceThickness = getParam(params, "upperBraceThickness");
  const lowerBraceThickness = getParam(params, "lowerBraceThickness");

  return {
    scale,
    length,
    width,
    height,
    topThickness,
    topBottom,
    topEdgeRoll: getParam(params, "topEdgeRoll"),
    topEdgeTension: getParam(params, "topEdgeTension"),
    sideOverhang,
    endOverhang,
    frameDepth,
    frameSideWidth,
    frameBottomRailHeight,
    frameTopRailHeight,
    frameBottomSpread,
    frameOuterCornerRadius: getParam(params, "frameOuterCornerRadius"),
    frameInnerCornerRadius: getParam(params, "frameInnerCornerRadius"),
    frameOuterCurveTension: getParam(params, "frameOuterCurveTension"),
    frameInnerCurveTension: getParam(params, "frameInnerCurveTension"),
    frameEdgeRoundover: getParam(params, "frameEdgeRoundover"),
    halfLapClearance: getParam(params, "halfLapClearance"),
    frameHeight,
    frameTopWidth,
    frameBottomWidth,
    openingTopWidth,
    openingBottomWidth,
    openingHeight: openingTop - openingBottom,
    openingBottom,
    openingTop,
    frameCenterX: length / 2 - endOverhang - frameDepth / 2,
    braceSpanX,
    upperBrace: createBracePlaneSpec({
      width: getParam(params, "upperBraceWidth"),
      thickness: upperBraceThickness,
      endpointInset: getParam(params, "upperBraceEndpointInset"),
      edgeRadius: getParam(params, "upperBraceEdgeRadius"),
      spanX: braceSpanX,
      frameWidth: frameTopWidth,
      frameSideWidth,
      zBottom: topBottom - upperBraceThickness,
      zTop: topBottom,
    }),
    lowerBrace: createBracePlaneSpec({
      width: getParam(params, "lowerBraceWidth"),
      thickness: lowerBraceThickness,
      endpointInset: getParam(params, "lowerBraceEndpointInset"),
      edgeRadius: getParam(params, "lowerBraceEdgeRadius"),
      spanX: braceSpanX,
      frameWidth: frameBottomWidth,
      frameSideWidth,
      zBottom: 0,
      zTop: lowerBraceThickness,
    }),
  };
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive value; received ${value}`);
  }
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative; received ${value}`);
  }
}

function assertBracePlane(
  brace: BracePlaneSpec,
  spec: HoverDiningTableSpec,
  label: "Upper" | "Lower",
  railHeight: number,
  frameWidth: number,
) {
  for (const [dimensionLabel, value] of [
    [`${label} brace width`, brace.width],
    [`${label} brace thickness`, brace.thickness],
    [`${label} brace edge radius`, brace.edgeRadius],
    [`${label} brace longitudinal span`, brace.spanX],
    [`${label} brace lateral span`, brace.spanY],
    [`${label} brace diagonal length`, brace.diagonalLength],
  ] as const) {
    assertPositive(value, dimensionLabel);
  }
  assertNonNegative(brace.endpointInset, `${label} brace endpoint inset`);
  if (brace.spanX < MIN_BRACE_SPAN) {
    throw new Error(`${label} X needs a positive structural span between end boxes`);
  }
  if (brace.endpointY <= brace.width / 2) {
    throw new Error(`${label} X endpoints must remain separated across the table width`);
  }
  if (brace.width > spec.frameSideWidth + EPSILON) {
    throw new Error(`${label} brace width must fit its end-box side-member zone`);
  }
  if (brace.thickness > railHeight + EPSILON) {
    throw new Error(`${label} brace thickness must fit its end-box rail zone`);
  }
  if (brace.edgeRadius * 2 >= Math.min(brace.width, brace.thickness)) {
    throw new Error(`${label} brace edge radius must preserve a flat cross-section`);
  }
  const directionX = Math.cos(brace.angleRadians);
  const lateralEnvelope = brace.endpointY + (brace.width * directionX) / 2;
  if (lateralEnvelope > frameWidth / 2 + EPSILON) {
    throw new Error(`${label} X brace endpoints project outside the end-box silhouette`);
  }
  if (Math.abs(brace.diagonalLength - Math.hypot(brace.spanX, brace.spanY)) > EPSILON) {
    throw new Error(`${label} diagonal length must remain derived from both spans`);
  }
  if (Math.abs(brace.angleRadians - Math.atan2(brace.spanY, brace.spanX)) > EPSILON) {
    throw new Error(`${label} diagonal angle must remain derived rather than independently rotated`);
  }
  if (Math.abs(brace.halfLapDepth * 2 - brace.thickness) > EPSILON) {
    throw new Error(`${label} half-lap depth must equal half the brace thickness`);
  }
}

/**
 * Central construction assertions. Geometry, audit, and export all pass through
 * this contract so parameter edits cannot silently detach an X, open a contact
 * gap, or turn a centered half-lap into overlapping solids.
 */
export function assertHoverDiningTableSpec(spec: HoverDiningTableSpec) {
  for (const [label, value] of [
    ["mock scale", spec.scale],
    ["table length", spec.length],
    ["table width", spec.width],
    ["overall height", spec.height],
    ["top thickness", spec.topThickness],
    ["top edge roll", spec.topEdgeRoll],
    ["frame depth", spec.frameDepth],
    ["frame side width", spec.frameSideWidth],
    ["frame bottom rail", spec.frameBottomRailHeight],
    ["frame top rail", spec.frameTopRailHeight],
    ["frame outer radius", spec.frameOuterCornerRadius],
    ["frame inner radius", spec.frameInnerCornerRadius],
    ["frame edge round-over", spec.frameEdgeRoundover],
  ] as const) {
    assertPositive(value, label);
  }
  assertNonNegative(spec.halfLapClearance, "Half-lap fit clearance");

  if (spec.topThickness >= spec.height) {
    throw new Error("Tabletop thickness must remain below the overall height");
  }
  if (spec.frameHeight <= spec.frameBottomRailHeight + spec.frameTopRailHeight) {
    throw new Error("End-box rails leave no positive interior opening height");
  }
  if (spec.frameTopWidth >= spec.width || spec.frameBottomWidth > spec.width + EPSILON) {
    throw new Error("Both end-box silhouettes must remain inside the tabletop width");
  }
  if (spec.openingTopWidth <= 0 || spec.openingBottomWidth <= 0) {
    throw new Error("End-box side members leave no positive interior opening width");
  }
  if (spec.frameCenterX - spec.frameDepth / 2 <= -spec.length / 2) {
    throw new Error("End-box placement extends beyond the tabletop length");
  }
  if (
    spec.frameInnerCornerRadius * 2 >=
    Math.min(spec.openingTopWidth, spec.openingBottomWidth, spec.openingHeight)
  ) {
    throw new Error("Interior corner radius must fit inside the end-box opening");
  }
  if (
    spec.frameOuterCornerRadius * 2 >=
    Math.min(spec.frameTopWidth, spec.frameBottomWidth, spec.frameHeight)
  ) {
    throw new Error("Exterior corner radius must fit inside the end-box silhouette");
  }
  if (
    spec.frameEdgeRoundover * 2 >=
    Math.min(
      spec.frameDepth,
      spec.frameSideWidth,
      spec.frameBottomRailHeight,
      spec.frameTopRailHeight,
    )
  ) {
    throw new Error("Frame edge round-over must preserve flat material on every member");
  }
  if (spec.topEdgeRoll * 2 >= spec.width) {
    throw new Error("Tabletop edge roll must leave a positive flat top width");
  }
  if (Math.abs(spec.frameHeight - spec.topBottom) > EPSILON) {
    throw new Error("End boxes must terminate at the tabletop underside without a hover gap");
  }

  assertBracePlane(
    spec.upperBrace,
    spec,
    "Upper",
    spec.frameTopRailHeight,
    spec.frameTopWidth,
  );
  assertBracePlane(
    spec.lowerBrace,
    spec,
    "Lower",
    spec.frameBottomRailHeight,
    spec.frameBottomWidth,
  );
  if (Math.abs(spec.upperBrace.zTop - spec.topBottom) > EPSILON) {
    throw new Error("Upper X top envelope must contact the tabletop underside");
  }
  if (spec.upperBrace.zBottom < spec.lowerBrace.zTop + EPSILON) {
    throw new Error("Upper and lower X assemblies must remain vertically separate");
  }
  if (Math.abs(spec.lowerBrace.zBottom) > EPSILON) {
    throw new Error("Lower X bottom envelope must contact the floor at Z = 0");
  }
  if (
    spec.halfLapClearance >=
    Math.min(spec.upperBrace.thickness, spec.lowerBrace.thickness) / 2
  ) {
    throw new Error("Half-lap clearance must leave positive mating material in both Xs");
  }
  for (const [label, tension] of [
    ["tabletop edge", spec.topEdgeTension],
    ["outer frame corner", spec.frameOuterCurveTension],
    ["inner frame corner", spec.frameInnerCurveTension],
  ] as const) {
    if (tension < 0.3 || tension > 0.9) {
      throw new Error(`${label} Bézier tension must stay between 0.3 and 0.9`);
    }
  }
}

function scaleBrace(brace: BracePlaneSpec, scale: number): BracePlaneSpec {
  return {
    ...brace,
    width: brace.width / scale,
    thickness: brace.thickness / scale,
    endpointInset: brace.endpointInset / scale,
    edgeRadius: brace.edgeRadius / scale,
    spanX: brace.spanX / scale,
    spanY: brace.spanY / scale,
    endpointY: brace.endpointY / scale,
    diagonalLength: brace.diagonalLength / scale,
    zBottom: brace.zBottom / scale,
    zTop: brace.zTop / scale,
    halfLapDepth: brace.halfLapDepth / scale,
  };
}

export function getHoverDiningTableSpec(params: ModelParams) {
  const fullSize = rawHoverDiningTableSpec(params);
  assertHoverDiningTableSpec(fullSize);
  const { scale } = fullSize;
  const scaled: HoverDiningTableSpec = {
    ...fullSize,
    length: fullSize.length / scale,
    width: fullSize.width / scale,
    height: fullSize.height / scale,
    topThickness: fullSize.topThickness / scale,
    topBottom: fullSize.topBottom / scale,
    topEdgeRoll: fullSize.topEdgeRoll / scale,
    sideOverhang: fullSize.sideOverhang / scale,
    endOverhang: fullSize.endOverhang / scale,
    frameDepth: fullSize.frameDepth / scale,
    frameSideWidth: fullSize.frameSideWidth / scale,
    frameBottomRailHeight: fullSize.frameBottomRailHeight / scale,
    frameTopRailHeight: fullSize.frameTopRailHeight / scale,
    frameBottomSpread: fullSize.frameBottomSpread / scale,
    frameOuterCornerRadius: fullSize.frameOuterCornerRadius / scale,
    frameInnerCornerRadius: fullSize.frameInnerCornerRadius / scale,
    frameEdgeRoundover: fullSize.frameEdgeRoundover / scale,
    halfLapClearance: fullSize.halfLapClearance / scale,
    frameHeight: fullSize.frameHeight / scale,
    frameTopWidth: fullSize.frameTopWidth / scale,
    frameBottomWidth: fullSize.frameBottomWidth / scale,
    openingTopWidth: fullSize.openingTopWidth / scale,
    openingBottomWidth: fullSize.openingBottomWidth / scale,
    openingHeight: fullSize.openingHeight / scale,
    openingBottom: fullSize.openingBottom / scale,
    openingTop: fullSize.openingTop / scale,
    frameCenterX: fullSize.frameCenterX / scale,
    braceSpanX: fullSize.braceSpanX / scale,
    upperBrace: scaleBrace(fullSize.upperBrace, scale),
    lowerBrace: scaleBrace(fullSize.lowerBrace, scale),
  };
  return { fullSize, scaled };
}

function addRoundedTrapezoid(
  path: THREE.Path | THREE.Shape,
  bottomWidth: number,
  topWidth: number,
  bottom: number,
  top: number,
  radius: number,
  tension: number,
) {
  const bottomLeft = new THREE.Vector2(-bottomWidth / 2, bottom);
  const bottomRight = new THREE.Vector2(bottomWidth / 2, bottom);
  const topRight = new THREE.Vector2(topWidth / 2, top);
  const topLeft = new THREE.Vector2(-topWidth / 2, top);
  const rightDirection = topRight.clone().sub(bottomRight).normalize();
  const leftDownDirection = bottomLeft.clone().sub(topLeft).normalize();

  const bottomLeftStart = new THREE.Vector2(bottomLeft.x + radius, bottom);
  const bottomRightStart = new THREE.Vector2(bottomRight.x - radius, bottom);
  const rightLower = bottomRight.clone().addScaledVector(rightDirection, radius);
  const rightUpper = topRight.clone().addScaledVector(rightDirection, -radius);
  const topRightEnd = new THREE.Vector2(topRight.x - radius, top);
  const topLeftStart = new THREE.Vector2(topLeft.x + radius, top);
  const leftUpper = topLeft.clone().addScaledVector(leftDownDirection, radius);
  const leftLower = bottomLeft.clone().addScaledVector(leftDownDirection, -radius);

  path.moveTo(bottomLeftStart.x, bottomLeftStart.y);
  path.lineTo(bottomRightStart.x, bottomRightStart.y);
  path.bezierCurveTo(
    bottomRightStart.x + radius * tension,
    bottom,
    rightLower.x - rightDirection.x * radius * tension,
    rightLower.y - rightDirection.y * radius * tension,
    rightLower.x,
    rightLower.y,
  );
  path.lineTo(rightUpper.x, rightUpper.y);
  path.bezierCurveTo(
    rightUpper.x + rightDirection.x * radius * tension,
    rightUpper.y + rightDirection.y * radius * tension,
    topRightEnd.x + radius * tension,
    top,
    topRightEnd.x,
    topRightEnd.y,
  );
  path.lineTo(topLeftStart.x, topLeftStart.y);
  path.bezierCurveTo(
    topLeftStart.x - radius * tension,
    top,
    leftUpper.x - leftDownDirection.x * radius * tension,
    leftUpper.y - leftDownDirection.y * radius * tension,
    leftUpper.x,
    leftUpper.y,
  );
  path.lineTo(leftLower.x, leftLower.y);
  path.bezierCurveTo(
    leftLower.x + leftDownDirection.x * radius * tension,
    leftLower.y + leftDownDirection.y * radius * tension,
    bottomLeftStart.x - radius * tension,
    bottom,
    bottomLeftStart.x,
    bottomLeftStart.y,
  );
  path.closePath();
}

function createTabletopCrossSection(spec: HoverDiningTableSpec) {
  const shape = new THREE.Shape();
  const halfWidth = spec.width / 2;
  const halfHeight = spec.topThickness / 2;
  const shoulder = halfWidth - spec.topEdgeRoll;
  const tension = spec.topEdgeTension;
  const height = spec.topThickness;

  shape.moveTo(-shoulder, 0);
  shape.lineTo(shoulder, 0);
  shape.bezierCurveTo(
    shoulder + spec.topEdgeRoll * tension,
    0,
    halfWidth,
    halfHeight - halfHeight * tension,
    halfWidth,
    halfHeight,
  );
  shape.bezierCurveTo(
    halfWidth,
    halfHeight + halfHeight * tension,
    shoulder + spec.topEdgeRoll * tension,
    height,
    shoulder,
    height,
  );
  shape.lineTo(-shoulder, height);
  shape.bezierCurveTo(
    -shoulder - spec.topEdgeRoll * tension,
    height,
    -halfWidth,
    halfHeight + halfHeight * tension,
    -halfWidth,
    halfHeight,
  );
  shape.bezierCurveTo(
    -halfWidth,
    halfHeight - halfHeight * tension,
    -shoulder - spec.topEdgeRoll * tension,
    0,
    -shoulder,
    0,
  );
  shape.closePath();
  return shape;
}

function createTabletopGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
) {
  const geometry = new THREE.ExtrudeGeometry(createTabletopCrossSection(spec), {
    bevelEnabled: false,
    curveSegments: model.geometry.curveSegments,
    depth: spec.length,
    steps: 1,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      0, 0, 1, -spec.length / 2,
      1, 0, 0, 0,
      0, 1, 0, spec.topBottom,
      0, 0, 0, 1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function createEndFrameGeometry(
  spec: HoverDiningTableSpec,
  model: HoverDiningTableModelDefinition,
  x: number,
) {
  const shape = new THREE.Shape();
  addRoundedTrapezoid(
    shape,
    spec.frameBottomWidth,
    spec.frameTopWidth,
    0,
    spec.frameHeight,
    spec.frameOuterCornerRadius,
    spec.frameOuterCurveTension,
  );
  const opening = new THREE.Path();
  addRoundedTrapezoid(
    opening,
    spec.openingBottomWidth,
    spec.openingTopWidth,
    spec.openingBottom,
    spec.openingTop,
    spec.frameInnerCornerRadius,
    spec.frameInnerCurveTension,
  );
  shape.holes.push(opening);

  const bevelThickness = spec.frameEdgeRoundover;
  const depth = spec.frameDepth - bevelThickness * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelOffset: -bevelThickness,
    bevelSegments: model.geometry.bevelSegments,
    bevelSize: bevelThickness,
    bevelThickness,
    curveSegments: model.geometry.curveSegments,
    depth,
    steps: 1,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      0, 0, 1, x - depth / 2,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function polygonArea(points: THREE.Vector2[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function ensureCounterClockwise(points: THREE.Vector2[]) {
  return polygonArea(points) < 0 ? points.slice().reverse() : points;
}

function roundedBraceFootprint(
  brace: BracePlaneSpec,
  slopeSign: -1 | 1,
  cornerSegments: number,
) {
  const start = new THREE.Vector2(
    -brace.spanX / 2,
    -slopeSign * brace.endpointY,
  );
  const end = new THREE.Vector2(
    brace.spanX / 2,
    slopeSign * brace.endpointY,
  );
  const direction = end.clone().sub(start).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const halfLength = brace.diagonalLength / 2;
  const halfWidth = brace.width / 2;
  const radius = Math.min(brace.edgeRadius, halfWidth - EPSILON, halfLength - EPSILON);
  const center = start.clone().add(end).multiplyScalar(0.5);
  const localPoints: THREE.Vector2[] = [];
  const corners = [
    { x: halfLength - radius, y: halfWidth - radius, start: 0 },
    { x: -halfLength + radius, y: halfWidth - radius, start: Math.PI / 2 },
    { x: -halfLength + radius, y: -halfWidth + radius, start: Math.PI },
    { x: halfLength - radius, y: -halfWidth + radius, start: (3 * Math.PI) / 2 },
  ];
  for (const corner of corners) {
    for (let index = 0; index <= cornerSegments; index += 1) {
      const angle = corner.start + (index / cornerSegments) * (Math.PI / 2);
      const localX = corner.x + Math.cos(angle) * radius;
      const localY = corner.y + Math.sin(angle) * radius;
      localPoints.push(
        center
          .clone()
          .addScaledVector(direction, localX)
          .addScaledVector(normal, localY),
      );
    }
  }
  return ensureCounterClockwise(localPoints);
}

function clipPolygonHalfPlane(
  polygon: THREE.Vector2[],
  normal: THREE.Vector2,
  offset: number,
  keepLess: boolean,
) {
  const result: THREE.Vector2[] = [];
  const signedDistance = (point: THREE.Vector2) => point.dot(normal) - offset;
  const inside = (distance: number) =>
    keepLess ? distance <= EPSILON : distance >= -EPSILON;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentDistance = signedDistance(current);
    const nextDistance = signedDistance(next);
    const currentInside = inside(currentDistance);
    const nextInside = inside(nextDistance);
    if (currentInside) result.push(current.clone());
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      if (Math.abs(denominator) > EPSILON) {
        const t = currentDistance / denominator;
        result.push(current.clone().lerp(next, t));
      }
    }
  }
  return result.length >= 3 ? ensureCounterClockwise(result) : [];
}

function createPlanPrism(
  points: THREE.Vector2[],
  zBottom: number,
  zTop: number,
) {
  if (points.length < 3 || zTop - zBottom <= EPSILON) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index].x, points[index].y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: zTop - zBottom,
    steps: 1,
  });
  geometry.translate(0, 0, zBottom);
  geometry.computeVertexNormals();
  return geometry;
}

function braceNormal(brace: BracePlaneSpec, slopeSign: -1 | 1) {
  const direction = new THREE.Vector2(
    brace.spanX,
    slopeSign * brace.spanY,
  ).normalize();
  return new THREE.Vector2(-direction.y, direction.x);
}

/**
 * Builds one X as two closed, non-overlapping half-lapped braces. The clipped
 * upper/lower footprints follow the other brace's actual angled edges, so the
 * center shoulders are derived from the included angle rather than overcut as
 * perpendicular slots.
 */
function createHalfLappedX(
  brace: BracePlaneSpec,
  halfLapClearance: number,
  model: HoverDiningTableModelDefinition,
) {
  const a = roundedBraceFootprint(
    brace,
    1,
    model.geometry.braceCornerSegments,
  );
  const b = roundedBraceFootprint(
    brace,
    -1,
    model.geometry.braceCornerSegments,
  );
  const normalA = braceNormal(brace, 1);
  const normalB = braceNormal(brace, -1);
  const midpoint = (brace.zBottom + brace.zTop) / 2;
  const lowerMatingZ = midpoint - halfLapClearance / 2;
  const upperMatingZ = midpoint + halfLapClearance / 2;
  const geometries: THREE.BufferGeometry[] = [];
  const add = (points: THREE.Vector2[], zBottom: number, zTop: number) => {
    const geometry = createPlanPrism(points, zBottom, zTop);
    if (geometry) geometries.push(geometry);
  };

  // Brace A owns the lower half through the crossing.
  add(a, brace.zBottom, lowerMatingZ);
  add(
    clipPolygonHalfPlane(a, normalB, -brace.width / 2, true),
    lowerMatingZ,
    brace.zTop,
  );
  add(
    clipPolygonHalfPlane(a, normalB, brace.width / 2, false),
    lowerMatingZ,
    brace.zTop,
  );

  // Brace B owns the upper half through the crossing.
  add(b, upperMatingZ, brace.zTop);
  add(
    clipPolygonHalfPlane(b, normalA, -brace.width / 2, true),
    brace.zBottom,
    upperMatingZ,
  );
  add(
    clipPolygonHalfPlane(b, normalA, brace.width / 2, false),
    brace.zBottom,
    upperMatingZ,
  );
  return geometries;
}

export function createHoverDiningTableGeometry(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
) {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const geometries = [
    createTabletopGeometry(spec, model),
    createEndFrameGeometry(spec, model, -spec.frameCenterX),
    createEndFrameGeometry(spec, model, spec.frameCenterX),
    ...createHalfLappedX(spec.upperBrace, spec.halfLapClearance, model),
    ...createHalfLappedX(spec.lowerBrace, spec.halfLapClearance, model),
  ];
  const nonIndexed = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry,
  );
  const merged = mergeGeometries(nonIndexed, false);
  for (const geometry of new Set([...geometries, ...nonIndexed])) {
    if (geometry !== merged) geometry.dispose();
  }
  if (!merged) {
    throw new Error("Unable to merge Double-X dining-table geometry");
  }
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function getHoverDiningTableDimensions(params: ModelParams): ModelDimensions {
  const { scaled } = getHoverDiningTableSpec(params);
  return { length: scaled.length, width: scaled.width, height: scaled.height };
}

export function updateHoverDiningTableGuide(mesh: THREE.Mesh, params: ModelParams) {
  const dimensions = getHoverDiningTableDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

export function getHoverDiningTableParameterLimits(
  model: HoverDiningTableModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const spec = rawHoverDiningTableSpec(params);
  const safeMax = (value: number) => Math.max(limits.min, value);

  if (key === "tableLength") {
    limits.min = Math.max(
      limits.min,
      2 * (spec.endOverhang + spec.frameDepth) + MIN_BRACE_SPAN,
    );
  } else if (key === "tableWidth") {
    limits.min = Math.max(
      limits.min,
      2 * spec.sideOverhang +
        2 * spec.frameSideWidth +
        2 * spec.frameInnerCornerRadius,
      spec.frameBottomWidth,
    );
  } else if (key === "overallHeight") {
    limits.min = Math.max(
      limits.min,
      spec.topThickness +
        spec.frameBottomRailHeight +
        spec.frameTopRailHeight +
        2 * spec.frameInnerCornerRadius,
      spec.topThickness + spec.lowerBrace.thickness + spec.upperBrace.thickness,
    );
  } else if (key === "topThickness") {
    limits.max = Math.min(limits.max, spec.height / 5);
  } else if (key === "topEdgeRoll") {
    limits.max = Math.min(limits.max, spec.width / 3);
  } else if (key === "sideOverhang") {
    limits.max = Math.min(
      limits.max,
      (spec.width -
        2 * spec.frameSideWidth -
        2 * spec.frameInnerCornerRadius -
        Math.max(spec.frameBottomSpread, 0)) /
        2,
    );
  } else if (key === "endOverhang") {
    limits.max = Math.min(
      limits.max,
      (spec.length - 2 * spec.frameDepth - MIN_BRACE_SPAN) / 2,
    );
  } else if (key === "frameDepth") {
    limits.min = Math.max(limits.min, spec.frameEdgeRoundover * 2 + limits.step);
    limits.max = Math.min(
      limits.max,
      (spec.length - 2 * spec.endOverhang - MIN_BRACE_SPAN) / 2,
    );
  } else if (key === "frameSideWidth") {
    limits.min = Math.max(
      limits.min,
      spec.frameEdgeRoundover * 2 + limits.step,
      spec.upperBrace.width,
      spec.lowerBrace.width,
    );
    limits.max = Math.min(
      limits.max,
      (Math.min(spec.frameTopWidth, spec.frameBottomWidth) -
        2 * spec.frameInnerCornerRadius) /
        2,
    );
  } else if (key === "frameBottomRailHeight" || key === "frameTopRailHeight") {
    limits.min = Math.max(
      limits.min,
      spec.frameEdgeRoundover * 2 + limits.step,
      key === "frameBottomRailHeight"
        ? spec.lowerBrace.thickness
        : spec.upperBrace.thickness,
    );
    const other =
      key === "frameBottomRailHeight"
        ? spec.frameTopRailHeight
        : spec.frameBottomRailHeight;
    limits.max = Math.min(
      limits.max,
      spec.frameHeight - other - 2 * spec.frameInnerCornerRadius,
    );
  } else if (key === "frameBottomSpread") {
    limits.min = Math.max(
      limits.min,
      -spec.frameTopWidth +
        2 * spec.frameSideWidth +
        2 * spec.frameInnerCornerRadius,
    );
    limits.max = Math.min(limits.max, spec.sideOverhang * 2);
  } else if (key === "frameOuterCornerRadius") {
    limits.max = Math.min(
      limits.max,
      Math.min(spec.frameTopWidth, spec.frameBottomWidth, spec.frameHeight) / 2 -
        limits.step,
    );
  } else if (key === "frameInnerCornerRadius") {
    limits.max = Math.min(
      limits.max,
      Math.min(
        spec.openingTopWidth,
        spec.openingBottomWidth,
        spec.openingHeight,
      ) /
        2 -
        limits.step,
    );
  } else if (key === "frameEdgeRoundover") {
    limits.max = Math.min(
      limits.max,
      Math.min(
        spec.frameDepth,
        spec.frameSideWidth,
        spec.frameBottomRailHeight,
        spec.frameTopRailHeight,
      ) /
        2 -
        limits.step,
    );
  } else if (key === "upperBraceWidth" || key === "lowerBraceWidth") {
    const brace = key === "upperBraceWidth" ? spec.upperBrace : spec.lowerBrace;
    limits.min = Math.max(limits.min, brace.edgeRadius * 2 + limits.step);
    limits.max = Math.min(limits.max, spec.frameSideWidth);
  } else if (key === "upperBraceThickness" || key === "lowerBraceThickness") {
    const upper = key === "upperBraceThickness";
    const brace = upper ? spec.upperBrace : spec.lowerBrace;
    limits.min = Math.max(limits.min, brace.edgeRadius * 2 + limits.step);
    limits.max = Math.min(
      limits.max,
      upper ? spec.frameTopRailHeight : spec.frameBottomRailHeight,
    );
  } else if (
    key === "upperBraceEndpointInset" ||
    key === "lowerBraceEndpointInset"
  ) {
    const brace =
      key === "upperBraceEndpointInset" ? spec.upperBrace : spec.lowerBrace;
    limits.max = Math.min(
      limits.max,
      Math.max(0, (spec.frameSideWidth - brace.width) / 2),
    );
  } else if (key === "upperBraceEdgeRadius" || key === "lowerBraceEdgeRadius") {
    const brace =
      key === "upperBraceEdgeRadius" ? spec.upperBrace : spec.lowerBrace;
    limits.max = Math.min(
      limits.max,
      Math.min(brace.width, brace.thickness) / 2 - limits.step,
    );
  } else if (key === "halfLapClearance") {
    limits.max = Math.min(
      limits.max,
      Math.min(spec.upperBrace.thickness, spec.lowerBrace.thickness) / 4,
    );
  }

  limits.max = safeMax(limits.max);
  return limits;
}

function item(
  label: string,
  value: string,
  status: "pass" | "warn" = "pass",
): AuditItem {
  return { label, value, status };
}

function formatBraceAngle(brace: BracePlaneSpec) {
  return `${THREE.MathUtils.radToDeg(brace.angleRadians).toFixed(1)}°`;
}

export function getHoverDiningTableAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
): AuditItem {
  const { fullSize: spec, scaled } = getHoverDiningTableSpec(params);
  switch (check.key) {
    case "hoverTableEnvelope":
      return item(
        check.label,
        `${formatLength(spec.length, unit)} × ${formatLength(spec.width, unit)} × ${formatLength(spec.height, unit)}`,
      );
    case "hoverTabletopProfile":
      return item(
        check.label,
        `${formatLength(spec.topThickness, unit)} top · ${formatLength(spec.topEdgeRoll, unit)} long-edge roll · flat ends`,
      );
    case "hoverEndBoxes":
      return item(
        check.label,
        `2 × ${formatLength(spec.frameTopWidth, unit)} wide closed boxes`,
      );
    case "hoverBoxOpening":
      return item(
        check.label,
        `${formatLength(spec.openingTopWidth, unit)} top × ${formatLength(spec.openingHeight, unit)} high`,
      );
    case "hoverCornerCurves":
      return item(
        check.label,
        `outer r ${formatLength(spec.frameOuterCornerRadius, unit)} κ${spec.frameOuterCurveTension.toFixed(3)} · inner r ${formatLength(spec.frameInnerCornerRadius, unit)} κ${spec.frameInnerCurveTension.toFixed(3)}`,
      );
    case "hoverBoxSplay":
      return item(
        check.label,
        `${formatSignedLength(spec.frameBottomSpread, unit)} bottom spread`,
      );
    case "hoverUpperX":
      return item(
        check.label,
        `2 × ${formatLength(spec.upperBrace.diagonalLength, unit)} at ±${formatBraceAngle(spec.upperBrace)}`,
      );
    case "hoverLowerX":
      return item(
        check.label,
        `2 × ${formatLength(spec.lowerBrace.diagonalLength, unit)} at ±${formatBraceAngle(spec.lowerBrace)}`,
      );
    case "hoverHalfLaps":
      return item(
        check.label,
        `2 centered · 50% depth · ${formatLength(spec.halfLapClearance, unit)} fit clearance`,
      );
    case "hoverDirectContact":
      return item(
        check.label,
        `upper Z ${formatLength(spec.upperBrace.zTop, unit)} · lower Z ${formatLength(spec.lowerBrace.zBottom, unit)} · zero gaps`,
      );
    case "hoverPrintEnvelope":
      return item(
        check.label,
        `1:${spec.scale.toFixed(0)} · ${scaled.length.toFixed(1)} × ${scaled.width.toFixed(1)} × ${scaled.height.toFixed(1)} mm`,
      );
    default:
      return item(check.label, "Not configured", "warn");
  }
}
