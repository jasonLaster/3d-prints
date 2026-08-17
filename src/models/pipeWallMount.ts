import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  PipeWallMountModelDefinition,
} from "./types";

const EPSILON = 1e-6;
const HOOK_LIP_ANGLE = THREE.MathUtils.degToRad(55);

export const PIPE_DIAMETER_PARAMETER_KEYS = [
  "pipeDiameter1",
  "pipeDiameter2",
  "pipeDiameter3",
  "pipeDiameter4",
  "pipeDiameter5",
  "pipeDiameter6",
  "pipeDiameter7",
  "pipeDiameter8",
] as const;

export function isPipeDiameterKey(key: string) {
  return /^pipeDiameter[1-9]\d*$/.test(key);
}

export function getPipeDiameters(
  params: ModelParams,
  model?: PipeWallMountModelDefinition,
) {
  const fallback = model?.geometry.defaultPipeDiametersMm ?? [25.4, 25.4, 25.4];
  const rawCount = params.pipeCount;
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.round(rawCount))
    : fallback.length;
  return Array.from({ length: count }, (_, index) => {
    const value = params[`pipeDiameter${index + 1}`];
    if (Number.isFinite(value)) return value;
    return fallback[index] ?? fallback[fallback.length - 1] ?? 25.4;
  });
}

export type PipeWallMountHook = {
  index: number;
  pipeDiameter: number;
  cradleDiameter: number;
  innerRadius: number;
  outerRadius: number;
  centerY: number;
  centerZ: number;
};

export type PipeWallMountDrillLocation = {
  x: number;
  z: number;
};

export type PipeWallMountSpec = {
  pipeDiameters: number[];
  hooks: PipeWallMountHook[];
  drillLocations: PipeWallMountDrillLocation[];
  pipeWiggle: number;
  hookReach: number;
  hookThickness: number;
  hookWidth: number;
  pipeGap: number;
  bracketHeight: number;
  backplateThickness: number;
  drillColumnOffset: number;
  mountingHoleDiameter: number;
  drillEdgeOffset: number;
  backplateWidth: number;
  drillColumnSpacing: number;
  drillRowSpacing: number;
  minimumBracketHeight: number;
  minimumHookReach: number;
  verticalClearance: number;
};

