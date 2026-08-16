import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  BandsawSledModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;
type Point = THREE.Vector2;

type Hole = Point[];
type SteppedPocket = {
  small: Hole;
  large: Hole;
  depth: number;
};
type BlindPocket = {
  ring: Hole;
  depth: number;
};

export type BandsawSledSpec = {
  baseWidth: number;
  baseDepth: number;
  baseThickness: number;
  fenceWidth: number;
  fenceHeight: number;
  fenceThickness: number;
  fencePosition: number;
  fenceTravelMin: number;
  fenceTravelMax: number;
  bladeKerf: number;
  bracketWidth: number;
  bracketDepth: number;
  bracketGussetLengthRatio: number;
  bracketGussetDepth: number;
  bracketSpacing: number;
  bracketBackThickness: number;
  bracketFootThickness: number;
  lockSlotLength: number;
  lockSlotWidth: number;
  lockBoltDiameter: number;
  lockBoltLength: number;
  lockEngagement: number;
  baseInsertDiameter: number;
  baseInsertDepth: number;
  baseInsertFloor: number;
  baseInsertStationY: number;
  boardBoltDiameter: number;
  boardBoltLength: number;
  boardBoltEngagement: number;
  insertPocketDiameter: number;
  insertDepth: number;
  insertShoulder: number;
  insertSideWall: number;
  slotEndWeb: number;
  fenceEdgeMargin: number;
  baseSupportMargin: number;
  bracketDeflection: number;
  bracketStress: number;
  bracketSafetyFactor: number;
};

export type BandsawSledPart = {
  key: "left-bracket" | "right-bracket" | "left-lock-knob" | "right-lock-knob";
  label: string;
  quantity: number;
  geometry: THREE.BufferGeometry;
};

export type BandsawSledPreviewPart = {
  key: string;
  material: "wood" | "printed" | "printed-accent" | "metal" | "brass";
  geometry: THREE.BufferGeometry;
};

function roundedRectangleRing(
  length: number,
  width: number,
  radius: number,
  cornerSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const safeRadius = Math.max(
    EPSILON,
    Math.min(radius, halfLength - EPSILON, halfWidth - EPSILON),
  );
  const corners = [
    { x: halfLength - safeRadius, y: -halfWidth + safeRadius, start: -Math.PI / 2 },
    { x: halfLength - safeRadius, y: halfWidth - safeRadius, start: 0 },
    { x: -halfLength + safeRadius, y: halfWidth - safeRadius, start: Math.PI / 2 },
    { x: -halfLength + safeRadius, y: -halfWidth + safeRadius, start: Math.PI },
  ];
  return corners.flatMap((corner) =>
    Array.from({ length: cornerSegments }, (_, index) => {
      const angle = corner.start + (index / (cornerSegments - 1)) * Math.PI / 2;
      return new THREE.Vector2(
        centerX + corner.x + Math.cos(angle) * safeRadius,
        centerY + corner.y + Math.sin(angle) * safeRadius,
      );
    }),
  );
}

function circleRing(radius: number, segments: number, centerX = 0, centerY = 0) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    );
  });
}

function capsuleRing(
  length: number,
  width: number,
  axis: "x" | "y",
  arcSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const radius = width / 2;
  const straight = Math.max(0, length - width);
  const points: Point[] = [];
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = -Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        -straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  return points.map((point) =>
    axis === "x"
      ? new THREE.Vector2(centerX + point.x, centerY + point.y)
      : new THREE.Vector2(centerX - point.y, centerY + point.x),
  );
}

