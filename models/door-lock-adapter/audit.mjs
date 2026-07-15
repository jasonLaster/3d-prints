import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
const nearlyEqual = (actual, expected, tolerance = model.audit.toleranceMm) =>
  Math.abs(actual - expected) <= tolerance;
let failed = false;
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed = true;
};

function analyzeStl(filePath) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const position = geometry.getAttribute("position");
  const edges = new Map();
  const key = (vector) =>
    `${vector.x.toFixed(4)},${vector.y.toFixed(4)},${vector.z.toFixed(4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerateTriangles = 0;

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerateTriangles += 1;
    }
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const edge = [key(start), key(end)].sort().join("|");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }

  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const finite = Array.from(position.array).every(Number.isFinite);
  const nonManifoldEdges = [...edges.values()].filter((count) => count !== 2).length;
  const triangles = position.count / 3;
  geometry.dispose();
  return { degenerateTriangles, finite, min, nonManifoldEdges, size, triangles };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "door-lock-adapter", "model id is door-lock-adapter");
assert(model.viewer === "door-lock-adapter-v1", "viewer is supported");
assert(fs.existsSync(stlPath), "default adapter STL exists");

for (const key of [
  "tubeDiameter",
  "tubeLength",
  "boxWidth",
  "boxLength",
  "notchHeight",
  "notchWidth",
  "notchLength",
  "cutoutWidth",
  "cutoutLength",
  "cutoutRotation",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its limits`,
  );
}

assert(parameter("boxWidth").default >= parameter("tubeDiameter").default, "box collar wraps the tube");
assert(parameter("boxLength").default <= parameter("tubeLength").default, "box length fits on the tube");
assert(parameter("notchLength").default <= parameter("boxLength").default, "notch length fits on the box");
assert(parameter("notchWidth").default === 4, "notch width defaults to 4 mm");
assert(parameter("notchWidth").default <= parameter("boxWidth").default, "notch width fits on the box face");
const radialWall =
  parameter("tubeDiameter").default / 2 -
  Math.hypot(
    parameter("cutoutWidth").default / 2,
    parameter("cutoutLength").default / 2,
  );
assert(radialWall >= model.geometry.minimumWallThickness, "rectangular slot preserves minimum radial wall");
assert(parameter("cutoutRotation").default === 90, "rectangular slot defaults perpendicular to the keyed face");
assert(model.geometry.radialSegments >= 32, "tube has a print-quality radial segment count");

if (fs.existsSync(stlPath)) {
  const topology = analyzeStl(stlPath);
  assert(topology.finite, "STL contains only finite coordinates");
  assert(topology.degenerateTriangles === 0, "STL has no degenerate triangles");
  assert(topology.nonManifoldEdges === 0, "STL has exactly two triangles per edge");
  assert(topology.triangles > 200, "STL has enough detail for the round tube");
  assert(nearlyEqual(topology.size.x, parameter("boxWidth").default), "STL width matches box width");
  assert(
    nearlyEqual(
      topology.size.y,
      parameter("boxWidth").default + parameter("notchHeight").default,
    ),
    "STL depth includes the triangular ridge",
  );
  assert(nearlyEqual(topology.size.z, parameter("tubeLength").default), "STL length matches tube length");
  assert(nearlyEqual(topology.min.z, 0), "STL rests on Z=0");
}

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