export function getPipeWallMountSpec(
  params: ModelParams,
  model: PipeWallMountModelDefinition,
): PipeWallMountSpec {
  const pipeDiameters = getPipeDiameters(params, model);
  const pipeWiggle = getParam(params, "pipeWiggle");
  const hookReach = getParam(params, "hookReach");
  const hookThickness = getParam(params, "hookThickness");
  const hookWidth = getParam(params, "hookWidth");
  const pipeGap = getParam(params, "pipeGap");
  const bracketHeight = getParam(params, "bracketHeight");
  const backplateThickness = getParam(params, "backplateThickness");
  const drillColumnOffset = getParam(params, "drillColumnOffset");
  const mountingHoleDiameter = getParam(params, "mountingHoleDiameter");
  const drillEdgeOffset = getParam(params, "drillEdgeOffset");
  const radii = pipeDiameters.map(
    (diameter) => (diameter + pipeWiggle) / 2 + hookThickness,
  );
  const minimumBracketHeight =
    model.geometry.minimumTopBottomMargin * 2 +
    radii.reduce((sum, radius) => sum + radius * 2, 0) +
    pipeGap * Math.max(0, radii.length - 1);
  const safeBracketHeight = Math.max(bracketHeight, minimumBracketHeight);
  const distributedExtra = radii.length > 1
    ? (safeBracketHeight - minimumBracketHeight) / (radii.length - 1)
    : 0;
  const singlePipeExtra = radii.length === 1
    ? (safeBracketHeight - minimumBracketHeight) / 2
    : 0;
  const hooks: PipeWallMountHook[] = [];
  let cursor = model.geometry.minimumTopBottomMargin + singlePipeExtra;
  pipeDiameters.forEach((pipeDiameter, index) => {
    const innerRadius = (pipeDiameter + pipeWiggle) / 2;
    const outerRadius = innerRadius + hookThickness;
    const centerZ = cursor + outerRadius;
    hooks.push({
      index,
      pipeDiameter,
      cradleDiameter: pipeDiameter + pipeWiggle,
      innerRadius,
      outerRadius,
      centerY: hookReach - outerRadius,
      centerZ,
    });
    cursor += outerRadius * 2 + pipeGap + distributedExtra;
  });
  const largestOuterRadius = Math.max(...radii);
  const minimumHookReach =
    backplateThickness +
    largestOuterRadius * 2 +
    model.geometry.minimumHookBridge;
  const backplateWidth = hookWidth;
  const drillColumnX = drillColumnOffset;
  const drillLocations = [
    { x: -drillColumnX, z: drillEdgeOffset },
    { x: drillColumnX, z: drillEdgeOffset },
    { x: -drillColumnX, z: safeBracketHeight - drillEdgeOffset },
    { x: drillColumnX, z: safeBracketHeight - drillEdgeOffset },
  ];

  return {
    pipeDiameters,
    hooks,
    drillLocations,
    pipeWiggle,
    hookReach,
    hookThickness,
    hookWidth,
    pipeGap,
    bracketHeight: safeBracketHeight,
    backplateThickness,
    drillColumnOffset,
    mountingHoleDiameter,
    drillEdgeOffset,
    backplateWidth,
    drillColumnSpacing: drillColumnX * 2,
    drillRowSpacing: safeBracketHeight - drillEdgeOffset * 2,
    minimumBracketHeight,
    minimumHookReach,
    verticalClearance: pipeGap + distributedExtra,
  };
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

function addOrientedQuad(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  desiredNormal: THREE.Vector3,
) {
  addOrientedTriangle(positions, a, b, c, desiredNormal);
  addOrientedTriangle(positions, a, c, d, desiredNormal);
}

function signedArea(points: THREE.Vector2[]) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function clockwise(points: THREE.Vector2[]) {
  const copy = points.map((point) => point.clone());
  return signedArea(copy) < 0 ? copy : copy.reverse();
}

function counterClockwise(points: THREE.Vector2[]) {
  const copy = points.map((point) => point.clone());
  return signedArea(copy) > 0 ? copy : copy.reverse();
}

function circleRing(
  centerX: number,
  centerZ: number,
  radius: number,
  segments: number,
) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      centerX + Math.cos(angle) * radius,
      centerZ + Math.sin(angle) * radius,
    );
  });
}

function addFaceOnY(
  positions: number[],
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
  y: number,
  positiveY: boolean,
) {
  const contour = clockwise(outer);
  const inner = holes.map(counterClockwise);
  const triangles = THREE.ShapeUtils.triangulateShape(contour, inner);
  const points = [...contour, ...inner.flat()];
  const desiredNormal = new THREE.Vector3(0, positiveY ? 1 : -1, 0);
  triangles.forEach(([aIndex, bIndex, cIndex]) => {
    const point = (index: number) =>
      new THREE.Vector3(points[index].x, y, points[index].y);
    addOrientedTriangle(
      positions,
      point(aIndex),
      point(bIndex),
      point(cIndex),
      desiredNormal,
    );
  });
}