function starRing(
  outerRadius: number,
  innerRadius: number,
  lobes: number,
) {
  return Array.from({ length: lobes * 4 }, (_, index) => {
    const angle = (index / (lobes * 4)) * Math.PI * 2;
    const phase = index % 4;
    const radius = phase === 0 || phase === 3 ? outerRadius : innerRadius;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addRingBridge(
  positions: number[],
  lower: Point[],
  upper: Point[],
  lowerZ: number,
  upperZ: number,
  inward = false,
) {
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    const a = new THREE.Vector3(lower[index].x, lower[index].y, lowerZ);
    const b = new THREE.Vector3(lower[next].x, lower[next].y, lowerZ);
    const c = new THREE.Vector3(upper[next].x, upper[next].y, upperZ);
    const d = new THREE.Vector3(upper[index].x, upper[index].y, upperZ);
    if (inward) {
      addTriangle(positions, a, c, b);
      addTriangle(positions, a, d, c);
    } else {
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }
}

function addHorizontalFace(
  positions: number[],
  contour: Point[],
  holes: Point[][],
  z: number,
  upward: boolean,
) {
  const outer = contour.slice().reverse().map((point) => point.clone());
  const inner = holes.map((hole) => hole.map((point) => point.clone()));
  const triangles = THREE.ShapeUtils.triangulateShape(outer, inner);
  const points = [...outer, ...inner.flat()];
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = new THREE.Vector3(points[aIndex].x, points[aIndex].y, z);
    const b = new THREE.Vector3(points[bIndex].x, points[bIndex].y, z);
    const c = new THREE.Vector3(points[cIndex].x, points[cIndex].y, z);
    const cross = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a)).z;
    if ((cross > 0) === upward) addTriangle(positions, a, b, c);
    else addTriangle(positions, a, c, b);
  }
}

function buildGeometry(positions: number[]) {
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

function createPlateGeometry({
  outer,
  thickness,
  throughHoles = [],
  steppedPockets = [],
  blindPockets = [],
}: {
  outer: Point[];
  thickness: number;
  throughHoles?: Hole[];
  steppedPockets?: SteppedPocket[];
  blindPockets?: BlindPocket[];
}) {
  const bottomHoles = [
    ...throughHoles,
    ...steppedPockets.map((pocket) => pocket.small),
  ];
  const topHoles = [
    ...throughHoles,
    ...steppedPockets.map((pocket) => pocket.large),
    ...blindPockets.map((pocket) => pocket.ring),
  ];
  const positions: number[] = [];
  addHorizontalFace(positions, outer, bottomHoles, 0, false);
  addRingBridge(positions, outer, outer, 0, thickness);
  throughHoles.forEach((hole) =>
    addRingBridge(positions, hole, hole, 0, thickness, true),
  );
  steppedPockets.forEach((pocket) => {
    const shoulderZ = thickness - pocket.depth;
    addRingBridge(positions, pocket.small, pocket.small, 0, shoulderZ, true);
    addHorizontalFace(positions, pocket.large, [pocket.small], shoulderZ, true);
    addRingBridge(positions, pocket.large, pocket.large, shoulderZ, thickness, true);
  });
  blindPockets.forEach((pocket) => {
    const floorZ = thickness - pocket.depth;
    addHorizontalFace(positions, pocket.ring, [], floorZ, true);
    addRingBridge(positions, pocket.ring, pocket.ring, floorZ, thickness, true);
  });
  addHorizontalFace(positions, outer, topHoles, thickness, true);
  return buildGeometry(positions);
}

function cleanMergeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(source.attributes)) {
    if (name !== "position" && name !== "normal") source.deleteAttribute(name);
  }
  if (!source.getAttribute("normal")) source.computeVertexNormals();
  return source;
}

function createGussetGeometry(
  width: number,
  depth: number,
  height: number,
  x: number,
  y: number,
  z: number,
) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(depth, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.applyMatrix4(
    new THREE.Matrix4().set(
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 1,
    ),
  );
  geometry.translate(x, y, z);
  return cleanMergeGeometry(geometry);
}

