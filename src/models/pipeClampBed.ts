import * as THREE from "three";
import { formatLength, toUnit } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  PipeClampBedModelDefinition,
} from "./types";

const EPSILON = 1e-6;
const MINIMUM_SHOULDER = 1.2;

type Point = THREE.Vector2;

export type PipeClampBedSpec = {
  bedLength: number;
  bedWidth: number;
  bedThickness: number;
  pipeDiameter: number;
  pipeClearance: number;
  pipeRadius: number;
  fittedRadius: number;
  crownCapThickness: number;
  surfaceLiftAboveCrown: number;
  supportSurfaceZ: number;
  bedBottomZ: number;
  hookWidth: number;
  hookWallThickness: number;
  hookOuterRadius: number;
  hookUndercut: number;
  hookOpeningWidth: number;
  requiredSnapDeflectionPerSide: number;
  engagementAngleRadians: number;
  engagementAngleDegrees: number;
  centerBridge: number;
  workpieceThickness: number;
  workpieceCenterZ: number;
  minimumZ: number;
  overallHeight: number;
};

type SectionProfiles = {
  bed: Point[];
  hook: Point[];
  leftShoulder: Point[];
  rightShoulder: Point[];
};

function signedArea(points: Point[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function clockwise(points: Point[]) {
  const copy = points.map((point) => point.clone());
  return signedArea(copy) < 0 ? copy : copy.reverse();
}

function arcPoints(
  radius: number,
  startAngle: number,
  endAngle: number,
  fullCircleSegments: number,
) {
  const segmentCount = Math.max(
    2,
    Math.ceil(
      (Math.abs(endAngle - startAngle) / (Math.PI * 2)) *
        fullCircleSegments,
    ),
  );
  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle =
      startAngle + (index / segmentCount) * (endAngle - startAngle);
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
}

function withoutFirst(points: Point[]) {
  return points.slice(1);
}

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addOrientedTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  desiredNormal: THREE.Vector3,
) {
  const normal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a));
  if (normal.dot(desiredNormal) >= 0) addTriangle(positions, a, b, c);
  else addTriangle(positions, a, c, b);
}

function addFaceOnX(
  positions: number[],
  outline: Point[],
  x: number,
  positiveX: boolean,
) {
  const contour = clockwise(outline);
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const desiredNormal = new THREE.Vector3(positiveX ? 1 : -1, 0, 0);
  triangles.forEach(([aIndex, bIndex, cIndex]) => {
    const point = (index: number) =>
      new THREE.Vector3(x, contour[index].x, contour[index].y);
    addOrientedTriangle(
      positions,
      point(aIndex),
      point(bIndex),
      point(cIndex),
      desiredNormal,
    );
  });
}

function addExtrudedLoopSides(
  positions: number[],
  outline: Point[],
  x0: number,
  x1: number,
) {
  const contour = clockwise(outline);
  contour.forEach((point, index) => {
    const next = contour[(index + 1) % contour.length];
    const a = new THREE.Vector3(x0, point.x, point.y);
    const b = new THREE.Vector3(x1, point.x, point.y);
    const c = new THREE.Vector3(x1, next.x, next.y);
    const d = new THREE.Vector3(x0, next.x, next.y);
    addTriangle(positions, a, b, c);
    addTriangle(positions, a, c, d);
  });
}

