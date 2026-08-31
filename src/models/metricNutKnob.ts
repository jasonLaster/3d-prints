import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  MetricNutKnobModelDefinition,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;

type Point = THREE.Vector2;

export type MetricNutKnobSpec = {
  boltHoleDiameter: number;
  guardBaseDiameter: number;
  guardHeight: number;
  guardTopDiameter: number;
  handleHeight: number;
  handleRoundover: number;
  knobDiameter: number;
  lobeCount: number;
  lobeDepth: number;
  lobeRadius: number;
  nutLeadIn: number;
  nutEntryCornerDiameter: number;
  nutPocketAcrossFlats: number;
  nutPocketDepth: number;
  nutPocketCornerDiameter: number;
  overallHeight: number;
  pocketRoofThickness: number;
  thinnestHandleWall: number;
  thinnestGuardWall: number;
};

function polygonArea(points: Point[]) {
  return points.reduce((area, current, index) => {
    const next = points[(index + 1) % points.length];
    return area + current.x * next.y - next.x * current.y;
  }, 0) / 2;
}

function orientRing(points: Point[], clockwise: boolean) {
  const copy = points.map((point) => point.clone());
  return (polygonArea(copy) < 0) === clockwise ? copy : copy.reverse();
}

function circleRing(radius: number, segments: number) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
}

function hexRing(acrossFlats: number) {
  const radius = acrossFlats / (2 * Math.cos(Math.PI / 6));
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 2 + (index / 6) * Math.PI * 2;
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
}

function starRing(
  maximumRadius: number,
  lobeDepth: number,
  lobeCount: number,
  lobeRadius: number,
  segmentsPerLobe: number,
) {
  const segments = lobeCount * segmentsPerLobe;
  const coreRadius = maximumRadius - lobeDepth;
  const lobeCenterRadius = maximumRadius - lobeRadius;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    const period = (Math.PI * 2) / lobeCount;
    const relative = angle - Math.PI / 2;
    const delta = relative - Math.round(relative / period) * period;
    const discriminant =
      lobeRadius * lobeRadius -
      lobeCenterRadius * lobeCenterRadius * Math.sin(delta) ** 2;
    const bulbRadius =
      discriminant >= 0
        ? lobeCenterRadius * Math.cos(delta) + Math.sqrt(discriminant)
        : 0;
    const blend = Math.min(lobeDepth * 0.25, lobeRadius * 0.2);
    const separation = Math.abs(coreRadius - bulbRadius);
    const blendWeight =
      blend > EPSILON ? Math.max(blend - separation, 0) / blend : 0;
    const radius =
      Math.max(coreRadius, bulbRadius) +
      (blendWeight * blendWeight * blend) / 4;
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
}