function orientCylinderAlongZ(geometry: THREE.BufferGeometry) {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function getBandsawSledSpec(
  params: ModelParams,
  model: BandsawSledModelDefinition,
): BandsawSledSpec {
  const baseWidth = getParam(params, "baseWidth");
  const baseDepth = getParam(params, "baseDepth");
  const baseThickness = getParam(params, "baseThickness");
  const fenceWidth = getParam(params, "fenceWidth");
  const fenceHeight = getParam(params, "fenceHeight");
  const fenceThickness = getParam(params, "fenceThickness");
  const fencePosition = getParam(params, "fencePosition");
  const bracketWidth = getParam(params, "bracketWidth");
  const bracketDepth = getParam(params, "bracketDepth");
  const bracketGussetLengthRatio = model.geometry.bracketGussetLengthRatio;
  const bracketGussetDepth = bracketDepth * bracketGussetLengthRatio;
  const bracketSpacing = getParam(params, "bracketSpacing");
  const lockSlotLength = getParam(params, "lockSlotLength");
  const lockBoltDiameter = getParam(params, "lockBoltDiameter");
  const lockBoltLength = getParam(params, "lockBoltLength");
  const baseInsertDiameter = getParam(params, "baseInsertDiameter");
  const baseInsertDepth = getParam(params, "baseInsertDepth");
  const boardBoltDiameter = getParam(params, "boardBoltDiameter");
  const boardBoltLength = getParam(params, "boardBoltLength");
  const insertPocketDiameter = getParam(params, "insertPocketDiameter");
  const insertDepth = getParam(params, "insertDepth");
  const slotTravel = (lockSlotLength - model.geometry.lockSlotWidth) / 2;
  const defaultBracketDepth = getParameter(model, "bracketDepth").default;
  const baseInsertStationY =
    model.geometry.baseInsertStationY + (bracketDepth - defaultBracketDepth) / 2;
  const nominalFencePosition =
    baseInsertStationY - fenceThickness / 2 - bracketDepth / 2;
  const effectiveSpan = Math.max(
    10,
    fenceHeight - model.geometry.bracketGussetHeight,
  );
  const forcePerBracket = model.geometry.screenLateralLoadN / 2;
  const secondMoment =
    (bracketWidth * Math.pow(model.geometry.bracketBackThickness, 3)) / 12;
  const bracketDeflection =
    (forcePerBracket * Math.pow(effectiveSpan, 3)) /
    (3 * model.geometry.screenModulusMpa * secondMoment);
  const bracketStress =
    (6 * forcePerBracket * effectiveSpan) /
    (bracketWidth * Math.pow(model.geometry.bracketBackThickness, 2));

  return {
    baseWidth,
    baseDepth,
    baseThickness,
    fenceWidth,
    fenceHeight,
    fenceThickness,
    fencePosition,
    fenceTravelMin: nominalFencePosition - slotTravel,
    fenceTravelMax: nominalFencePosition + slotTravel,
    bladeKerf: getParam(params, "bladeKerf"),
    bracketWidth,
    bracketDepth,
    bracketGussetLengthRatio,
    bracketGussetDepth,
    bracketSpacing,
    bracketBackThickness: model.geometry.bracketBackThickness,
    bracketFootThickness: model.geometry.bracketFootThickness,
    lockSlotLength,
    lockSlotWidth: model.geometry.lockSlotWidth,
    lockBoltDiameter,
    lockBoltLength,
    lockEngagement:
      lockBoltLength -
      model.geometry.bracketFootThickness -
      model.geometry.lockWasherThickness,
    baseInsertDiameter,
    baseInsertDepth,
    baseInsertFloor: baseThickness - baseInsertDepth,
    baseInsertStationY,
    boardBoltDiameter,
    boardBoltLength,
    boardBoltEngagement:
      boardBoltLength - fenceThickness - model.geometry.boardWasherThickness,
    insertPocketDiameter,
    insertDepth,
    insertShoulder: model.geometry.bracketBackThickness - insertDepth,
    insertSideWall: (bracketWidth - insertPocketDiameter) / 2,
    slotEndWeb: (bracketDepth - lockSlotLength) / 2,
    fenceEdgeMargin: (fenceWidth - bracketSpacing - bracketWidth) / 2,
    baseSupportMargin:
      baseDepth / 2 -
      (nominalFencePosition + fenceThickness / 2 + bracketDepth),
    bracketDeflection,
    bracketStress,
    bracketSafetyFactor:
      bracketStress > EPSILON
        ? model.geometry.screenAllowableStressMpa / bracketStress
        : Number.POSITIVE_INFINITY,
  };
}

export function createBandsawSledBracketGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  const foot = createPlateGeometry({
    outer: roundedRectangleRing(
      spec.bracketWidth,
      spec.bracketDepth,
      3,
      model.geometry.cornerSegments,
      0,
      spec.bracketDepth / 2,
    ),
    thickness: spec.bracketFootThickness,
    throughHoles: [
      capsuleRing(
        spec.lockSlotLength,
        spec.lockSlotWidth,
        "y",
        model.geometry.slotArcSegments,
        0,
        spec.bracketDepth / 2,
      ),
    ],
  });

  const smallRadius = model.geometry.boardBoltClearance / 2;
  const largeRadius = spec.insertPocketDiameter / 2;
  const back = createPlateGeometry({
    outer: roundedRectangleRing(
      spec.bracketWidth,
      spec.fenceHeight,
      3,
      model.geometry.cornerSegments,
      0,
      spec.fenceHeight / 2,
    ),
    thickness: spec.bracketBackThickness,
    steppedPockets: [
      model.geometry.bracketBoltLowerHeight,
      model.geometry.bracketBoltUpperHeight,
    ].map((height) => ({
      small: circleRing(smallRadius, model.geometry.radialSegments, 0, height),
      large: circleRing(largeRadius, model.geometry.radialSegments, 0, height),
      depth: spec.insertDepth,
    })),
  });
  back.rotateX(-Math.PI / 2);
  // Keep the back plate fused through the foot volume without duplicating the
  // foot's exact front-bottom edge in the exported triangle soup.
  back.translate(0, 0.02, spec.fenceHeight);

  const gussetInset = spec.bracketWidth / 2 - model.geometry.bracketGussetThickness;
  const gussets = [-gussetInset, gussetInset - model.geometry.bracketGussetThickness].map(
    (x) =>
      createGussetGeometry(
        model.geometry.bracketGussetThickness,
        spec.bracketGussetDepth,
        model.geometry.bracketGussetHeight,
        x,
        spec.bracketBackThickness,
        spec.bracketFootThickness,
      ),
  );
  const merged = mergeGeometries(
    [cleanMergeGeometry(foot), cleanMergeGeometry(back), ...gussets],
    false,
  );
  foot.dispose();
  back.dispose();
  gussets.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error("Unable to merge bandsaw sled bracket geometry");
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createBandsawSledLockKnobGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  const outer = starRing(
    model.geometry.lockKnobDiameter / 2,
    model.geometry.lockKnobDiameter * 0.39,
    model.geometry.lockKnobLobes,
  );
  const shaft = circleRing(
    spec.lockBoltDiameter / 2 + 0.35,
    model.geometry.radialSegments,
  );
  const headRadius =
    model.geometry.lockBoltHeadAcrossFlats / (2 * Math.cos(Math.PI / 6));
  const head = circleRing(headRadius + 0.25, 6);
  return createPlateGeometry({
    outer,
    thickness: model.geometry.lockKnobThickness,
    steppedPockets: [
      {
        small: shaft,
        large: head,
        depth: model.geometry.lockBoltHeadHeight + 0.3,
      },
    ],
  });
}

