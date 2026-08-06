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
  endpointOuterY: number;
  cornerTangentY: number;
  miterHalfWidth: number;
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
  openingWidth,
  innerCornerRadius,
  zBottom,
  zTop,
}: {
  width: number;
  thickness: number;
  endpointInset: number;
  edgeRadius: number;
  spanX: number;
  openingWidth: number;
  innerCornerRadius: number;
  zBottom: number;
  zTop: number;
}): BracePlaneSpec {
  const cornerTangentY = openingWidth / 2 - innerCornerRadius;
  let endpointY = cornerTangentY - endpointInset - width / 2;
  let miterHalfWidth = width / 2;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const diagonalLength = Math.hypot(spanX, endpointY * 2);
    const directionX = spanX / diagonalLength;
    miterHalfWidth = width / (2 * directionX);
    endpointY = cornerTangentY - endpointInset - miterHalfWidth;
  }
  const spanY = endpointY * 2;
  return {
    width,
    thickness,
    endpointInset,
    edgeRadius,
    spanX,
    spanY,
    endpointY,
    endpointOuterY: endpointY + miterHalfWidth,
    cornerTangentY,
    miterHalfWidth,
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
      openingWidth: openingTopWidth,
      innerCornerRadius: getParam(params, "frameInnerCornerRadius"),
      zBottom: topBottom - upperBraceThickness,
      zTop: topBottom,
    }),
    lowerBrace: createBracePlaneSpec({
      width: getParam(params, "lowerBraceWidth"),
      thickness: lowerBraceThickness,
      endpointInset: getParam(params, "lowerBraceEndpointInset"),
      edgeRadius: getParam(params, "lowerBraceEdgeRadius"),
      spanX: braceSpanX,
      openingWidth: openingBottomWidth,
      innerCornerRadius: getParam(params, "frameInnerCornerRadius"),
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
  if (brace.cornerTangentY <= 0) {
    throw new Error(`${label} end-box opening has no straight rail between its corner radii`);
  }
  if (
    Math.abs(
      brace.endpointOuterY + brace.endpointInset - brace.cornerTangentY,
    ) > EPSILON
  ) {
    throw new Error(`${label} mitered end must stop at the inner-corner tangent`);
  }
  if (brace.width > spec.frameSideWidth + EPSILON) {
    throw new Error(`${label} brace width must fit its end-box member scale`);
  }
  if (brace.thickness > railHeight + EPSILON) {
    throw new Error(`${label} brace thickness must fit its end-box rail zone`);
  }
  if (brace.edgeRadius * 2 >= brace.width) {
    throw new Error(`${label} brace edge radius must preserve a flat cross-section`);
  }
  const directionX = Math.cos(brace.angleRadians);
  const expectedMiterHalfWidth = brace.width / (2 * directionX);
  if (Math.abs(brace.miterHalfWidth - expectedMiterHalfWidth) > EPSILON) {
    throw new Error(`${label} end cut must be angled flush to the end-box face`);
  }
  if (brace.endpointOuterY > brace.cornerTangentY + EPSILON) {
    throw new Error(`${label} X brace end runs into the rounded end-box corner`);
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
  );
  assertBracePlane(
    spec.lowerBrace,
    spec,
    "Lower",
    spec.frameBottomRailHeight,
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
  for (const [label, brace] of [
    ["Upper", spec.upperBrace],
    ["Lower", spec.lowerBrace],
  ] as const) {
    if (brace.edgeRadius >= brace.halfLapDepth - spec.halfLapClearance / 2) {
      throw new Error(`${label} brace round-over must leave square half-lap shoulders`);
    }
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
    endpointOuterY: brace.endpointOuterY / scale,
    cornerTangentY: brace.cornerTangentY / scale,
    miterHalfWidth: brace.miterHalfWidth / scale,
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

function miteredBraceFootprint(brace: BracePlaneSpec, slopeSign: -1 | 1) {
  const halfX = brace.spanX / 2;
  const leftY = -slopeSign * brace.endpointY;
  const rightY = slopeSign * brace.endpointY;
  return ensureCounterClockwise([
    new THREE.Vector2(-halfX, leftY - brace.miterHalfWidth),
    new THREE.Vector2(halfX, rightY - brace.miterHalfWidth),
    new THREE.Vector2(halfX, rightY + brace.miterHalfWidth),
    new THREE.Vector2(-halfX, leftY + brace.miterHalfWidth),
  ]);
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

function insetBraceSides(
  points: THREE.Vector2[],
  brace: BracePlaneSpec,
  slopeSign: -1 | 1,
  inset: number,
) {
  if (inset <= EPSILON) return ensureCounterClockwise(points);
  const normal = braceNormal(brace, slopeSign);
  const limit = brace.width / 2 - inset;
  return clipPolygonHalfPlane(
    clipPolygonHalfPlane(points, normal, limit, true),
    normal,
    -limit,
    false,
  );
}

function alignConvexPolygon(points: THREE.Vector2[]) {
  const polygon = ensureCounterClockwise(points).map((point) => point.clone());
  let startIndex = 0;
  for (let index = 1; index < polygon.length; index += 1) {
    const candidate = polygon[index];
    const current = polygon[startIndex];
    if (
      candidate.x < current.x - EPSILON ||
      (Math.abs(candidate.x - current.x) <= EPSILON &&
        candidate.y < current.y)
    ) {
      startIndex = index;
    }
  }
  return [
    ...polygon.slice(startIndex),
    ...polygon.slice(0, startIndex),
  ];
}

function createRoundedPlanPrism(
  points: THREE.Vector2[],
  zBottom: number,
  zTop: number,
  brace: BracePlaneSpec,
  slopeSign: -1 | 1,
  roundBottom: boolean,
  roundTop: boolean,
  roundoverSegments: number,
) {
  const height = zTop - zBottom;
  if (points.length < 3 || height <= EPSILON) return null;
  const radius = Math.min(
    brace.edgeRadius,
    brace.width / 2 - EPSILON,
    height - EPSILON,
  );
  const layers: Array<{ z: number; inset: number }> = [];
  const pushLayer = (z: number, inset: number) => {
    const previous = layers[layers.length - 1];
    if (previous && Math.abs(previous.z - z) <= EPSILON) {
      previous.inset = Math.min(previous.inset, inset);
    } else {
      layers.push({ z, inset });
    }
  };
  if (roundBottom && radius > EPSILON) {
    for (let index = 0; index <= roundoverSegments; index += 1) {
      const offset = (index / roundoverSegments) * radius;
      const inset =
        radius -
        Math.sqrt(Math.max(0, radius ** 2 - (offset - radius) ** 2));
      pushLayer(zBottom + offset, inset);
    }
  } else {
    pushLayer(zBottom, 0);
  }
  if (roundTop && radius > EPSILON) {
    pushLayer(zTop - radius, 0);
    for (let index = 1; index <= roundoverSegments; index += 1) {
      const offset = (index / roundoverSegments) * radius;
      const inset =
        radius - Math.sqrt(Math.max(0, radius ** 2 - offset ** 2));
      pushLayer(zTop - radius + offset, inset);
    }
  } else {
    pushLayer(zTop, 0);
  }

  const rings = layers.map((layer) => {
    const inset = insetBraceSides(points, brace, slopeSign, layer.inset);
    if (inset.length < 3) {
      throw new Error("Brace round-over consumed a half-lap region");
    }
    return {
      z: layer.z,
      points: alignConvexPolygon(inset),
    };
  });
  const perimeterCount = rings[0].points.length;
  if (
    perimeterCount < 3 ||
    rings.some((ring) => ring.points.length !== perimeterCount)
  ) {
    throw new Error("Rounded X-brace layers must preserve aligned cut planes");
  }
  const positions: number[] = [];
  const addTriangle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const as3 = (point: THREE.Vector2, z: number) =>
    new THREE.Vector3(point.x, point.y, z);

  for (let layerIndex = 0; layerIndex < rings.length - 1; layerIndex += 1) {
    const lower = rings[layerIndex];
    const upper = rings[layerIndex + 1];
    for (let index = 0; index < perimeterCount; index += 1) {
      const next = (index + 1) % perimeterCount;
      const lowerCurrent = as3(lower.points[index], lower.z);
      const lowerNext = as3(lower.points[next], lower.z);
      const upperCurrent = as3(upper.points[index], upper.z);
      const upperNext = as3(upper.points[next], upper.z);
      addTriangle(lowerCurrent, lowerNext, upperNext);
      addTriangle(lowerCurrent, upperNext, upperCurrent);
    }
  }

  const bottom = rings[0];
  const top = rings[rings.length - 1];
  const bottomCenter = bottom.points
    .reduce((sum, point) => sum.add(as3(point, bottom.z)), new THREE.Vector3())
    .multiplyScalar(1 / perimeterCount);
  const topCenter = top.points
    .reduce((sum, point) => sum.add(as3(point, top.z)), new THREE.Vector3())
    .multiplyScalar(1 / perimeterCount);
  for (let index = 0; index < perimeterCount; index += 1) {
    const next = (index + 1) % perimeterCount;
    addTriangle(
      bottomCenter,
      as3(bottom.points[next], bottom.z),
      as3(bottom.points[index], bottom.z),
    );
    addTriangle(
      topCenter,
      as3(top.points[index], top.z),
      as3(top.points[next], top.z),
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
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

function addPlanarWoodUvs(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const position = geometry.getAttribute("position");
  if (!bounds || !position) {
    throw new Error("Unable to derive X-Hover wood texture coordinates");
  }

  const extents = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ];
  const axes = [0, 1, 2].sort((a, b) => extents[b] - extents[a]);
  const primaryAxis = axes[0];
  const secondaryAxis = axes[1];
  const primarySpan = Math.max(extents[primaryAxis], EPSILON);
  const secondarySpan = Math.max(extents[secondaryAxis], EPSILON);
  const minima = [bounds.min.x, bounds.min.y, bounds.min.z];
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const coordinates = [
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ];
    uv[index * 2] =
      (coordinates[primaryAxis] - minima[primaryAxis]) / primarySpan;
    uv[index * 2 + 1] =
      (coordinates[secondaryAxis] - minima[secondaryAxis]) / secondarySpan;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Builds one X as two closed, non-overlapping half-lapped braces. The clipped
 * upper/lower footprints follow the other brace's actual angled edges, so the
 * center shoulders are derived from the included angle rather than overcut as
 * perpendicular slots.
 */
function mergeGeometryList(
  geometries: THREE.BufferGeometry[],
  errorMessage: string,
) {
  const nonIndexed = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry,
  );
  for (const geometry of nonIndexed) {
    addPlanarWoodUvs(geometry);
  }
  const merged = mergeGeometries(nonIndexed, false);
  for (const geometry of new Set([...geometries, ...nonIndexed])) {
    if (geometry !== merged) geometry.dispose();
  }
  if (!merged) throw new Error(errorMessage);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createHalfLappedXParts(
  brace: BracePlaneSpec,
  halfLapClearance: number,
  model: HoverDiningTableModelDefinition,
) {
  const a = miteredBraceFootprint(brace, 1);
  const b = miteredBraceFootprint(brace, -1);
  const normalA = braceNormal(brace, 1);
  const normalB = braceNormal(brace, -1);
  const midpoint = (brace.zBottom + brace.zTop) / 2;
  const lowerMatingZ = midpoint - halfLapClearance / 2;
  const upperMatingZ = midpoint + halfLapClearance / 2;
  const braceAGeometries: THREE.BufferGeometry[] = [];
  const braceBGeometries: THREE.BufferGeometry[] = [];
  const add = (
    target: THREE.BufferGeometry[],
    points: THREE.Vector2[],
    zBottom: number,
    zTop: number,
    slopeSign: -1 | 1,
  ) => {
    const geometry = createRoundedPlanPrism(
      points,
      zBottom,
      zTop,
      brace,
      slopeSign,
      Math.abs(zBottom - brace.zBottom) <= EPSILON,
      Math.abs(zTop - brace.zTop) <= EPSILON,
      model.geometry.braceRoundoverSegments,
    );
    if (geometry) target.push(geometry);
  };

  // Brace A owns the lower half through the crossing.
  add(braceAGeometries, a, brace.zBottom, lowerMatingZ, 1);
  add(
    braceAGeometries,
    clipPolygonHalfPlane(a, normalB, -brace.width / 2, true),
    lowerMatingZ,
    brace.zTop,
    1,
  );
  add(
    braceAGeometries,
    clipPolygonHalfPlane(a, normalB, brace.width / 2, false),
    lowerMatingZ,
    brace.zTop,
    1,
  );

  // Brace B owns the upper half through the crossing.
  add(braceBGeometries, b, upperMatingZ, brace.zTop, -1);
  add(
    braceBGeometries,
    clipPolygonHalfPlane(b, normalA, -brace.width / 2, true),
    brace.zBottom,
    upperMatingZ,
    -1,
  );
  add(
    braceBGeometries,
    clipPolygonHalfPlane(b, normalA, brace.width / 2, false),
    brace.zBottom,
    upperMatingZ,
    -1,
  );
  return [
    mergeGeometryList(
      braceAGeometries,
      "Unable to merge lower-half X-brace member",
    ),
    mergeGeometryList(
      braceBGeometries,
      "Unable to merge upper-half X-brace member",
    ),
  ];
}

export function createHoverDiningTableGeometry(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
) {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const upperX = createHalfLappedXParts(
    spec.upperBrace,
    spec.halfLapClearance,
    model,
  );
  const lowerX = createHalfLappedXParts(
    spec.lowerBrace,
    spec.halfLapClearance,
    model,
  );
  const geometries = [
    createTabletopGeometry(spec, model),
    createEndFrameGeometry(spec, model, -spec.frameCenterX),
    createEndFrameGeometry(spec, model, spec.frameCenterX),
    ...upperX,
    ...lowerX,
  ];
  return mergeGeometryList(
    geometries,
    "Unable to merge Double-X dining-table geometry",
  );
}

export type HoverDiningTableExplodedPart = {
  name: string;
  category:
    | "tabletop"
    | "end-box-horizontal"
    | "end-box-vertical"
    | "upper-x"
    | "floor-x";
  geometry: THREE.BufferGeometry;
  offset: THREE.Vector3;
};

export type HoverDiningTableCutPart = {
  id: string;
  name: string;
  assembly: "tabletop" | "end boxes" | "upper X" | "floor X";
  kind: "tabletop" | "rail" | "stile" | "brace";
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  grainDirection: "length";
  cutAngleDegrees?: number;
  lap?: {
    face: "top" | "bottom";
    centerFromEnd: number;
    length: number;
    depth: number;
    fitClearance: number;
    shoulderAngleDegrees: number;
  };
  processDimensions?: Array<{ label: string; value: number }>;
  notes: string[];
};

export type HoverDiningTableCutList = {
  material: "Oak";
  dimensionBasis: "full-size finished dimensions";
  totalPieces: 13;
  parts: HoverDiningTableCutPart[];
};

function createBraceCutParts(
  prefix: "U" | "F",
  assembly: "upper X" | "floor X",
  brace: BracePlaneSpec,
  halfLapClearance: number,
): HoverDiningTableCutPart[] {
  const includedAngle = Math.abs(brace.angleRadians) * 2;
  const lapLength = brace.width / Math.sin(includedAngle);
  const common = {
    assembly,
    kind: "brace" as const,
    quantity: 1,
    length: brace.diagonalLength,
    width: brace.width,
    thickness: brace.thickness,
    grainDirection: "length" as const,
    cutAngleDegrees: THREE.MathUtils.radToDeg(Math.abs(brace.angleRadians)),
    notes: [
      "Parallel end cuts bear flush on the end-box inside faces.",
      "Round over the top and bottom long edges to the listed radius.",
    ],
    processDimensions: [
      { label: "Edge round-over", value: brace.edgeRadius },
    ],
  };
  const lap = {
    centerFromEnd: brace.diagonalLength / 2,
    length: lapLength,
    depth: brace.halfLapDepth + halfLapClearance / 2,
    fitClearance: halfLapClearance,
    shoulderAngleDegrees: THREE.MathUtils.radToDeg(includedAngle),
  };
  return [
    {
      ...common,
      id: `${prefix}1`,
      name: `${assembly === "upper X" ? "Upper" : "Floor"} X — member A`,
      lap: { ...lap, face: "top" },
    },
    {
      ...common,
      id: `${prefix}2`,
      name: `${assembly === "upper X" ? "Upper" : "Floor"} X — member B`,
      lap: { ...lap, face: "bottom" },
    },
  ];
}

/**
 * Creates the full-size fabrication schedule. These are finished nominal
 * dimensions rather than rough-milling allowances; the 1:mockScale display
 * model never changes the values shown on the cut sheet.
 */
export function getHoverDiningTableCutList(
  params: ModelParams,
): HoverDiningTableCutList {
  const { fullSize: spec } = getHoverDiningTableSpec(params);
  const stileRise = spec.openingHeight;
  const stileRun = spec.frameBottomSpread / 2;
  const stileLength = Math.hypot(stileRise, stileRun);
  const stileCutAngle = THREE.MathUtils.radToDeg(
    Math.atan2(Math.abs(stileRun), stileRise),
  );
  const parts: HoverDiningTableCutPart[] = [
    {
      id: "T1",
      name: "Tabletop",
      assembly: "tabletop",
      kind: "tabletop",
      quantity: 1,
      length: spec.length,
      width: spec.width,
      thickness: spec.topThickness,
      grainDirection: "length",
      notes: [
        "Roll both long edges to the listed depth; keep both ends flat and square.",
      ],
      processDimensions: [
        { label: "Long-edge roll", value: spec.topEdgeRoll },
      ],
    },
    {
      id: "B1",
      name: "End-box top rail",
      assembly: "end boxes",
      kind: "rail",
      quantity: 2,
      length: spec.frameTopWidth,
      width: spec.frameTopRailHeight,
      thickness: spec.frameDepth,
      grainDirection: "length",
      notes: ["One per end box; square blank before frame glue-up."],
    },
    {
      id: "B2",
      name: "End-box bottom rail",
      assembly: "end boxes",
      kind: "rail",
      quantity: 2,
      length: spec.frameBottomWidth,
      width: spec.frameBottomRailHeight,
      thickness: spec.frameDepth,
      grainDirection: "length",
      notes: ["One per end box; square blank before frame glue-up."],
    },
    {
      id: "B3",
      name: "End-box stile",
      assembly: "end boxes",
      kind: "stile",
      quantity: 4,
      length: stileLength,
      width: spec.frameSideWidth,
      thickness: spec.frameDepth,
      grainDirection: "length",
      cutAngleDegrees: stileCutAngle,
      notes: [
        "Two mirrored stiles per end box.",
        "After glue-up, route the listed outer/inner curves and face-edge round-over.",
      ],
      processDimensions: [
        { label: "Outer corner radius", value: spec.frameOuterCornerRadius },
        { label: "Inner corner radius", value: spec.frameInnerCornerRadius },
        { label: "Face-edge round-over", value: spec.frameEdgeRoundover },
      ],
    },
    ...createBraceCutParts(
      "U",
      "upper X",
      spec.upperBrace,
      spec.halfLapClearance,
    ),
    ...createBraceCutParts(
      "F",
      "floor X",
      spec.lowerBrace,
      spec.halfLapClearance,
    ),
  ];

  const totalPieces = parts.reduce((sum, part) => sum + part.quantity, 0);
  if (totalPieces !== 13) {
    throw new Error(`X-Hover cut list must account for 13 pieces; received ${totalPieces}`);
  }
  for (const part of parts) {
    for (const [label, value] of [
      ["length", part.length],
      ["width", part.width],
      ["thickness", part.thickness],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${part.id} ${label} must be finite and positive`);
      }
    }
    if (
      part.lap &&
      (!Number.isFinite(part.lap.length) ||
        part.lap.length <= 0 ||
        part.lap.depth <= 0 ||
        part.lap.depth >= part.thickness ||
        part.lap.shoulderAngleDegrees <= 0 ||
        part.lap.shoulderAngleDegrees >= 90)
    ) {
      throw new Error(`${part.id} half-lap dimensions are invalid`);
    }
  }

  return {
    material: "Oak",
    dimensionBasis: "full-size finished dimensions",
    totalPieces: 13,
    parts,
  };
}

function createEndBoxHorizontalBarGeometry(
  spec: HoverDiningTableSpec,
  x: number,
  position: "top" | "bottom",
) {
  const top = position === "top";
  const width = top ? spec.frameTopWidth : spec.frameBottomWidth;
  const height = top ? spec.frameTopRailHeight : spec.frameBottomRailHeight;
  const z = top ? spec.frameHeight - height / 2 : height / 2;
  const geometry = new THREE.BoxGeometry(spec.frameDepth, width, height);
  geometry.translate(x, 0, z);
  geometry.computeVertexNormals();
  return geometry;
}

function createEndBoxVerticalBarGeometry(
  spec: HoverDiningTableSpec,
  x: number,
  sideSign: -1 | 1,
) {
  const bottom = spec.frameBottomRailHeight;
  const top = spec.frameHeight - spec.frameTopRailHeight;
  const outerBottom = sideSign * spec.frameBottomWidth / 2;
  const innerBottom = outerBottom - sideSign * spec.frameSideWidth;
  const outerTop = sideSign * spec.frameTopWidth / 2;
  const innerTop = outerTop - sideSign * spec.frameSideWidth;
  const shape = new THREE.Shape();
  const points = ensureCounterClockwise([
    new THREE.Vector2(innerBottom, bottom),
    new THREE.Vector2(outerBottom, bottom),
    new THREE.Vector2(outerTop, top),
    new THREE.Vector2(innerTop, top),
  ]);
  shape.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index].x, points[index].y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: spec.frameDepth,
    steps: 1,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      0, 0, 1, x - spec.frameDepth / 2,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Returns the glue-up stock as thirteen independently movable pieces. The
 * assembled model remains the source of truth for its routed inner/outer box
 * curves; this view separates the four rail-and-stile blanks that produce each
 * finished end box after glue-up and routing.
 */
export function createHoverDiningTableExplodedParts(
  params: ModelParams,
  model: HoverDiningTableModelDefinition,
): HoverDiningTableExplodedPart[] {
  const { scaled: spec } = getHoverDiningTableSpec(params);
  const gap = Math.min(spec.length, spec.width) * 0.035;
  const baseLift = gap;
  const parts: HoverDiningTableExplodedPart[] = [
    {
      name: "tabletop",
      category: "tabletop",
      geometry: createTabletopGeometry(spec, model),
      offset: new THREE.Vector3(0, 0, baseLift + gap * 3),
    },
  ];

  for (const endSign of [-1, 1] as const) {
    const x = endSign * spec.frameCenterX;
    const xOffset = endSign * gap * 1.5;
    const endLabel = endSign < 0 ? "left" : "right";
    parts.push(
      {
        name: `${endLabel}-box-top-rail`,
        category: "end-box-horizontal",
        geometry: createEndBoxHorizontalBarGeometry(spec, x, "top"),
        offset: new THREE.Vector3(xOffset, 0, baseLift + gap),
      },
      {
        name: `${endLabel}-box-bottom-rail`,
        category: "end-box-horizontal",
        geometry: createEndBoxHorizontalBarGeometry(spec, x, "bottom"),
        offset: new THREE.Vector3(xOffset, 0, 0),
      },
      {
        name: `${endLabel}-box-left-vertical`,
        category: "end-box-vertical",
        geometry: createEndBoxVerticalBarGeometry(spec, x, -1),
        offset: new THREE.Vector3(xOffset, -gap, baseLift),
      },
      {
        name: `${endLabel}-box-right-vertical`,
        category: "end-box-vertical",
        geometry: createEndBoxVerticalBarGeometry(spec, x, 1),
        offset: new THREE.Vector3(xOffset, gap, baseLift),
      },
    );
  }

  const addXParts = (
    brace: BracePlaneSpec,
    category: "upper-x" | "floor-x",
  ) => {
    const geometries = createHalfLappedXParts(
      brace,
      spec.halfLapClearance,
      model,
    );
    geometries.forEach((geometry, index) => {
      const direction = index === 0 ? -1 : 1;
      parts.push({
        name: `${category}-bar-${index + 1}`,
        category,
        geometry,
        offset: new THREE.Vector3(0, direction * gap * 1.5, baseLift),
      });
    });
  };
  addXParts(spec.upperBrace, "upper-x");
  addXParts(spec.lowerBrace, "floor-x");

  parts.forEach((part) => addPlanarWoodUvs(part.geometry));

  if (parts.length !== 13) {
    parts.forEach((part) => part.geometry.dispose());
    throw new Error(`Exploded X-Hover assembly must contain 13 pieces; received ${parts.length}`);
  }
  return parts;
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
        spec.openingHeight / 2,
        spec.openingTopWidth / 2 -
          spec.upperBrace.endpointInset -
          spec.upperBrace.miterHalfWidth -
          spec.upperBrace.width / 2,
        spec.openingBottomWidth / 2 -
          spec.lowerBrace.endpointInset -
          spec.lowerBrace.miterHalfWidth -
          spec.lowerBrace.width / 2,
      ) - limits.step,
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
      Math.max(
        0,
        brace.cornerTangentY - brace.miterHalfWidth - brace.width / 2,
      ),
    );
  } else if (key === "upperBraceEdgeRadius" || key === "lowerBraceEdgeRadius") {
    const brace =
      key === "upperBraceEdgeRadius" ? spec.upperBrace : spec.lowerBrace;
    limits.max = Math.min(
      limits.max,
      brace.width / 2 - limits.step,
      brace.halfLapDepth - spec.halfLapClearance / 2 - limits.step,
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
    case "hoverBraceEndCuts":
      return item(
        check.label,
        `8 box-parallel bearing faces · 4 per X · upper ${formatLength(spec.upperBrace.endpointOuterY, unit)} / ${formatLength(spec.upperBrace.cornerTangentY, unit)} tangent · lower ${formatLength(spec.lowerBrace.endpointOuterY, unit)} / ${formatLength(spec.lowerBrace.cornerTangentY, unit)} tangent · ${formatLength(spec.lowerBrace.edgeRadius, unit)} top/bottom round-over`,
      );
    case "hoverHalfLaps":
      return item(
        check.label,
        `2 centered · full width · complementary 50% depth · ${formatLength(spec.halfLapClearance, unit)} fit clearance`,
      );
    case "hoverDirectContact":
      return item(
        check.label,
        `upper Z ${formatLength(spec.upperBrace.zTop, unit)} · lower Z ${formatLength(spec.lowerBrace.zBottom, unit)} · zero gaps`,
      );
    case "hoverExplodedAssembly":
      return item(
        check.label,
        "13 pieces · 1 top · 8 end-box bars · 4 X bars",
      );
    case "hoverCutList":
      return item(
        check.label,
        "8 schedule lines · 13 oak pieces · full-size finished dimensions",
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
