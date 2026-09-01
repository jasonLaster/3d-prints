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
  handleProfile: "lobed" | "rounded-triangle";
  triangleCornerRadius: number;
  triangleSideBulge: number;
  nutLeadIn: number;
  nutEntryCornerDiameter: number;
  nutPocketAcrossFlats: number;
  nutPocketDepth: number;
  nutPocketCornerDiameter: number;
  overallHeight: number;
  pocketRoofThickness: number;
  retentionBandHeight: number;
  retentionDiameter: number;
  retentionInterference: number;
  retentionLeadIn: number;
  thinnestHandleWall: number;
  thinnestGuardWall: number;
};

function hasParameter(model: MetricNutKnobModelDefinition, key: string) {
  return model.parameters.some((parameter) => parameter.key === key);
}

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

function roundedTriangleRing(
  maximumRadius: number,
  cornerRadius: number,
  sideBulge: number,
  segmentsPerSide: number,
) {
  const vertexRadius = maximumRadius + cornerRadius;
  const vertices = Array.from({ length: 3 }, (_, index) => {
    const angle = Math.PI / 2 + (index / 3) * Math.PI * 2;
    return new THREE.Vector2(
      Math.cos(angle) * vertexRadius,
      Math.sin(angle) * vertexRadius,
    );
  });
  const tangentDistance = cornerRadius / Math.tan(Math.PI / 6);
  const cornerCenters = vertices.map((vertex) =>
    vertex.clone().add(vertex.clone().normalize().multiplyScalar(-cornerRadius * 2)),
  );
  const incoming = vertices.map((vertex, index) => {
    const previous = vertices[(index + 2) % 3];
    return vertex
      .clone()
      .add(previous.clone().sub(vertex).normalize().multiplyScalar(tangentDistance));
  });
  const outgoing = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % 3];
    return vertex
      .clone()
      .add(next.clone().sub(vertex).normalize().multiplyScalar(tangentDistance));
  });
  const sideSegments = Math.max(4, segmentsPerSide);
  const cornerSegments = Math.max(4, Math.ceil(segmentsPerSide / 2));
  const points: Point[] = [];

  for (let index = 0; index < 3; index += 1) {
    const next = (index + 1) % 3;
    const start = outgoing[index];
    const end = incoming[next];
    const direction = end.clone().sub(start);
    const outward = new THREE.Vector2(direction.y, -direction.x).normalize();
    const control = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .add(outward.multiplyScalar(sideBulge * 2));
    for (let segment = 0; segment < sideSegments; segment += 1) {
      const t = segment / sideSegments;
      const inverse = 1 - t;
      points.push(
        start
          .clone()
          .multiplyScalar(inverse * inverse)
          .add(control.clone().multiplyScalar(2 * inverse * t))
          .add(end.clone().multiplyScalar(t * t)),
      );
    }

    const center = cornerCenters[next];
    const startAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const cornerEnd = outgoing[next];
    let sweep =
      Math.atan2(cornerEnd.y - center.y, cornerEnd.x - center.x) - startAngle;
    while (sweep <= 0) sweep += Math.PI * 2;
    for (let segment = 0; segment < cornerSegments; segment += 1) {
      const angle = startAngle + sweep * (segment / cornerSegments);
      points.push(
        new THREE.Vector2(
          center.x + Math.cos(angle) * cornerRadius,
          center.y + Math.sin(angle) * cornerRadius,
        ),
      );
    }
  }
  return points;
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
  model: MetricNutKnobModelDefinition,
): MetricNutKnobSpec {
  const boltHoleDiameter =
    getParam(params, "boltDiameter") + getParam(params, "boltClearance");
  const nutPocketAcrossFlats =
    getParam(params, "nutAcrossFlats") + getParam(params, "nutClearance");
  const nutPocketCornerDiameter = nutPocketAcrossFlats / Math.cos(Math.PI / 6);
  const knobDiameter = getParam(params, "knobDiameter");
  const lobeDepth = hasParameter(model, "lobeDepth")
    ? getParam(params, "lobeDepth")
    : 0;
  const handleRoundover = getParam(params, "handleRoundover");
  const handleHeight = getParam(params, "handleHeight");
  const nutPocketDepth = getParam(params, "nutPocketDepth");
  const nutLeadIn = getParam(params, "nutLeadIn");
  const nutEntryCornerDiameter =
    (nutPocketAcrossFlats + nutLeadIn * 2) / Math.cos(Math.PI / 6);
  const guardBaseDiameter = getParam(params, "guardBaseDiameter");
  const guardTopDiameter = getParam(params, "guardTopDiameter");
  const guardHeight = getParam(params, "guardHeight");
  const handleProfile = model.geometry.handleProfile ?? "lobed";
  const triangleCornerRadius = hasParameter(model, "triangleCornerRadius")
    ? getParam(params, "triangleCornerRadius")
    : 0;
  const triangleSideBulge = hasParameter(model, "triangleSideBulge")
    ? getParam(params, "triangleSideBulge")
    : 0;
  const retentionInterference = hasParameter(model, "retentionInterference")
    ? getParam(params, "retentionInterference")
    : 0;
  const retentionBandHeight = hasParameter(model, "retentionBandHeight")
    ? getParam(params, "retentionBandHeight")
    : 0;
  const retentionLeadIn = hasParameter(model, "retentionLeadIn")
    ? getParam(params, "retentionLeadIn")
    : 0;
  const nominalHandle =
    handleProfile === "rounded-triangle"
      ? roundedTriangleRing(
          knobDiameter / 2,
          triangleCornerRadius,
          triangleSideBulge,
          model.geometry.triangleSegmentsPerSide ?? model.geometry.segmentsPerLobe,
        )
      : starRing(
          knobDiameter / 2,
          lobeDepth,
          Math.round(getParam(params, "lobeCount")),
          getParam(params, "lobeRadius"),
          model.geometry.segmentsPerLobe,
        );
  const minimumHandleRadius = Math.min(...nominalHandle.map((point) => point.length()));
  return {
    boltHoleDiameter,
    guardBaseDiameter,
    guardHeight,
    guardTopDiameter,
    handleHeight,
    handleRoundover,
    knobDiameter,
    lobeCount: hasParameter(model, "lobeCount")
      ? Math.round(getParam(params, "lobeCount"))
      : 3,
    lobeDepth,
    lobeRadius: hasParameter(model, "lobeRadius")
      ? getParam(params, "lobeRadius")
      : 0,
    handleProfile,
    triangleCornerRadius,
    triangleSideBulge,
    nutLeadIn,
    nutEntryCornerDiameter,
    nutPocketAcrossFlats,
    nutPocketDepth,
    nutPocketCornerDiameter,
    overallHeight: handleHeight + guardHeight,
    pocketRoofThickness: handleHeight - nutPocketDepth,
    retentionBandHeight,
    retentionDiameter: Math.max(0.5, getParam(params, "boltDiameter") - retentionInterference),
    retentionInterference,
    retentionLeadIn,
    thinnestHandleWall:
      minimumHandleRadius - handleRoundover - nutEntryCornerDiameter / 2,
    thinnestGuardWall:
      Math.min(guardBaseDiameter, guardTopDiameter) / 2 - boltHoleDiameter / 2,
  };
}