export function createBandsawSledBaseGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  const kerfEnd = Math.min(spec.baseDepth / 2 - 8, spec.fenceTravelMax + 8);
  const kerfStart = -spec.baseDepth / 2 + 0.5;
  const kerfLength = kerfEnd - kerfStart;
  return createPlateGeometry({
    outer: roundedRectangleRing(
      spec.baseWidth,
      spec.baseDepth,
      model.geometry.baseCornerRadius,
      model.geometry.cornerSegments,
    ),
    thickness: spec.baseThickness,
    throughHoles: [
      capsuleRing(
        kerfLength,
        spec.bladeKerf,
        "y",
        model.geometry.slotArcSegments,
        0,
        (kerfStart + kerfEnd) / 2,
      ),
    ],
    blindPockets: [-1, 1].map((sign) => ({
      ring: circleRing(
        spec.baseInsertDiameter / 2,
        model.geometry.radialSegments,
        sign * spec.bracketSpacing / 2,
        spec.baseInsertStationY,
      ),
      depth: spec.baseInsertDepth,
    })),
  });
}

export function createBandsawSledFenceGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  const boltHoles = [-1, 1].flatMap((sign) =>
    [
      model.geometry.bracketBoltLowerHeight,
      model.geometry.bracketBoltUpperHeight,
    ].map((height) =>
      circleRing(
        spec.boardBoltDiameter / 2 + 0.35,
        model.geometry.radialSegments,
        sign * spec.bracketSpacing / 2,
        height,
      ),
    ),
  );
  const kerfHeight = Math.min(spec.fenceHeight - 12, spec.fenceHeight * 0.62);
  const geometry = createPlateGeometry({
    outer: roundedRectangleRing(
      spec.fenceWidth,
      spec.fenceHeight,
      model.geometry.fenceCornerRadius,
      model.geometry.cornerSegments,
      0,
      spec.fenceHeight / 2,
    ),
    thickness: spec.fenceThickness,
    throughHoles: [
      ...boltHoles,
      capsuleRing(
        kerfHeight,
        spec.bladeKerf,
        "y",
        model.geometry.slotArcSegments,
        0,
        kerfHeight / 2 + 0.5,
      ),
    ],
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(
    0,
    spec.fencePosition - spec.fenceThickness / 2,
    spec.baseThickness + spec.fenceHeight,
  );
  return geometry;
}

function createPrimaryBracketGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  const geometry = createBandsawSledBracketGeometry(params, model);
  geometry.translate(
    -spec.bracketSpacing / 2,
    spec.fencePosition + spec.fenceThickness / 2,
    spec.baseThickness,
  );
  return geometry;
}