function addFaceOnX(
  positions: number[],
  outline: THREE.Vector2[],
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

function getHookOutline(
  hook: PipeWallMountHook,
  spec: PipeWallMountSpec,
  radialSegments: number,
) {
  const startAngle = Math.PI;
  const endAngle = Math.PI * 2 + HOOK_LIP_ANGLE;
  const arcSegments = Math.max(
    12,
    Math.round(radialSegments * ((endAngle - startAngle) / (Math.PI * 2))),
  );
  const arcAngles = [
    ...Array.from(
      { length: arcSegments + 1 },
      (_, index) => startAngle + (index / arcSegments) * (endAngle - startAngle),
    ),
    Math.PI * 2,
  ]
    .sort((a, b) => a - b)
    .filter(
      (angle, index, values) =>
        index === 0 || Math.abs(angle - values[index - 1]) > EPSILON,
    );
  const outline = [
    new THREE.Vector2(
      spec.backplateThickness,
      hook.centerZ - spec.hookThickness,
    ),
    new THREE.Vector2(hook.centerY - hook.outerRadius, hook.centerZ),
  ];
  for (let index = 1; index < arcAngles.length; index += 1) {
    const angle = arcAngles[index];
    outline.push(new THREE.Vector2(
      hook.centerY + Math.cos(angle) * hook.outerRadius,
      hook.centerZ + Math.sin(angle) * hook.outerRadius,
    ));
  }
  outline.push(new THREE.Vector2(
    hook.centerY + Math.cos(endAngle) * hook.innerRadius,
    hook.centerZ + Math.sin(endAngle) * hook.innerRadius,
  ));
  for (let index = arcAngles.length - 2; index >= 0; index -= 1) {
    const angle = arcAngles[index];
    outline.push(new THREE.Vector2(
      hook.centerY + Math.cos(angle) * hook.innerRadius,
      hook.centerZ + Math.sin(angle) * hook.innerRadius,
    ));
  }
  outline.push(
    new THREE.Vector2(
      spec.backplateThickness,
      hook.centerZ + spec.hookThickness * 0.5,
    ),
  );
  return outline;
}

function createAnalyticGeometry(
  spec: PipeWallMountSpec,
  radialSegments: number,
) {
  const positions: number[] = [];
  const halfWidth = spec.backplateWidth / 2;
  const radius = spec.mountingHoleDiameter / 2;
  const holeRings = spec.drillLocations.map((location) =>
    circleRing(location.x, location.z, radius, radialSegments),
  );
  const attachmentBreaks = spec.hooks.flatMap((hook) => [
    hook.centerZ - spec.hookThickness,
    hook.centerZ + spec.hookThickness * 0.5,
  ]);
  const zBreaks = [0, ...attachmentBreaks, spec.bracketHeight]
    .sort((a, b) => a - b)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - values[index - 1]) > EPSILON,
    );
  const backOutline = [
    ...zBreaks.map((z) => new THREE.Vector2(-halfWidth, z)),
    ...zBreaks.slice().reverse().map((z) => new THREE.Vector2(halfWidth, z)),
  ];
  addFaceOnY(positions, backOutline, holeRings, 0, false);

  let bandStart = 0;
  spec.hooks.forEach((hook) => {
    const bandEnd = hook.centerZ - spec.hookThickness;
    const bandOutline = [
      new THREE.Vector2(-halfWidth, bandStart),
      new THREE.Vector2(-halfWidth, bandEnd),
      new THREE.Vector2(halfWidth, bandEnd),
      new THREE.Vector2(halfWidth, bandStart),
    ];
    const bandHoles = holeRings.filter((_, index) => {
      const z = spec.drillLocations[index].z;
      return z - radius >= bandStart - EPSILON &&
        z + radius <= bandEnd + EPSILON;
    });
    if (bandEnd - bandStart > EPSILON) {
      addFaceOnY(
        positions,
        bandOutline,
        bandHoles,
        spec.backplateThickness,
        true,
      );
    }
    bandStart = hook.centerZ + spec.hookThickness * 0.5;
  });
  if (spec.bracketHeight - bandStart > EPSILON) {
    const bandOutline = [
      new THREE.Vector2(-halfWidth, bandStart),
      new THREE.Vector2(-halfWidth, spec.bracketHeight),
      new THREE.Vector2(halfWidth, spec.bracketHeight),
      new THREE.Vector2(halfWidth, bandStart),
    ];
    const bandHoles = holeRings.filter((_, index) => {
      const z = spec.drillLocations[index].z;
      return z - radius >= bandStart - EPSILON &&
        z + radius <= spec.bracketHeight + EPSILON;
    });
    addFaceOnY(
      positions,
      bandOutline,
      bandHoles,
      spec.backplateThickness,
      true,
    );
  }

  for (let index = 0; index < zBreaks.length - 1; index += 1) {
    const z0 = zBreaks[index];
    const z1 = zBreaks[index + 1];
    addOrientedQuad(
      positions,
      new THREE.Vector3(-halfWidth, 0, z0),
      new THREE.Vector3(-halfWidth, spec.backplateThickness, z0),
      new THREE.Vector3(-halfWidth, spec.backplateThickness, z1),
      new THREE.Vector3(-halfWidth, 0, z1),
      new THREE.Vector3(-1, 0, 0),
    );
    addOrientedQuad(
      positions,
      new THREE.Vector3(halfWidth, 0, z0),
      new THREE.Vector3(halfWidth, 0, z1),
      new THREE.Vector3(halfWidth, spec.backplateThickness, z1),
      new THREE.Vector3(halfWidth, spec.backplateThickness, z0),
      new THREE.Vector3(1, 0, 0),
    );
  }
  addOrientedQuad(
    positions,
    new THREE.Vector3(-halfWidth, 0, 0),
    new THREE.Vector3(halfWidth, 0, 0),
    new THREE.Vector3(halfWidth, spec.backplateThickness, 0),
    new THREE.Vector3(-halfWidth, spec.backplateThickness, 0),
    new THREE.Vector3(0, 0, -1),
  );
  addOrientedQuad(
    positions,
    new THREE.Vector3(-halfWidth, 0, spec.bracketHeight),
    new THREE.Vector3(-halfWidth, spec.backplateThickness, spec.bracketHeight),
    new THREE.Vector3(halfWidth, spec.backplateThickness, spec.bracketHeight),
    new THREE.Vector3(halfWidth, 0, spec.bracketHeight),
    new THREE.Vector3(0, 0, 1),
  );

  spec.drillLocations.forEach((location) => {
    const ring = circleRing(
      location.x,
      location.z,
      radius,
      radialSegments,
    );
    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      const midX = (point.x + next.x) / 2 - location.x;
      const midZ = (point.y + next.y) / 2 - location.z;
      addOrientedQuad(
        positions,
        new THREE.Vector3(point.x, 0, point.y),
        new THREE.Vector3(next.x, 0, next.y),
        new THREE.Vector3(next.x, spec.backplateThickness, next.y),
        new THREE.Vector3(point.x, spec.backplateThickness, point.y),
        new THREE.Vector3(0, -midX, -midZ),
      );
    });
  });

  spec.hooks.forEach((hook) => {
    const outline = getHookOutline(hook, spec, radialSegments);
    addFaceOnX(positions, outline, -halfWidth, false);
    addFaceOnX(positions, outline, halfWidth, true);
    const area = signedArea(outline);
    for (let index = 0; index < outline.length - 1; index += 1) {
      const point = outline[index];
      const next = outline[index + 1];
      const edgeY = next.x - point.x;
      const edgeZ = next.y - point.y;
      const outwardY = area > 0 ? edgeZ : -edgeZ;
      const outwardZ = area > 0 ? -edgeY : edgeY;
      addOrientedQuad(
        positions,
        new THREE.Vector3(-halfWidth, point.x, point.y),
        new THREE.Vector3(halfWidth, point.x, point.y),
        new THREE.Vector3(halfWidth, next.x, next.y),
        new THREE.Vector3(-halfWidth, next.x, next.y),
        new THREE.Vector3(0, outwardY, outwardZ),
      );
    }
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

export function createPipeWallMountGeometry(
  params: ModelParams,
  model: PipeWallMountModelDefinition,
) {
  const spec = getPipeWallMountSpec(params, model);
  return createAnalyticGeometry(spec, model.geometry.radialSegments);
}

export function createPipeWallMountPipePreviews(
  params: ModelParams,
  model: PipeWallMountModelDefinition,
) {
  const spec = getPipeWallMountSpec(params, model);
  return spec.hooks.map((hook) => {
    const geometry = new THREE.CylinderGeometry(
      hook.pipeDiameter / 2,
      hook.pipeDiameter / 2,
      spec.hookWidth + model.geometry.pipePreviewOverhang * 2,
      model.geometry.radialSegments,
      1,
      false,
    );
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(0, hook.centerY, hook.centerZ);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  });
}

export function orientPipeWallMountForPrint(
  object: THREE.Object3D,
  params: ModelParams,
  model: PipeWallMountModelDefinition,
) {
  const spec = getPipeWallMountSpec(params, model);
  object.rotation.y = Math.PI / 2;
  object.position.z = spec.backplateWidth / 2;
}

export function orientPipeWallMountReferenceGeometry(
  geometry: THREE.BufferGeometry,
) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    const sourceX = position.getX(index);
    const sourceY = position.getY(index);
    const sourceZ = position.getZ(index);
    position.setXYZ(index, sourceZ, sourceX, sourceY);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getPipeWallMountDimensions(
  params: ModelParams,
  model: PipeWallMountModelDefinition,
): ModelDimensions {
  const spec = getPipeWallMountSpec(params, model);
  return {
    length: spec.backplateWidth,
    width: spec.hookReach,
    height: spec.bracketHeight,
  };
}

export function updatePipeWallMountGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: PipeWallMountModelDefinition,
) {
  const dimensions = getPipeWallMountDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, dimensions.width / 2, dimensions.height / 2);
}