function insetRing(points: Point[], inset: number) {
  return points.map((point) => {
    const radius = Math.max(EPSILON, point.length() - inset);
    return point.clone().setLength(radius);
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
  if (lower.length !== upper.length) {
    throw new Error("Loft rings must have matching vertex counts");
  }
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
  const outer = orientRing(contour, true);
  const inner = holes.map((hole) => orientRing(hole, false));
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

export function getMetricNutKnobSpec(
  params: ModelParams,
): MetricNutKnobSpec {
  const boltHoleDiameter =
    getParam(params, "boltDiameter") + getParam(params, "boltClearance");
  const nutPocketAcrossFlats =
    getParam(params, "nutAcrossFlats") + getParam(params, "nutClearance");
  const nutPocketCornerDiameter = nutPocketAcrossFlats / Math.cos(Math.PI / 6);
  const knobDiameter = getParam(params, "knobDiameter");
  const lobeDepth = getParam(params, "lobeDepth");
  const handleRoundover = getParam(params, "handleRoundover");
  const handleHeight = getParam(params, "handleHeight");
  const nutPocketDepth = getParam(params, "nutPocketDepth");
  const nutLeadIn = getParam(params, "nutLeadIn");
  const nutEntryCornerDiameter =
    (nutPocketAcrossFlats + nutLeadIn * 2) / Math.cos(Math.PI / 6);
  const guardBaseDiameter = getParam(params, "guardBaseDiameter");
  const guardTopDiameter = getParam(params, "guardTopDiameter");
  const guardHeight = getParam(params, "guardHeight");
  return {
    boltHoleDiameter,
    guardBaseDiameter,
    guardHeight,
    guardTopDiameter,
    handleHeight,
    handleRoundover,
    knobDiameter,
    lobeCount: Math.round(getParam(params, "lobeCount")),
    lobeDepth,
    lobeRadius: getParam(params, "lobeRadius"),
    nutLeadIn,
    nutEntryCornerDiameter,
    nutPocketAcrossFlats,
    nutPocketDepth,
    nutPocketCornerDiameter,
    overallHeight: handleHeight + guardHeight,
    pocketRoofThickness: handleHeight - nutPocketDepth,
    thinnestHandleWall:
      knobDiameter / 2 - lobeDepth - handleRoundover - nutEntryCornerDiameter / 2,
    thinnestGuardWall:
      Math.min(guardBaseDiameter, guardTopDiameter) / 2 - boltHoleDiameter / 2,
  };
}

function getHandleRings(
  spec: MetricNutKnobSpec,
  model: MetricNutKnobModelDefinition,
) {
  const nominal = starRing(
    spec.knobDiameter / 2,
    spec.lobeDepth,
    spec.lobeCount,
    spec.lobeRadius,
    model.geometry.segmentsPerLobe,
  );
  const sections = Math.max(1, model.geometry.roundoverSegments);
  const bottom: { ring: Point[]; z: number }[] = [];
  for (let index = 0; index <= sections; index += 1) {
    const progress = index / sections;
    const angle = progress * Math.PI / 2;
    bottom.push({
      ring: insetRing(nominal, spec.handleRoundover * (1 - Math.sin(angle))),
      z: spec.handleRoundover * (1 - Math.cos(angle)),
    });
  }
  const rings = [...bottom];
  const straightTopZ = spec.handleHeight - spec.handleRoundover;
  if (straightTopZ > spec.handleRoundover + EPSILON) {
    rings.push({
      ring: nominal.map((point) => point.clone()),
      z: straightTopZ,
    });
  }
  for (let index = sections - 1; index >= 0; index -= 1) {
    const section = bottom[index];
    rings.push({
      ring: section.ring.map((point) => point.clone()),
      z: spec.handleHeight - section.z,
    });
  }
  return rings;
}

export function createMetricNutKnobGeometry(
  params: ModelParams,
  model: MetricNutKnobModelDefinition,
) {
  const spec = getMetricNutKnobSpec(params);
  const handleRings = getHandleRings(spec, model);
  const bore = circleRing(spec.boltHoleDiameter / 2, model.geometry.radialSegments);
  const guardBase = circleRing(
    spec.guardBaseDiameter / 2,
    model.geometry.radialSegments,
  );
  const guardTop = circleRing(
    spec.guardTopDiameter / 2,
    model.geometry.radialSegments,
  );
  const nutPocket = hexRing(spec.nutPocketAcrossFlats);
  const nutEntry = hexRing(spec.nutPocketAcrossFlats + spec.nutLeadIn * 2);
  const positions: number[] = [];

  addHorizontalFace(positions, handleRings[0].ring, [nutEntry], 0, false);
  handleRings.slice(0, -1).forEach((section, index) => {
    const next = handleRings[index + 1];
    addRingBridge(
      positions,
      section.ring,
      next.ring,
      section.z,
      next.z,
    );
  });
  addHorizontalFace(
    positions,
    handleRings[handleRings.length - 1].ring,
    [guardBase],
    spec.handleHeight,
    true,
  );

  if (spec.nutLeadIn > EPSILON) {
    addRingBridge(
      positions,
      nutEntry,
      nutPocket,
      0,
      spec.nutLeadIn,
      true,
    );
    addRingBridge(
      positions,
      nutPocket,
      nutPocket,
      spec.nutLeadIn,
      spec.nutPocketDepth,
      true,
    );
  } else {
    addRingBridge(
      positions,
      nutPocket,
      nutPocket,
      0,
      spec.nutPocketDepth,
      true,
    );
  }
  addHorizontalFace(
    positions,
    nutPocket,
    [bore],
    spec.nutPocketDepth,
    false,
  );
  addRingBridge(
    positions,
    bore,
    bore,
    spec.nutPocketDepth,
    spec.overallHeight,
    true,
  );
  addRingBridge(
    positions,
    guardBase,
    guardTop,
    spec.handleHeight,
    spec.overallHeight,
  );
  addHorizontalFace(
    positions,
    guardTop,
    [bore],
    spec.overallHeight,
    true,
  );

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

export function getMetricNutKnobDimensions(
  params: ModelParams,
  model: MetricNutKnobModelDefinition,
): ModelDimensions {
  const geometry = createMetricNutKnobGeometry(params, model);
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  geometry.dispose();
  return { length: size.x, width: size.y, height: size.z };
}

export function updateMetricNutKnobGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: MetricNutKnobModelDefinition,
) {
  const dimensions = getMetricNutKnobDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.z = dimensions.height / 2;
}

export function getMetricNutKnobParameterLimits(
  model: MetricNutKnobModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const minimumWall = model.geometry.minimumWallThickness;
  const minimumRoof = model.geometry.minimumRoofThickness;
  const knobDiameter = getParam(params, "knobDiameter");
  const lobeDepth = getParam(params, "lobeDepth");
  const lobeRadius = getParam(params, "lobeRadius");
  const handleRoundover = getParam(params, "handleRoundover");
  const handleHeight = getParam(params, "handleHeight");
  const nutPocketDepth = getParam(params, "nutPocketDepth");
  const nutAcrossFlats =
    getParam(params, "nutAcrossFlats") + getParam(params, "nutClearance");
  const nutLeadIn = getParam(params, "nutLeadIn");
  const nutCornerRadius =
    (nutAcrossFlats + nutLeadIn * 2) / (2 * Math.cos(Math.PI / 6));
  const boltHoleDiameter =
    getParam(params, "boltDiameter") + getParam(params, "boltClearance");
  const maximumGuardBase =
    knobDiameter - (lobeDepth + handleRoundover) * 2 - minimumWall * 0.5;

  if (key === "knobDiameter") {
    limits.min = Math.max(
      limits.min,
      2 * (nutCornerRadius + lobeDepth + handleRoundover + minimumWall),
      lobeRadius * 2 + minimumWall,
      getParam(params, "guardBaseDiameter") +
        (lobeDepth + handleRoundover) * 2 +
        minimumWall * 0.5,
    );
  } else if (key === "lobeDepth") {
    limits.max = Math.min(
      limits.max,
      knobDiameter / 2 - handleRoundover - nutCornerRadius - minimumWall,
      (knobDiameter - getParam(params, "guardBaseDiameter") - minimumWall * 0.5) / 2 -
        handleRoundover,
      lobeRadius * 2,
    );
  } else if (key === "lobeRadius") {
    limits.min = Math.max(limits.min, lobeDepth / 2);
    limits.max = Math.min(limits.max, knobDiameter / 2 - minimumWall / 2);
  } else if (key === "handleRoundover") {
    limits.max = Math.min(
      limits.max,
      handleHeight / 2,
      knobDiameter / 2 - lobeDepth - nutCornerRadius - minimumWall,
      (knobDiameter - getParam(params, "guardBaseDiameter") - minimumWall * 0.5) / 2 -
        lobeDepth,
    );
  } else if (key === "handleHeight") {
    limits.min = Math.max(
      limits.min,
      nutPocketDepth + minimumRoof,
      handleRoundover * 2,
    );
  } else if (key === "nutPocketDepth") {
    limits.min = Math.max(limits.min, getParam(params, "nutLeadIn"));
    limits.max = Math.min(limits.max, handleHeight - minimumRoof);
  } else if (key === "nutLeadIn") {
    limits.max = Math.min(
      limits.max,
      nutPocketDepth,
      (knobDiameter / 2 -
        lobeDepth -
        handleRoundover -
        nutAcrossFlats / (2 * Math.cos(Math.PI / 6)) -
        minimumWall) * Math.cos(Math.PI / 6),
    );
  } else if (key === "nutAcrossFlats" || key === "nutClearance") {
    const other =
      key === "nutAcrossFlats"
        ? getParam(params, "nutClearance")
        : getParam(params, "nutAcrossFlats");
    limits.max = Math.min(
      limits.max,
      2 *
          Math.cos(Math.PI / 6) *
          (knobDiameter / 2 - lobeDepth - handleRoundover - minimumWall) -
        other -
        nutLeadIn * 2,
    );
  } else if (key === "boltDiameter" || key === "boltClearance") {
    const other =
      key === "boltDiameter"
        ? getParam(params, "boltClearance")
        : getParam(params, "boltDiameter");
    limits.max = Math.min(
      limits.max,
      Math.min(
          getParam(params, "guardBaseDiameter"),
          getParam(params, "guardTopDiameter"),
          nutAcrossFlats,
        ) -
        minimumWall * 2 -
        other,
    );
  } else if (key === "guardBaseDiameter") {
    limits.min = Math.max(limits.min, boltHoleDiameter + minimumWall * 2);
    limits.max = Math.min(limits.max, maximumGuardBase);
  } else if (key === "guardTopDiameter") {
    limits.min = Math.max(limits.min, boltHoleDiameter + minimumWall * 2);
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getMetricNutKnobAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: MetricNutKnobModelDefinition,
): AuditItem {
  const spec = getMetricNutKnobSpec(params);
  if (check.key === "fastenerFit") {
    return {
      label: check.label,
      value: `${formatLength(spec.boltHoleDiameter, unit)} bore · ${formatLength(spec.nutPocketAcrossFlats, unit)} AF pocket`,
      status: "pass",
    };
  }
  if (check.key === "handleEnvelope") {
    return {
      label: check.label,
      value: `${spec.lobeCount} lobes · ${formatLength(spec.knobDiameter, unit)} tip diameter · ${formatLength(spec.handleHeight, unit)} high`,
      status: "pass",
    };
  }
  if (check.key === "guardEnvelope") {
    return {
      label: check.label,
      value: `${formatLength(spec.guardBaseDiameter, unit)} → ${formatLength(spec.guardTopDiameter, unit)} · ${formatLength(spec.guardHeight, unit)} high`,
      status: "pass",
    };
  }
  if (check.key === "pocketRoof") {
    return {
      label: check.label,
      value: formatLength(spec.pocketRoofThickness, unit),
      status:
        spec.pocketRoofThickness + EPSILON >= model.geometry.minimumRoofThickness
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "minimumWalls") {
    const wall = Math.min(spec.thinnestHandleWall, spec.thinnestGuardWall);
    return {
      label: check.label,
      value: `${formatLength(wall, unit)} minimum (${formatLength(spec.thinnestHandleWall, unit)} handle, ${formatLength(spec.thinnestGuardWall, unit)} guard)`,
      status:
        wall + EPSILON >= model.geometry.minimumWallThickness ? "pass" : "warn",
    };
  }
  return {
    label: check.label,
    value: "Flat handle face on Z = 0; captive-nut pocket opens downward",
    status: "pass",
  };
}