export function createBandsawSledGeometry(
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  return createPrimaryBracketGeometry(params, model);
}

export function createBandsawSledPartGeometries(
  params: ModelParams,
  model: BandsawSledModelDefinition,
): BandsawSledPart[] {
  return [
    {
      key: "left-bracket",
      label: "Left adjustable fence bracket",
      quantity: 1,
      geometry: createBandsawSledBracketGeometry(params, model),
    },
    {
      key: "right-bracket",
      label: "Right adjustable fence bracket",
      quantity: 1,
      geometry: createBandsawSledBracketGeometry(params, model),
    },
    {
      key: "left-lock-knob",
      label: "Left M6 lock knob",
      quantity: 1,
      geometry: createBandsawSledLockKnobGeometry(params, model),
    },
    {
      key: "right-lock-knob",
      label: "Right M6 lock knob",
      quantity: 1,
      geometry: createBandsawSledLockKnobGeometry(params, model),
    },
  ];
}

export function createBandsawSledPreviewParts(
  params: ModelParams,
  model: BandsawSledModelDefinition,
): BandsawSledPreviewPart[] {
  const spec = getBandsawSledSpec(params, model);
  const parts: BandsawSledPreviewPart[] = [];
  parts.push({ key: "wood-base", material: "wood", geometry: createBandsawSledBaseGeometry(params, model) });
  parts.push({ key: "wood-fence", material: "wood", geometry: createBandsawSledFenceGeometry(params, model) });

  const runner = new THREE.BoxGeometry(
    model.geometry.runnerWidth,
    model.geometry.runnerDepth,
    model.geometry.runnerHeight,
  );
  runner.translate(0, 0, -model.geometry.runnerHeight / 2);
  parts.push({ key: "wood-runner", material: "wood", geometry: runner });

  const rightBracket = createBandsawSledBracketGeometry(params, model);
  rightBracket.translate(
    spec.bracketSpacing / 2,
    spec.fencePosition + spec.fenceThickness / 2,
    spec.baseThickness,
  );
  parts.push({ key: "right-bracket", material: "printed", geometry: rightBracket });

  for (const sign of [-1, 1]) {
    const x = sign * spec.bracketSpacing / 2;
    const knob = createBandsawSledLockKnobGeometry(params, model);
    knob.translate(
      x,
      spec.baseInsertStationY,
      spec.baseThickness + spec.bracketFootThickness + model.geometry.lockWasherThickness,
    );
    parts.push({
      key: sign < 0 ? "left-lock-knob" : "right-lock-knob",
      material: "printed-accent",
      geometry: knob,
    });

    const lockWasher = orientCylinderAlongZ(
      new THREE.CylinderGeometry(
        model.geometry.lockWasherDiameter / 2,
        model.geometry.lockWasherDiameter / 2,
        model.geometry.lockWasherThickness,
        model.geometry.radialSegments,
      ),
    );
    lockWasher.translate(
      x,
      spec.baseInsertStationY,
      spec.baseThickness + spec.bracketFootThickness + model.geometry.lockWasherThickness / 2,
    );
    parts.push({ key: `lock-washer-${sign}`, material: "metal", geometry: lockWasher });

    const lockBolt = orientCylinderAlongZ(
      new THREE.CylinderGeometry(
        spec.lockBoltDiameter / 2,
        spec.lockBoltDiameter / 2,
        spec.lockBoltLength,
        model.geometry.radialSegments,
      ),
    );
    lockBolt.translate(
      x,
      spec.baseInsertStationY,
      spec.baseThickness + spec.bracketFootThickness - spec.lockBoltLength / 2,
    );
    parts.push({ key: `lock-bolt-${sign}`, material: "metal", geometry: lockBolt });

    const baseInsert = orientCylinderAlongZ(
      new THREE.CylinderGeometry(
        spec.baseInsertDiameter / 2,
        spec.baseInsertDiameter / 2,
        spec.baseInsertDepth,
        model.geometry.radialSegments,
      ),
    );
    baseInsert.translate(
      x,
      spec.baseInsertStationY,
      spec.baseThickness - spec.baseInsertDepth / 2,
    );
    parts.push({ key: `wood-insert-${sign}`, material: "brass", geometry: baseInsert });

    for (const height of [
      model.geometry.bracketBoltLowerHeight,
      model.geometry.bracketBoltUpperHeight,
    ]) {
      const bracketFaceY = spec.fencePosition + spec.fenceThickness / 2;
      const boltLength = spec.fenceThickness + spec.bracketBackThickness + 4;
      const boardBolt = new THREE.CylinderGeometry(
        spec.boardBoltDiameter / 2,
        spec.boardBoltDiameter / 2,
        boltLength,
        model.geometry.radialSegments,
      );
      boardBolt.translate(
        x,
        bracketFaceY - spec.fenceThickness / 2 + boltLength / 2,
        spec.baseThickness + height,
      );
      parts.push({ key: `board-bolt-${sign}-${height}`, material: "metal", geometry: boardBolt });

      const washer = new THREE.CylinderGeometry(
        model.geometry.boardWasherDiameter / 2,
        model.geometry.boardWasherDiameter / 2,
        model.geometry.boardWasherThickness,
        model.geometry.radialSegments,
      );
      washer.translate(
        x,
        spec.fencePosition - spec.fenceThickness / 2 - model.geometry.boardWasherThickness / 2,
        spec.baseThickness + height,
      );
      parts.push({ key: `board-washer-${sign}-${height}`, material: "metal", geometry: washer });

      const heatInsert = createPlateGeometry({
        outer: circleRing(
          spec.insertPocketDiameter / 2,
          model.geometry.radialSegments,
        ),
        thickness: 0.8,
        throughHoles: [
          circleRing(
            spec.boardBoltDiameter / 2 + 0.25,
            model.geometry.radialSegments,
          ),
        ],
      });
      heatInsert.rotateX(-Math.PI / 2);
      heatInsert.translate(
        x,
        bracketFaceY + spec.bracketBackThickness,
        spec.baseThickness + height,
      );
      parts.push({ key: `heat-insert-${sign}-${height}`, material: "brass", geometry: heatInsert });
    }
  }
  return parts;
}

