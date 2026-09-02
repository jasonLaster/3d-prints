import * as THREE from "three";
import { formatLength, toUnit } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  MiterRunnerWedgeModelDefinition,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;

type Point = THREE.Vector2;

export type MiterRunnerWedgeSpec = {
  slotWidth: number;
  runningClearance: number;
  finishedRunnerWidth: number;
  addedWidth: number;
  length: number;
  thickness: number;
  partEnvelopeWidth: number;
  narrowEndWidth: number;
  wideEndWidth: number;
  nearOuterY: number;
  farOuterY: number;
  taperAngleDegrees: number;
  nearEndBevelDegrees: number;
  farEndBevelDegrees: number;
  plateMarginPerEnd: number;
};

export function formatMiterRunnerFitLength(
  valueMm: number,
  unit: LengthUnit,
) {
  return unit === "in"
    ? `${toUnit(valueMm, unit).toFixed(3)} in`
    : formatLength(valueMm, unit, unit === "mm" ? 2 : 3);
}

function polygonArea(points: Point[]) {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function counterClockwise(points: Point[]) {
  const copy = points.map((point) => point.clone());
  return polygonArea(copy) > 0 ? copy : copy.reverse();
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

function addHorizontalFace(
  positions: number[],
  outline: Point[],
  z: number,
  upward: boolean,
) {
  const contour = counterClockwise(outline);
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const desiredNormal = new THREE.Vector3(0, 0, upward ? 1 : -1);
  triangles.forEach(([aIndex, bIndex, cIndex]) => {
    const point = (index: number) =>
      new THREE.Vector3(contour[index].x, contour[index].y, z);
    addOrientedTriangle(
      positions,
      point(aIndex),
      point(bIndex),
      point(cIndex),
      desiredNormal,
    );
  });
}

function addPrismSides(
  positions: number[],
  outline: Point[],
  bottomZ: number,
  topZ: number,
) {
  const contour = counterClockwise(outline);
  contour.forEach((point, index) => {
    const next = contour[(index + 1) % contour.length];
    const a = new THREE.Vector3(point.x, point.y, bottomZ);
    const b = new THREE.Vector3(next.x, next.y, bottomZ);
    const c = new THREE.Vector3(next.x, next.y, topZ);
    const d = new THREE.Vector3(point.x, point.y, topZ);
    addTriangle(positions, a, b, c);
    addTriangle(positions, a, c, d);
  });
}

export function getMiterRunnerWedgeSpec(
  params: ModelParams,
  model: MiterRunnerWedgeModelDefinition,
): MiterRunnerWedgeSpec {
  const geometry = model.geometry;
  const slotWidth = getParam(params, "miterSlotWidth");
  const runningClearance = getParam(params, "runningClearance");
  const finishedRunnerWidth = slotWidth - runningClearance;
  const endRunPerLateral = 1 / Math.tan(
    THREE.MathUtils.degToRad(geometry.endBevelDegrees),
  );
  const nearOuterY =
    geometry.interfaceStartY +
    (finishedRunnerWidth - geometry.interfaceStartX) * endRunPerLateral;
  const farOuterY =
    geometry.interfaceEndY -
    (finishedRunnerWidth - geometry.capShoulderX) * endRunPerLateral;
  const length = geometry.interfaceEndY - geometry.interfaceStartY;
  const thickness = geometry.sourceTopZ - geometry.sourceBottomZ;
  const taperAngleDegrees = THREE.MathUtils.radToDeg(
    Math.atan2(
      geometry.interfaceStartX - geometry.interfaceEndX,
      length,
    ),
  );
  const nearEndBevelDegrees = THREE.MathUtils.radToDeg(
    Math.atan2(
      finishedRunnerWidth - geometry.interfaceStartX,
      nearOuterY - geometry.interfaceStartY,
    ),
  );
  const farEndBevelDegrees = THREE.MathUtils.radToDeg(
    Math.atan2(
      finishedRunnerWidth - geometry.capShoulderX,
      geometry.interfaceEndY - farOuterY,
    ),
  );

  return {
    slotWidth,
    runningClearance,
    finishedRunnerWidth,
    addedWidth: finishedRunnerWidth - geometry.sourceRunnerWidth,
    length,
    thickness,
    partEnvelopeWidth: finishedRunnerWidth - geometry.interfaceEndX,
    narrowEndWidth: finishedRunnerWidth - geometry.interfaceStartX,
    wideEndWidth: finishedRunnerWidth - geometry.interfaceEndX,
    nearOuterY,
    farOuterY,
    taperAngleDegrees,
    nearEndBevelDegrees,
    farEndBevelDegrees,
    plateMarginPerEnd: (geometry.safeBuildPlateSpan - length) / 2,
  };
}

export function getMiterRunnerWedgeProfile(
  params: ModelParams,
  model: MiterRunnerWedgeModelDefinition,
) {
  const spec = getMiterRunnerWedgeSpec(params, model);
  const geometry = model.geometry;
  const sourcePoints = [
    new THREE.Vector2(geometry.interfaceStartY, geometry.interfaceStartX),
    new THREE.Vector2(spec.nearOuterY, spec.finishedRunnerWidth),
    new THREE.Vector2(spec.farOuterY, spec.finishedRunnerWidth),
    new THREE.Vector2(geometry.interfaceEndY, geometry.capShoulderX),
    new THREE.Vector2(geometry.interfaceEndY, geometry.interfaceEndX),
  ];
  const bounds = new THREE.Box2().setFromPoints(sourcePoints);
  const center = bounds.getCenter(new THREE.Vector2());
  return counterClockwise(
    sourcePoints.map((point) => point.clone().sub(center)),
  );
}

export function createMiterRunnerWedgeGeometry(
  params: ModelParams,
  model: MiterRunnerWedgeModelDefinition,
) {
  const profile = getMiterRunnerWedgeProfile(params, model);
  const spec = getMiterRunnerWedgeSpec(params, model);
  const positions: number[] = [];
  addHorizontalFace(positions, profile, 0, false);
  addPrismSides(positions, profile, 0, spec.thickness);
  addHorizontalFace(positions, profile, spec.thickness, true);

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

export function getMiterRunnerWedgeDimensions(
  params: ModelParams,
  model: MiterRunnerWedgeModelDefinition,
): ModelDimensions {
  const spec = getMiterRunnerWedgeSpec(params, model);
  return {
    length: spec.length,
    width: spec.partEnvelopeWidth,
    height: spec.thickness,
  };
}

export function updateMiterRunnerWedgeGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: MiterRunnerWedgeModelDefinition,
) {
  const dimensions = getMiterRunnerWedgeDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, 0, dimensions.height / 2);
}

export function getMiterRunnerWedgeParameterLimits(
  model: MiterRunnerWedgeModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  if (key === "runningClearance") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "miterSlotWidth") - model.geometry.sourceRunnerWidth,
    );
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getMiterRunnerWedgeAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: MiterRunnerWedgeModelDefinition,
): AuditItem {
  const spec = getMiterRunnerWedgeSpec(params, model);
  if (check.key === "fitEquation") {
    return {
      label: check.label,
      value: `${formatMiterRunnerFitLength(spec.slotWidth, unit)} slot − ${formatMiterRunnerFitLength(spec.runningClearance, unit)} clearance = ${formatMiterRunnerFitLength(spec.finishedRunnerWidth, unit)} runner`,
      status:
        spec.finishedRunnerWidth + EPSILON >= model.geometry.sourceRunnerWidth
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "sourceDatum") {
    return {
      label: check.label,
      value: `${formatMiterRunnerFitLength(model.geometry.sourceRunnerWidth, unit)} fixed Main Part · wedge adds ${formatMiterRunnerFitLength(spec.addedWidth, unit)}`,
      status: "pass",
    };
  }
  if (check.key === "preservedAngles") {
    return {
      label: check.label,
      value: `${spec.taperAngleDegrees.toFixed(3)}° taper · ${spec.nearEndBevelDegrees.toFixed(1)}° / ${spec.farEndBevelDegrees.toFixed(1)}° ends`,
      status:
        Math.abs(spec.taperAngleDegrees - model.geometry.matingTaperDegrees) <= 0.001 &&
        Math.abs(spec.nearEndBevelDegrees - model.geometry.endBevelDegrees) <= 0.01 &&
        Math.abs(spec.farEndBevelDegrees - model.geometry.endBevelDegrees) <= 0.01
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "wedgeSections") {
    return {
      label: check.label,
      value: `${formatMiterRunnerFitLength(spec.narrowEndWidth, unit)} narrow · ${formatMiterRunnerFitLength(spec.wideEndWidth, unit)} wide · ${formatMiterRunnerFitLength(spec.thickness, unit)} thick`,
      status:
        spec.narrowEndWidth + EPSILON >= model.geometry.minimumNarrowEndWidth
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "runningClearance") {
    return {
      label: check.label,
      value: `${formatMiterRunnerFitLength(spec.runningClearance, unit)} total; verify on the actual slot`,
      status:
        spec.runningClearance + EPSILON >= model.geometry.recommendedClearanceMin &&
        spec.runningClearance <= model.geometry.recommendedClearanceMax + EPSILON
          ? "pass"
          : "warn",
    };
  }
  if (check.key === "buildPlateFit") {
    return {
      label: check.label,
      value: `${formatMiterRunnerFitLength(spec.length, unit)} of ${formatMiterRunnerFitLength(model.geometry.safeBuildPlateSpan, unit)} · ${formatMiterRunnerFitLength(spec.plateMarginPerEnd, unit)} per end`,
      status: spec.plateMarginPerEnd >= -EPSILON ? "pass" : "warn",
    };
  }
  if (check.key === "sourceReference") {
    return {
      label: check.label,
      value: "Wedge.step + Main Part.step retained with SHA-256 custody",
      status: "pass",
    };
  }
  return {
    label: check.label,
    value: "Broad face on Z = 0; no supports required",
    status: "pass",
  };
}
