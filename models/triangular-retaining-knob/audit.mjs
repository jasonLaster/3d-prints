import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
let failed = false;
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed = true;
};

function analyzeStl(filePath) {
  const buffer = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const position = geometry.getAttribute("position");
  const edges = new Map();
  const directedEdges = new Map();
  const vertexTriangles = new Map();
  const triangles = position.count / 3;
  const parent = Array.from({ length: triangles }, (_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const key = (vector) =>
    `${vector.x.toFixed(4)},${vector.y.toFixed(4)},${vector.z.toFixed(4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerateTriangles = 0;
  let maximumRadius = 0;
  let signedVolume = 0;

  for (let index = 0; index < position.count; index += 3) {
    const triangleIndex = index / 3;
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerateTriangles += 1;
    }
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      maximumRadius = Math.max(maximumRadius, Math.hypot(start.x, start.y));
      const startKey = key(start);
      const endKey = key(end);
      const edge = [startKey, endKey].sort().join("|");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
      directedEdges.set(
        `${startKey}>${endKey}`,
        (directedEdges.get(`${startKey}>${endKey}`) ?? 0) + 1,
      );
    }
    for (const vertex of [a, b, c]) {
      const vertexKey = key(vertex);
      const connected = vertexTriangles.get(vertexKey) ?? [];
      connected.forEach((other) => union(triangleIndex, other));
      connected.push(triangleIndex);
      vertexTriangles.set(vertexKey, connected);
    }
  }

  const inconsistentEdges = [...directedEdges.entries()].filter(
    ([edge, count]) => {
      const [start, end] = edge.split(">");
      return count !== 1 || directedEdges.get(`${end}>${start}`) !== 1;
    },
  ).length / 2;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const finite = Array.from(position.array).every(Number.isFinite);
  const nonManifoldEdges = [...edges.values()].filter((count) => count !== 2).length;
  const components = new Set(parent.map((_, index) => find(index))).size;
  geometry.dispose();
  return {
    components,
    degenerateTriangles,
    finite,
    inconsistentEdges,
    maximumRadius,
    min,
    nonManifoldEdges,
    signedVolume,
    size,
    triangles,
  };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "triangular-retaining-knob", "model id is triangular-retaining-knob");
assert(model.viewer === "metric-nut-knob-v1", "shared parametric knob viewer is registered");
assert(model.geometry.handleProfile === "rounded-triangle", "rounded-triangle handle profile is selected");
assert(fs.existsSync(stlPath), "default procedural STL exists");

for (const key of [
  "knobDiameter",
  "handleHeight",
  "triangleCornerRadius",
  "triangleSideBulge",
  "handleRoundover",
  "guardBaseDiameter",
  "guardTopDiameter",
  "guardHeight",
  "boltDiameter",
  "boltClearance",
  "nutAcrossFlats",
  "nutClearance",
  "nutPocketDepth",
  "nutLeadIn",
  "retentionInterference",
  "retentionBandHeight",
  "retentionLeadIn"
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}

const boltDiameter = parameter("boltDiameter").default;
const boreDiameter = boltDiameter + parameter("boltClearance").default;
const retentionDiameter = boltDiameter - parameter("retentionInterference").default;
assert(retentionDiameter < boltDiameter, "retention collar engages below nominal thread crest");
assert(boreDiameter > boltDiameter, "main bore retains assembly clearance");
assert(
  parameter("guardHeight").default >
    parameter("retentionBandHeight").default + parameter("retentionLeadIn").default * 2,
  "retention collar and both ramps fit inside the guard",
);
assert(
  parameter("handleHeight").default - parameter("nutPocketDepth").default >=
    model.geometry.minimumRoofThickness,
  "default pocket preserves minimum roof thickness",
);

const generated = analyzeStl(stlPath);
assert(generated.finite, "procedural STL contains finite coordinates");
assert(generated.degenerateTriangles === 0, "procedural STL has no degenerate triangles");
assert(generated.nonManifoldEdges === 0, "procedural STL has exactly two triangles per edge");
assert(generated.inconsistentEdges === 0, "procedural STL winding is consistent");
assert(generated.components === 1, "procedural STL is one connected shell");
assert(generated.signedVolume > 0, "procedural STL is outward-oriented");
assert(generated.triangles > 4000, "procedural STL keeps smooth triangle, bore, and collar surfaces");
assert(Math.abs(generated.maximumRadius * 2 - parameter("knobDiameter").default) < 0.2, "triangle tip span matches its parameter");
assert(Math.abs(generated.size.z - (parameter("handleHeight").default + parameter("guardHeight").default)) < 0.02, "default total height matches parameters");
assert(Math.abs(generated.min.z) < 0.001, "procedural STL rests on Z = 0");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
