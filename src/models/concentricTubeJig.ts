import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  ConcentricTubeJigModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;

type Point = THREE.Vector2;

function ring(radius: number, segments: number) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function addTriangle(positions: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addRingSide(positions: number[], contour: Point[], bottom: number, top: number) {
  for (let index = 0; index < contour.length; index += 1) {
    const next = (index + 1) % contour.length;
    const a = new THREE.Vector3(contour[index].x, contour[index].y, bottom);
    const b = new THREE.Vector3(contour[next].x, contour[next].y, bottom);
    const c = new THREE.Vector3(contour[next].x, contour[next].y, top);
    const d = new THREE.Vector3(contour[index].x, contour[index].y, top);
    addTriangle(positions, a, b, c);
    addTriangle(positions, a, c, d);
  }
}

function addAnnulus(positions: number[], outer: Point[], inner: Point[], z: number, upward: boolean) {
  const triangles = THREE.ShapeUtils.triangulateShape(
    outer.map((point) => point.clone()),
    [inner.slice().reverse().map((point) => point.clone())],
  );
  const points = [...outer, ...inner.slice().reverse()];
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a2 = points[aIndex];
    const b2 = points[bIndex];
    const c2 = points[cIndex];
    const cross = (b2.x - a2.x) * (c2.y - a2.y) - (b2.y - a2.y) * (c2.x - a2.x);
    const a = new THREE.Vector3(a2.x, a2.y, z);
    const b = new THREE.Vector3(b2.x, b2.y, z);
    const c = new THREE.Vector3(c2.x, c2.y, z);
    if ((cross > 0) === upward) addTriangle(positions, a, b, c);
    else addTriangle(positions, a, c, b);
  }
}

function flipForPrintBed(positions: number[], totalHeight: number) {
  for (let index = 0; index < positions.length; index += 9) {
    positions[index + 2] = totalHeight - positions[index + 2];
    positions[index + 5] = totalHeight - positions[index + 5];
    positions[index + 8] = totalHeight - positions[index + 8];
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      const secondVertex = index + 3 + coordinate;
      const thirdVertex = index + 6 + coordinate;
      [positions[secondVertex], positions[thirdVertex]] = [
        positions[thirdVertex],
        positions[secondVertex],
      ];
    }
  }
}

export function createConcentricTubeJigGeometry(params: ModelParams, model: ConcentricTubeJigModelDefinition) {
  const firstDiameter = getParam(params, "firstDiameter");
  const increment = getParam(params, "increment");
  const tubeHeight = getParam(params, "tubeHeight");
  const tubeCount = model.geometry.tubeCount;
  const boreDiameter = getParam(params, "boreDiameter");
  const inner = ring(boreDiameter / 2, model.geometry.radialSegments);
  const outerRings = Array.from({ length: tubeCount }, (_, index) =>
    ring((firstDiameter + index * increment) / 2, model.geometry.radialSegments));
  const positions: number[] = [];

  addRingSide(positions, inner.slice().reverse(), 0, tubeCount * tubeHeight);
  outerRings.forEach((outer, index) => {
    const bottom = index * tubeHeight;
    const top = bottom + tubeHeight;
    addRingSide(positions, outer, bottom, top);
    if (index === 0) addAnnulus(positions, outer, inner, bottom, false);
    if (index === tubeCount - 1) addAnnulus(positions, outer, inner, top, true);
    if (index > 0) addAnnulus(positions, outer, outerRings[index - 1], bottom, true);
  });
  flipForPrintBed(positions, tubeCount * tubeHeight);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getConcentricTubeJigDimensions(
  params: ModelParams,
  model: ConcentricTubeJigModelDefinition,
): ModelDimensions {
  const finalDiameter = getParam(params, "firstDiameter") +
    (model.geometry.tubeCount - 1) * getParam(params, "increment");
  return {
    length: finalDiameter,
    width: finalDiameter,
    height: getParam(params, "tubeHeight") * model.geometry.tubeCount,
  };
}

export function updateConcentricTubeJigGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: ConcentricTubeJigModelDefinition,
) {
  const dimensions = getConcentricTubeJigDimensions(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.CylinderGeometry(
    dimensions.length / 2,
    dimensions.length / 2,
    dimensions.height,
    64,
    1,
    true,
  );
  mesh.position.z = dimensions.height / 2;
}

export function getConcentricTubeJigParameterLimits(
  model: ConcentricTubeJigModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  if (key === "boreDiameter") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "firstDiameter") - model.geometry.minimumWallThickness * 2,
    );
  }
  if (key === "firstDiameter") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "boreDiameter") + model.geometry.minimumWallThickness * 2,
    );
  }
  return limits;
}

export function getConcentricTubeJigAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: ConcentricTubeJigModelDefinition,
): AuditItem {
  const first = getParam(params, "firstDiameter");
  const increment = getParam(params, "increment");
  const count = model.geometry.tubeCount;
  const height = getParam(params, "tubeHeight");
  const bore = getParam(params, "boreDiameter");
  const last = first + (count - 1) * increment;
  const wall = (first - bore) / 2;
  const pass = (value: string): AuditItem => ({ label: check.label, value, status: "pass" });
  const warn = (value: string): AuditItem => ({ label: check.label, value, status: "warn" });
  switch (check.key) {
    case "tubeRange": return pass(`${formatLength(first, unit)} Ø to ${formatLength(last, unit)} Ø`);
    case "tubeIncrements": return Math.abs(increment - 1.5875) < EPSILON
      ? pass(`${count} tubes at ${formatLength(increment, unit)} steps`)
      : warn(`${count} tubes at ${formatLength(increment, unit)} steps`);
    case "tubeHeight": return pass(`${formatLength(height, unit)} per tube; ${formatLength(height * count, unit)} overall`);
    case "tubeBore": return pass(`${formatLength(bore, unit)} through-bore`);
    case "minimumWall": return wall >= model.geometry.minimumWallThickness
      ? pass(formatLength(wall, unit))
      : warn(`${formatLength(wall, unit)} minimum wall`);
    default: return warn("Unsupported audit check");
  }
}