export function getPipeClampBedSpec(params: ModelParams): PipeClampBedSpec {
  const bedLength = getParam(params, "bedLength");
  const bedWidth = getParam(params, "bedWidth");
  const bedThickness = getParam(params, "bedThickness");
  const pipeDiameter = getParam(params, "pipeDiameter");
  const pipeClearance = getParam(params, "pipeClearance");
  const pipeRadius = pipeDiameter / 2;
  const fittedRadius = (pipeDiameter + pipeClearance) / 2;
  const crownCapThickness = getParam(params, "crownCapThickness");
  const supportSurfaceZ = fittedRadius + crownCapThickness;
  const bedBottomZ = supportSurfaceZ - bedThickness;
  const hookWidth = getParam(params, "hookWidth");
  const hookWallThickness = getParam(params, "hookWallThickness");
  const hookOuterRadius = fittedRadius + hookWallThickness;
  const hookUndercut = getParam(params, "hookUndercut");
  const openingHalfWidth = Math.max(EPSILON, fittedRadius - hookUndercut);
  const engagementAngleRadians = Math.acos(
    THREE.MathUtils.clamp(openingHalfWidth / fittedRadius, -1, 1),
  );
  const hookOpeningWidth = openingHalfWidth * 2;
  const requiredSnapDeflectionPerSide = Math.max(
    0,
    pipeRadius - openingHalfWidth,
  );
  const minimumZ = -Math.sin(engagementAngleRadians) * hookOuterRadius;
  const workpieceThickness = getParam(params, "workpieceThickness");

  return {
    bedLength,
    bedWidth,
    bedThickness,
    pipeDiameter,
    pipeClearance,
    pipeRadius,
    fittedRadius,
    crownCapThickness,
    surfaceLiftAboveCrown: supportSurfaceZ - pipeRadius,
    supportSurfaceZ,
    bedBottomZ,
    hookWidth,
    hookWallThickness,
    hookOuterRadius,
    hookUndercut,
    hookOpeningWidth,
    requiredSnapDeflectionPerSide,
    engagementAngleRadians,
    engagementAngleDegrees: THREE.MathUtils.radToDeg(
      engagementAngleRadians,
    ),
    centerBridge: bedLength - hookWidth * 2,
    workpieceThickness,
    workpieceCenterZ: supportSurfaceZ + workpieceThickness / 2,
    minimumZ,
    overallHeight: supportSurfaceZ - minimumZ,
  };
}

function getSectionProfiles(
  spec: PipeClampBedSpec,
  radialSegments: number,
): SectionProfiles {
  const halfWidth = spec.bedWidth / 2;
  const inner = spec.fittedRadius;
  const outer = spec.hookOuterRadius;
  const top = spec.supportSurfaceZ;
  const bottom = spec.bedBottomZ;
  const engagement = spec.engagementAngleRadians;
  const transitionAngle = Math.asin(
    THREE.MathUtils.clamp(bottom / inner, -1, 1),
  );
  const upperArc = arcPoints(
    inner,
    transitionAngle,
    Math.PI - transitionAngle,
    radialSegments,
  );
  const rightInnerArc = arcPoints(
    inner,
    -engagement,
    transitionAngle,
    radialSegments,
  );
  const leftInnerArc = arcPoints(
    inner,
    Math.PI - transitionAngle,
    Math.PI + engagement,
    radialSegments,
  );
  const rightOuterArc = arcPoints(
    outer,
    0,
    -engagement,
    radialSegments,
  );
  const leftOuterArc = arcPoints(
    outer,
    Math.PI + engagement,
    Math.PI,
    radialSegments,
  );
  const topLeft = new THREE.Vector2(-halfWidth, top);
  const topRight = new THREE.Vector2(halfWidth, top);
  const bottomRight = new THREE.Vector2(halfWidth, bottom);
  const bottomLeft = new THREE.Vector2(-halfWidth, bottom);

  const bed = clockwise([
    topLeft,
    topRight,
    bottomRight,
    upperArc[0],
    ...withoutFirst(upperArc),
    bottomLeft,
  ]);
  const hook = clockwise([
    topLeft,
    topRight,
    bottomRight,
    rightOuterArc[0],
    ...withoutFirst(rightOuterArc),
    rightInnerArc[0],
    ...withoutFirst(rightInnerArc),
    ...withoutFirst(upperArc),
    ...withoutFirst(leftInnerArc),
    leftOuterArc[0],
    ...withoutFirst(leftOuterArc),
    bottomLeft,
  ]);
  const rightShoulder = clockwise([
    bottomRight,
    rightOuterArc[0],
    ...withoutFirst(rightOuterArc),
    rightInnerArc[0],
    ...withoutFirst(rightInnerArc),
  ]);
  const leftShoulder = clockwise([
    bottomLeft,
    leftInnerArc[0],
    ...withoutFirst(leftInnerArc),
    leftOuterArc[0],
    ...withoutFirst(leftOuterArc),
  ]);

  return { bed, hook, leftShoulder, rightShoulder };
}

