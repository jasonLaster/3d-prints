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

export type CompactWallBracketSpec = {
  span: number;
  rise: number;
  depth: number;
  baseThickness: number;
  diagonalThickness: number;
  centerWebThickness: number;
  edgeChamfer: number;
  pairGap: number;
  plateSize: number;
  plateEdgeMargin: number;
  twoUpWidth: number;
  twoUpDepth: number;
  twoUpFits: boolean;
  sparePlateWidth: number;
  sparePlateDepth: number;
  scaleFactor: number;
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

export function getCompactWallBracketSpec(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
): CompactWallBracketSpec {
  const span = getParam(params, "span");
  const rise = getParam(params, "rise");
  const depth = getParam(params, "depth");
  const baseThickness = getParam(params, "baseThickness");
  const diagonalThickness = getParam(params, "diagonalThickness");
  const centerWebThickness = getParam(params, "centerWebThickness");
  const edgeChamfer = getParam(params, "edgeChamfer");
  const pairGap = getParam(params, "pairGap");
  const plateSize = getParam(params, "plateSize");
  const plateEdgeMargin = getParam(params, "plateEdgeMargin");
  const twoUpWidth = span * 2 + pairGap;
  const twoUpDepth = rise;
  const usablePlateSpan = plateSize - plateEdgeMargin * 2;
  return {
    span,
    rise,
    depth,
    baseThickness,
    diagonalThickness,
    centerWebThickness,
    edgeChamfer,
    pairGap,
    plateSize,
    plateEdgeMargin,
    twoUpWidth,
    twoUpDepth,
    twoUpFits:
      twoUpWidth <= usablePlateSpan + EPSILON &&
      twoUpDepth <= usablePlateSpan + EPSILON,
    sparePlateWidth: usablePlateSpan - twoUpWidth,
    sparePlateDepth: usablePlateSpan - twoUpDepth,
    scaleFactor: span / model.geometry.sourceSpan,
  };
}

function getSectionRings(spec: CompactWallBracketSpec) {
  const halfSpan = spec.span / 2;
  const outerCorner = Math.min(
    4.5,
    spec.baseThickness * 0.45,
    halfSpan * 0.08,
  );
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

export function createCompactWallBracketGeometry(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
) {
  const spec = getCompactWallBracketSpec(params, model);
  const { leftHole, outer, rightHole } = getSectionRings(spec);
  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(leftHole), new THREE.Path(rightHole));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: spec.edgeChamfer > EPSILON,
    bevelOffset: -spec.edgeChamfer,
    bevelSegments: model.geometry.bevelSegments,
    bevelSize: spec.edgeChamfer,
    bevelThickness: spec.edgeChamfer,
    curveSegments: 1,
    depth: spec.depth - spec.edgeChamfer * 2,
    steps: 1,
  });
  geometry.translate(
    0,
    -spec.rise / 2,
    spec.edgeChamfer > EPSILON ? spec.edgeChamfer : 0,
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCompactWallBracketTwoUpGeometries(
  params: ModelParams,
  model: CompactWallBracketModelDefinition,
) {
  const spec = getCompactWallBracketSpec(params, model);
  const centerOffset = (spec.span + spec.pairGap) / 2;
  const left = createCompactWallBracketGeometry(params, model);
  const right = createCompactWallBracketGeometry(params, model);
  left.translate(-centerOffset, 0, 0);
  right.translate(centerOffset, 0, 0);
  left.computeBoundingBox();
  right.computeBoundingBox();
  return [left, right];
}

export function getCompactWallBracketDimensions(
  params: ModelParams,
): ModelDimensions {
  return {
    length: getParam(params, "span"),
    width: getParam(params, "rise"),
    height: getParam(params, "depth"),
  };
}

export function updateCompactWallBracketGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const dimensions = getCompactWallBracketDimensions(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
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
  const rise = getParam(params, "rise");
  const depth = getParam(params, "depth");
  const baseThickness = getParam(params, "baseThickness");
  const diagonalThickness = getParam(params, "diagonalThickness");
  const centerWebThickness = getParam(params, "centerWebThickness");

  if (key === "span") {
    limits.max = Math.min(
      limits.max,
      (plateSize - plateEdgeMargin * 2 - pairGap) / 2,
    );
    limits.min = Math.max(
      limits.min,
      centerWebThickness * 5 + diagonalThickness * 4,
    );
  } else if (key === "rise") {
    limits.min = Math.max(
      limits.min,
      baseThickness + diagonalThickness * 4,
    );
    limits.max = Math.min(limits.max, plateSize - plateEdgeMargin * 2);
  } else if (key === "depth") {
    limits.min = Math.max(limits.min, model.geometry.sourceDepth);
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
  } else if (key === "edgeChamfer") {
    limits.max = Math.min(
      limits.max,
      depth / 8,
      diagonalThickness / 4,
      baseThickness / 5,
    );
  } else if (key === "pairGap") {
    limits.max = Math.min(
      limits.max,
      plateSize - plateEdgeMargin * 2 - span * 2,
    );
  } else if (key === "plateSize") {
    limits.min = Math.max(
      limits.min,
      span * 2 + pairGap + plateEdgeMargin * 2,
      rise + plateEdgeMargin * 2,
    );
  } else if (key === "plateEdgeMargin") {
    limits.max = Math.min(
      limits.max,
      (plateSize - span * 2 - pairGap) / 2,
      (plateSize - rise) / 2,
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
      value: `${formatLength(spec.span, unit)} × ${formatLength(spec.rise, unit)} × ${formatLength(spec.depth, unit)}`,
      status: "pass",
    };
  }
  if (check.key === "sourceScale") {
    return {
      label: check.label,
      value: `${(spec.scaleFactor * 100).toFixed(1)}% span; structural sections unscaled`,
      status: "pass",
    };
  }
  if (check.key === "memberSections") {
    const preserved =
      spec.depth + EPSILON >= model.geometry.sourceDepth &&
      spec.baseThickness + EPSILON >= model.geometry.sourceBaseThickness &&
      spec.diagonalThickness + EPSILON >=
        model.geometry.sourceDiagonalThickness &&
      spec.centerWebThickness + EPSILON >=
        model.geometry.sourceDiagonalThickness;
    return {
      label: check.label,
      value: `${formatLength(spec.depth, unit)} depth · ${formatLength(spec.baseThickness, unit)} base · ${formatLength(spec.diagonalThickness, unit)} diagonal/web`,
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
      value: `${formatLength(spec.twoUpWidth, unit)} × ${formatLength(spec.twoUpDepth, unit)} on ${formatLength(spec.plateSize, unit)} plate`,
      status: spec.twoUpFits ? "pass" : "warn",
    };
  }
  return {
    label: check.label,
    value: spec.twoUpFits
      ? `${formatLength(spec.sparePlateWidth, unit)} width and ${formatLength(spec.sparePlateDepth, unit)} depth spare inside margins`
      : "Increase the plate size or reduce span, rise, gap, or edge margin",
    status: spec.twoUpFits ? "pass" : "warn",
  };
}