function getHandleRings(
  spec: MetricNutKnobSpec,
  model: MetricNutKnobModelDefinition,
) {
  const nominal = spec.handleProfile === "rounded-triangle"
    ? roundedTriangleRing(
        spec.knobDiameter / 2,
        spec.triangleCornerRadius,
        spec.triangleSideBulge,
        model.geometry.triangleSegmentsPerSide ?? model.geometry.segmentsPerLobe,
      )
    : starRing(
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
  const spec = getMetricNutKnobSpec(params, model);
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
  if (spec.retentionInterference > EPSILON && spec.retentionBandHeight > EPSILON) {
    const retention = circleRing(
      spec.retentionDiameter / 2,
      model.geometry.radialSegments,
    );
    const lowerRampStart =
      spec.overallHeight - spec.retentionBandHeight - spec.retentionLeadIn * 2;
    const bandStart = lowerRampStart + spec.retentionLeadIn;
    const bandEnd = bandStart + spec.retentionBandHeight;
    addRingBridge(
      positions,
      bore,
      bore,
      spec.nutPocketDepth,
      lowerRampStart,
      true,
    );
    addRingBridge(positions, bore, retention, lowerRampStart, bandStart, true);
    addRingBridge(positions, retention, retention, bandStart, bandEnd, true);
    addRingBridge(
      positions,
      retention,
      bore,
      bandEnd,
      spec.overallHeight,
      true,
    );
  } else {
    addRingBridge(
      positions,
      bore,
      bore,
      spec.nutPocketDepth,
      spec.overallHeight,
      true,
    );
  }
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
  const spec = getMetricNutKnobSpec(params, model);
  const lobeDepth = hasParameter(model, "lobeDepth")
    ? getParam(params, "lobeDepth")
    : 0;
  const lobeRadius = hasParameter(model, "lobeRadius")
    ? getParam(params, "lobeRadius")
    : 0;
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
  const minimumHandleRadius =
    spec.thinnestHandleWall + handleRoundover + spec.nutEntryCornerDiameter / 2;
  const triangleRatio = Math.max(minimumHandleRadius / knobDiameter, 0.1);
  const maximumGuardBase =
    model.geometry.handleProfile === "rounded-triangle"
      ? (minimumHandleRadius - handleRoundover) * 2 - minimumWall * 0.5
      : knobDiameter - (lobeDepth + handleRoundover) * 2 - minimumWall * 0.5;

  if (key === "knobDiameter") {
    limits.min = model.geometry.handleProfile === "rounded-triangle"
      ? Math.max(
          limits.min,
          (nutCornerRadius + handleRoundover + minimumWall) / triangleRatio,
          (getParam(params, "guardBaseDiameter") / 2 + handleRoundover + minimumWall * 0.25) /
            triangleRatio,
        )
      : Math.max(
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
  } else if (key === "triangleCornerRadius") {
    limits.max = Math.min(limits.max, knobDiameter * 0.2);
  } else if (key === "triangleSideBulge") {
    limits.max = Math.min(limits.max, knobDiameter * 0.2);
  } else if (key === "handleRoundover") {
    limits.max = Math.min(
      limits.max,
      handleHeight / 2,
      minimumHandleRadius - nutCornerRadius - minimumWall,
      minimumHandleRadius - getParam(params, "guardBaseDiameter") / 2 - minimumWall * 0.25,
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
      (minimumHandleRadius -
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
          (minimumHandleRadius - handleRoundover - minimumWall) -
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
  } else if (key === "guardHeight") {
    if (hasParameter(model, "retentionBandHeight")) {
      limits.min = Math.max(
        limits.min,
        getParam(params, "retentionBandHeight") +
          getParam(params, "retentionLeadIn") * 2 +
          0.4,
      );
    }
  } else if (key === "retentionInterference") {
    limits.max = Math.min(limits.max, getParam(params, "boltDiameter") * 0.12);
  } else if (key === "retentionBandHeight") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "guardHeight") - getParam(params, "retentionLeadIn") * 2 - 0.4,
    );
  } else if (key === "retentionLeadIn") {
    limits.max = Math.min(
      limits.max,
      (getParam(params, "guardHeight") - getParam(params, "retentionBandHeight") - 0.4) / 2,
    );
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
  const spec = getMetricNutKnobSpec(params, model);
  if (check.key === "fastenerFit") {
    const retention = spec.retentionInterference > EPSILON
      ? ` · ${formatLength(spec.retentionDiameter, unit)} retention collar`
      : "";
    return {
      label: check.label,
      value: `${formatLength(spec.boltHoleDiameter, unit)} bore · ${formatLength(spec.nutPocketAcrossFlats, unit)} AF pocket${retention}`,
      status: "pass",
    };
  }
  if (check.key === "handleEnvelope") {
    return {
      label: check.label,
      value: spec.handleProfile === "rounded-triangle"
        ? `Soft triangle · ${formatLength(spec.knobDiameter, unit)} tip span · ${formatLength(spec.handleHeight, unit)} high`
        : `${spec.lobeCount} lobes · ${formatLength(spec.knobDiameter, unit)} tip diameter · ${formatLength(spec.handleHeight, unit)} high`,
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
    value: spec.retentionInterference > EPSILON
      ? "Flat handle face on Z = 0; captive-nut pocket opens downward; retention collar sits inside the guard exit"
      : "Flat handle face on Z = 0; captive-nut pocket opens downward",
    status: "pass",
  };
}