function createAssemblyGeometry(
  spec: PipeClampBedSpec,
  radialSegments: number,
) {
  const { bed, hook, leftShoulder, rightShoulder } = getSectionProfiles(
    spec,
    radialSegments,
  );
  const positions: number[] = [];
  const x0 = -spec.bedLength / 2;
  const x1 = x0 + spec.hookWidth;
  const x3 = spec.bedLength / 2;
  const x2 = x3 - spec.hookWidth;

  addFaceOnX(positions, hook, x0, false);
  addExtrudedLoopSides(positions, hook, x0, x1);
  addFaceOnX(positions, leftShoulder, x1, true);
  addFaceOnX(positions, rightShoulder, x1, true);

  addExtrudedLoopSides(positions, bed, x1, x2);

  addFaceOnX(positions, leftShoulder, x2, false);
  addFaceOnX(positions, rightShoulder, x2, false);
  addExtrudedLoopSides(positions, hook, x2, x3);
  addFaceOnX(positions, hook, x3, true);

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

export function createPipeClampBedGeometry(
  params: ModelParams,
  model: PipeClampBedModelDefinition,
) {
  return createAssemblyGeometry(
    getPipeClampBedSpec(params),
    model.geometry.radialSegments,
  );
}

export function createPipeClampBedPrintGeometry(
  params: ModelParams,
  model: PipeClampBedModelDefinition,
) {
  const spec = getPipeClampBedSpec(params);
  const geometry = createAssemblyGeometry(spec, model.geometry.radialSegments);
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
  geometry.translate(0, 0, spec.supportSurfaceZ);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPipeClampBedFitCouponGeometry(
  params: ModelParams,
  model: PipeClampBedModelDefinition,
) {
  const spec = getPipeClampBedSpec(params);
  const { hook } = getSectionProfiles(spec, model.geometry.radialSegments);
  const positions: number[] = [];
  const x0 = -spec.hookWidth / 2;
  const x1 = spec.hookWidth / 2;
  addFaceOnX(positions, hook, x0, false);
  addExtrudedLoopSides(positions, hook, x0, x1);
  addFaceOnX(positions, hook, x1, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
  geometry.translate(0, 0, spec.supportSurfaceZ);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPipeClampBedPreviewParts(
  params: ModelParams,
  model: PipeClampBedModelDefinition,
) {
  const spec = getPipeClampBedSpec(params);
  const pipe = new THREE.CylinderGeometry(
    spec.pipeRadius,
    spec.pipeRadius,
    spec.bedLength + model.geometry.pipePreviewOverhang * 2,
    model.geometry.radialSegments,
    1,
    false,
  );
  pipe.rotateZ(Math.PI / 2);
  pipe.computeBoundingBox();
  pipe.computeBoundingSphere();
  return [{ key: "pipe-preview", geometry: pipe, material: "pipe" as const }];
}

export function getPipeClampBedDimensions(
  params: ModelParams,
): ModelDimensions {
  const spec = getPipeClampBedSpec(params);
  return {
    length: spec.bedLength,
    width: spec.bedWidth,
    height: spec.overallHeight,
  };
}

export function updatePipeClampBedGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const spec = getPipeClampBedSpec(params);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    spec.bedLength,
    spec.bedWidth,
    spec.overallHeight,
  );
  mesh.position.set(0, 0, (spec.supportSurfaceZ + spec.minimumZ) / 2);
}

export function getPipeClampBedParameterLimits(
  model: PipeClampBedModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const spec = getPipeClampBedSpec(params);

  if (key === "bedLength") {
    limits.min = Math.max(
      limits.min,
      spec.hookWidth * 2 + model.geometry.minimumCenterBridge,
    );
  } else if (key === "bedWidth") {
    limits.min = Math.max(
      limits.min,
      spec.hookOuterRadius * 2 + MINIMUM_SHOULDER * 2,
    );
  } else if (key === "bedThickness") {
    limits.min = Math.max(
      limits.min,
      spec.crownCapThickness + model.geometry.minimumRoofThickness,
    );
  } else if (key === "pipeDiameter") {
    limits.max = Math.min(
      limits.max,
      spec.bedWidth -
        spec.pipeClearance -
        spec.hookWallThickness * 2 -
        MINIMUM_SHOULDER * 2,
    );
  } else if (key === "pipeClearance") {
    limits.max = Math.min(
      limits.max,
      spec.bedWidth -
        spec.pipeDiameter -
        spec.hookWallThickness * 2 -
        MINIMUM_SHOULDER * 2,
    );
  } else if (key === "crownCapThickness") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumRoofThickness,
    );
    limits.max = Math.min(
      limits.max,
      spec.bedThickness - model.geometry.minimumRoofThickness,
    );
  } else if (key === "hookWidth") {
    limits.max = Math.min(
      limits.max,
      (spec.bedLength - model.geometry.minimumCenterBridge) / 2,
    );
  } else if (key === "hookWallThickness") {
    limits.min = Math.max(
      limits.min,
      model.geometry.minimumHookWallThickness,
    );
    limits.max = Math.min(
      limits.max,
      (spec.bedWidth - spec.pipeDiameter - spec.pipeClearance) / 2 -
        MINIMUM_SHOULDER,
    );
  } else if (key === "hookUndercut") {
    limits.min = Math.max(limits.min, spec.pipeClearance / 2 + 0.2);
    limits.max = Math.min(limits.max, spec.fittedRadius * 0.3);
  }

  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getPipeClampBedAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: PipeClampBedModelDefinition,
): AuditItem {
  const spec = getPipeClampBedSpec(params);
  const pass = (label: string, value: string): AuditItem => ({
    label,
    value,
    status: "pass",
  });

  if (check.key === "bedEnvelope") {
    return pass(
      check.label,
      `${formatLength(spec.bedLength, unit)} × ${formatLength(spec.bedWidth, unit)} × ${formatLength(spec.overallHeight, unit)}`,
    );
  }
  if (check.key === "pipeFit") {
    const pipeDiameter =
      unit === "in"
        ? `${toUnit(spec.pipeDiameter, unit).toFixed(3)} in`
        : formatLength(spec.pipeDiameter, unit);
    return pass(
      check.label,
      `${pipeDiameter} pipe · ${formatLength(spec.pipeClearance, unit)} total clearance`,
    );
  }
  if (check.key === "supportHeight") {
    return pass(
      check.label,
      `${formatLength(spec.surfaceLiftAboveCrown, unit)} above nominal crown · ${formatLength(spec.crownCapThickness, unit)} cap over fitted pipe`,
    );
  }
  if (check.key === "workpieceCenter") {
    return pass(
      check.label,
      `${formatLength(spec.workpieceThickness, unit)} stock centers ${formatLength(spec.workpieceCenterZ, unit)} above pipe axis`,
    );
  }
  if (check.key === "snapRelease") {
    return {
      label: check.label,
      value: `${formatLength(spec.hookOpeningWidth, unit)} opening · ${formatLength(spec.requiredSnapDeflectionPerSide, unit)} expansion/side · ${spec.engagementAngleDegrees.toFixed(1)}° undercut angle`,
      status:
        spec.requiredSnapDeflectionPerSide <= spec.hookWallThickness * 0.4
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "hookBands") {
    return pass(
      check.label,
      `2 × ${formatLength(spec.hookWidth, unit)} end clips · ${formatLength(spec.centerBridge, unit)} open center`,
    );
  }
  if (check.key === "minimumSections") {
    const sectionsPass =
      spec.hookWallThickness + EPSILON >=
        model.geometry.minimumHookWallThickness &&
      spec.crownCapThickness + EPSILON >=
        model.geometry.minimumRoofThickness;
    return {
      label: check.label,
      value: `${formatLength(spec.hookWallThickness, unit)} hook wall · ${formatLength(spec.crownCapThickness, unit)} crown cap · ${formatLength(spec.bedThickness, unit)} edge`,
      status: sectionsPass ? "pass" : "warn",
    };
  }
  if (check.key === "printOrientation") {
    return pass(
      check.label,
      "Support face down at Z = 0 · clips upward · no pipe preview in STL",
    );
  }
  if (check.key === "sourceReference") {
    return pass(
      check.label,
      `Retained concept mesh · ${model.geometry.sourceDimensionsMm.x.toFixed(1)} × ${model.geometry.sourceDimensionsMm.y.toFixed(1)} × ${model.geometry.sourceDimensionsMm.z.toFixed(1)} mm after documented scale interpretation`,
    );
  }

  return { label: check.label, value: "Not configured", status: "warn" };
}