export function getBandsawSledDimensions(
  params: ModelParams,
  model: BandsawSledModelDefinition,
): ModelDimensions {
  const spec = getBandsawSledSpec(params, model);
  return {
    length: spec.baseWidth,
    width: spec.baseDepth,
    height: spec.baseThickness + spec.fenceHeight,
  };
}

export function updateBandsawSledGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: BandsawSledModelDefinition,
) {
  const spec = getBandsawSledSpec(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    spec.baseWidth,
    spec.baseDepth,
    spec.baseThickness + spec.fenceHeight,
  );
  mesh.position.z = (spec.baseThickness + spec.fenceHeight) / 2;
}

export function getBandsawSledParameterLimits(
  model: BandsawSledModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const spec = getBandsawSledSpec(params, model);
  const nominalFencePosition =
    (spec.fenceTravelMin + spec.fenceTravelMax) / 2;
  if (key === "baseDepth") {
    const requiredDepth =
      2 *
      (nominalFencePosition +
        spec.fenceThickness / 2 +
        spec.bracketDepth +
        model.geometry.minimumBaseEdgeMargin);
    limits.min = Math.max(
      limits.min,
      Math.ceil(requiredDepth / limits.step) * limits.step,
    );
  } else if (key === "fencePosition") {
    limits.min = Math.max(limits.min, spec.fenceTravelMin);
    limits.max = Math.min(limits.max, spec.fenceTravelMax);
  } else if (key === "fenceWidth") {
    limits.min = Math.max(
      limits.min,
      spec.bracketSpacing + spec.bracketWidth + model.geometry.minimumFenceEdgeMargin * 2,
    );
    limits.max = Math.min(limits.max, spec.baseWidth - 20);
  } else if (key === "fenceHeight") {
    limits.min = Math.max(
      limits.min,
      model.geometry.bracketBoltUpperHeight +
        spec.boardBoltDiameter / 2 +
        model.geometry.minimumInsertWall,
    );
  } else if (key === "bracketSpacing") {
    limits.max = Math.min(
      limits.max,
      spec.fenceWidth - spec.bracketWidth - model.geometry.minimumFenceEdgeMargin * 2,
      spec.baseWidth - spec.bracketWidth - model.geometry.minimumBracketSpacingMargin * 2,
    );
  } else if (key === "bracketWidth") {
    limits.max = Math.min(
      limits.max,
      spec.fenceWidth - spec.bracketSpacing - model.geometry.minimumFenceEdgeMargin * 2,
    );
    limits.min = Math.max(
      limits.min,
      spec.insertPocketDiameter + model.geometry.minimumInsertWall * 2,
    );
  } else if (key === "lockSlotLength") {
    limits.max = Math.min(
      limits.max,
      spec.bracketDepth - model.geometry.minimumSlotEndWeb * 2,
    );
  } else if (key === "bracketDepth") {
    limits.min = Math.max(
      limits.min,
      spec.lockSlotLength + model.geometry.minimumSlotEndWeb * 2,
      spec.bracketGussetDepth + model.geometry.bracketBackThickness,
    );
  } else if (key === "insertPocketDiameter") {
    limits.max = Math.min(
      limits.max,
      spec.bracketWidth - model.geometry.minimumInsertWall * 2,
    );
  } else if (key === "insertDepth") {
    limits.max = Math.min(
      limits.max,
      model.geometry.bracketBackThickness - model.geometry.minimumInsertShoulder,
    );
  } else if (key === "baseInsertDepth") {
    limits.max = Math.min(
      limits.max,
      spec.baseThickness - model.geometry.minimumWoodInsertFloor,
    );
  } else if (key === "baseThickness") {
    limits.min = Math.max(
      limits.min,
      spec.baseInsertDepth + model.geometry.minimumWoodInsertFloor,
    );
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getBandsawSledAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: BandsawSledModelDefinition,
): AuditItem {
  const spec = getBandsawSledSpec(params, model);
  const pass = (value: string): AuditItem => ({ label: check.label, value, status: "pass" });
  const warn = (value: string): AuditItem => ({ label: check.label, value, status: "warn" });
  switch (check.key) {
    case "materials":
      return pass("Wood base + wood fence + hardwood runner · 2 printed brackets + 2 printed knobs");
    case "sledEnvelope":
      return pass(
        `${formatLength(spec.baseWidth, unit)} × ${formatLength(spec.baseDepth, unit)} × ${formatLength(spec.baseThickness, unit)} wood base`,
      );
    case "fenceTravel":
      return spec.fencePosition >= spec.fenceTravelMin - EPSILON &&
        spec.fencePosition <= spec.fenceTravelMax + EPSILON
        ? pass(
            `${formatLength(spec.fenceTravelMin, unit)}–${formatLength(spec.fenceTravelMax, unit)} setback · ${formatLength(spec.lockSlotLength - spec.lockSlotWidth, unit)} usable travel`,
          )
        : warn("Fence lies beyond the two lock-slot ranges");
    case "fenceSquareness":
      return spec.bracketSpacing > spec.bracketWidth * 3
        ? pass(`2 brackets at ${formatLength(spec.bracketSpacing, unit)} centers prevent fence yaw`)
        : warn("Bracket spacing is too narrow to resist fence yaw");
    case "bracketLength":
      return spec.bracketDepth <= getParameter(model, "bracketDepth").limits.max + EPSILON &&
        spec.bracketGussetDepth + model.geometry.bracketBackThickness <= spec.bracketDepth + EPSILON &&
        spec.baseSupportMargin >= model.geometry.minimumBaseEdgeMargin - EPSILON
        ? pass(
            `${formatLength(spec.bracketDepth, unit)} bracket · ${formatLength(spec.bracketGussetDepth, unit)} gusset (${(spec.bracketGussetLengthRatio * 100).toFixed(0)}%) · ${formatLength(spec.baseSupportMargin, unit)} base margin`,
          )
        : warn("Bracket, gusset, or supporting base length is outside the safe envelope");
    case "bracketStrength":
      return spec.bracketSafetyFactor >= model.geometry.minimumScreenSafetyFactor
        ? pass(`${spec.bracketStress.toFixed(2)} MPa screen · ${spec.bracketSafetyFactor.toFixed(1)}× safety factor`)
        : warn(`${spec.bracketStress.toFixed(2)} MPa · ${spec.bracketSafetyFactor.toFixed(1)}× safety factor`);
    case "bracketDeflection":
      return spec.bracketDeflection <= model.geometry.maximumScreenDeflection
        ? pass(`${spec.bracketDeflection.toFixed(3)} mm under ${model.geometry.screenLateralLoadN} N lateral screen load`)
        : warn(`${spec.bracketDeflection.toFixed(3)} mm predicted deflection`);
    case "boardFasteners":
      return spec.boardBoltEngagement >= 4 && spec.boardBoltEngagement <= spec.insertDepth + 0.5
        ? pass(`4 × M5 × ${formatLength(spec.boardBoltLength, unit)} · ${formatLength(spec.boardBoltEngagement, unit)} insert engagement`)
        : warn(`${formatLength(spec.boardBoltEngagement, unit)} M5 insert engagement`);
    case "lockFasteners":
      return spec.lockEngagement >= 8 && spec.lockEngagement <= spec.baseInsertDepth + 0.5
        ? pass(`2 × M6 × ${formatLength(spec.lockBoltLength, unit)} · ${formatLength(spec.lockEngagement, unit)} wood-insert engagement`)
        : warn(`${formatLength(spec.lockEngagement, unit)} M6 wood-insert engagement`);
    case "threadedInserts":
      return spec.insertShoulder >= model.geometry.minimumInsertShoulder &&
        spec.baseInsertFloor >= model.geometry.minimumWoodInsertFloor &&
        spec.insertSideWall >= model.geometry.minimumInsertWall
        ? pass(`4 M5 heat-set inserts in printed brackets · 2 M6 screw-in inserts in wood base`)
        : warn(`${formatLength(spec.insertShoulder, unit)} bracket shoulder · ${formatLength(spec.baseInsertFloor, unit)} wood floor`);
    case "slotWeb":
      return spec.slotEndWeb >= model.geometry.minimumSlotEndWeb
        ? pass(`${formatLength(spec.slotEndWeb, unit)} plastic beyond each slot end`)
        : warn(`${formatLength(spec.slotEndWeb, unit)} slot-end web`);
    case "bladePath":
      return pass(`${formatLength(spec.bladeKerf, unit)} center kerf in base and sacrificial fence`);
    case "woodCutList":
      return pass(`Base ${formatLength(spec.baseWidth, unit)} × ${formatLength(spec.baseDepth, unit)} × ${formatLength(spec.baseThickness, unit)} · fence ${formatLength(spec.fenceWidth, unit)} × ${formatLength(spec.fenceHeight, unit)} × ${formatLength(spec.fenceThickness, unit)}`);
    case "printSet":
      return pass("4 individual STLs · left/right bracket + left/right captive-bolt knob");
    case "previewLegend":
      return pass("Wood, printed plastic, steel bolts/washers, and brass inserts use distinct preview materials");
    case "printOrientation":
      return spec.insertPocketDiameter <= model.geometry.maximumHorizontalBridge
        ? pass("Bracket foot flat with gussets upright · knobs flat · no supports expected")
        : warn(`${formatLength(spec.insertPocketDiameter, unit)} horizontal insert bridge may need support`);
    default:
      return warn("Unsupported audit check");
  }
}