export function getPipeWallMountParameterLimits(
  model: PipeWallMountModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const spec = getPipeWallMountSpec(params, model);
  if (key === "pipeCount") {
    limits.max = Math.min(limits.max, model.geometry.maximumPipeCount);
  } else if (key === "pipeWiggle") {
    limits.max = Math.min(
      limits.max,
      Math.min(...spec.pipeDiameters) * 0.35,
    );
  } else if (key === "hookReach") {
    limits.min = Math.max(limits.min, spec.minimumHookReach);
  } else if (key === "bracketHeight") {
    limits.min = Math.max(limits.min, spec.minimumBracketHeight);
  } else if (key === "hookWidth") {
    limits.min = Math.max(
      limits.min,
      2 * (
        spec.drillColumnOffset +
        spec.mountingHoleDiameter / 2 +
        model.geometry.minimumHoleEdgeWeb
      ),
    );
  } else if (key === "drillColumnOffset") {
    limits.min = Math.max(
      limits.min,
      spec.mountingHoleDiameter / 2 +
        model.geometry.minimumHoleEdgeWeb / 2,
    );
    limits.max = Math.min(
      limits.max,
      spec.hookWidth / 2 -
        spec.mountingHoleDiameter / 2 -
        model.geometry.minimumHoleEdgeWeb,
    );
  } else if (key === "mountingHoleDiameter") {
    limits.max = Math.min(
      limits.max,
      2 * (
        spec.hookWidth / 2 -
        spec.drillColumnOffset -
        model.geometry.minimumHoleEdgeWeb
      ),
      spec.drillColumnOffset * 2 - model.geometry.minimumHoleEdgeWeb,
    );
  } else if (key === "drillEdgeOffset") {
    limits.min = Math.max(
      limits.min,
      spec.mountingHoleDiameter / 2 + model.geometry.minimumHoleEdgeWeb,
    );
    limits.max = Math.min(
      limits.max,
      spec.bracketHeight / 2 -
        spec.mountingHoleDiameter / 2 -
        model.geometry.minimumHoleEdgeWeb,
    );
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getPipeWallMountAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: PipeWallMountModelDefinition,
): AuditItem {
  const spec = getPipeWallMountSpec(params, model);
  const pass = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "pass",
  });
  const warn = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "warn",
  });
  switch (check.key) {
    case "pipeSet":
      return pass(
        `${spec.pipeDiameters.length} pipes · ${spec.pipeDiameters
          .map((diameter) => formatLength(diameter, unit))
          .join(" · ")}`,
      );
    case "cradleFit":
      return pass(
        `${formatLength(spec.pipeWiggle, unit)} total wiggle room · ${formatLength(spec.pipeWiggle / 2, unit)} per side`,
      );
    case "mountEnvelope":
      return pass(
        `${formatLength(spec.backplateWidth, unit)} wide × ${formatLength(spec.hookReach, unit)} reach × ${formatLength(spec.bracketHeight, unit)} high`,
      );
    case "hookSections":
      return pass(
        `${formatLength(spec.hookThickness, unit)} hook × ${formatLength(spec.hookWidth, unit)} pipe contact · ${formatLength(spec.backplateThickness, unit)} backplate`,
      );
    case "verticalPacking":
      return spec.bracketHeight + EPSILON >= spec.minimumBracketHeight
        ? pass(
          `${formatLength(spec.verticalClearance, unit)} clear between hook envelopes`,
        )
        : warn(
          `${formatLength(spec.minimumBracketHeight, unit)} minimum height required`,
        );
    case "hookReach":
      return spec.hookReach + EPSILON >= spec.minimumHookReach
        ? pass(
          `${formatLength(spec.hookReach, unit)} reach · ${formatLength(spec.minimumHookReach, unit)} minimum for largest pipe`,
        )
        : warn(
          `${formatLength(spec.minimumHookReach, unit)} minimum reach required`,
        );
    case "drillPattern":
      return pass(
        `4 × Ø${formatLength(spec.mountingHoleDiameter, unit)} · columns ${formatLength(spec.drillColumnSpacing, unit)} apart · rows ${formatLength(spec.drillRowSpacing, unit)} apart`,
      );
    case "sourceReference":
      return pass(
        `${formatLength(model.geometry.sourceProjection, unit)} projection × ${formatLength(model.geometry.sourceHeight, unit)} height × ${formatLength(model.geometry.sourceWidth, unit)} width single-hook reference`,
      );
    default:
      return warn("Unsupported audit check");
  }
}
