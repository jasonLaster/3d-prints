import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const sourcePath = path.join(root, "models/metric-nut-knob/reference/M8.stl");
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
      const startKey = key(start);
      const endKey = key(end);
      const edge = [startKey, endKey].sort().join("|");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
      const directed = `${startKey}>${endKey}`;
      directedEdges.set(directed, (directedEdges.get(directed) ?? 0) + 1);
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
    min,
    nonManifoldEdges,
    signedVolume,
    size,
    triangles,
  };
}

console.log(`Auditing ${model.name}`);
const largeGrip = model.id === "metric-nut-knob-large-grip";
assert(model.id === "metric-nut-knob" || largeGrip, "model id is a registered metric nut knob");
if (largeGrip) {
  const original = JSON.parse(fs.readFileSync(path.join(root, "public/models/metric-nut-knob/model.json"), "utf8"));
  for (const entry of original.parameters.filter((entry) => entry.group !== "Handle" || ["handleHeight", "lobeCount"].includes(entry.key))) {
    assert(parameter(entry.key).default === entry.default, `${entry.key} is unchanged from the original knob`);
  }
}
assert(model.viewer === "metric-nut-knob-v1", "parametric viewer is registered");
assert(fs.existsSync(sourcePath), "supplied M8 source STL is retained");
assert(fs.existsSync(stlPath), "default procedural STL exists");

const sourceHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(sourcePath))
  .digest("hex");
assert(sourceHash === model.geometry.sourceSha256, "source STL SHA-256 is byte-faithful");

for (const key of [
  "knobDiameter",
  "handleHeight",
  "lobeCount",
  "lobeDepth",
  "lobeRadius",
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
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}

assert(parameter("lobeCount").default === 6, "source-matched handle has six lobes");
assert(nearlyEqual(parameter("knobDiameter").default, largeGrip ? 40 : 25.038), "tip diameter matches model target");
assert(nearlyEqual(parameter("handleHeight").default, 9.375), "handle height matches source");
assert(nearlyEqual(parameter("guardHeight").default, 7.625), "guard height matches source");
assert(nearlyEqual(parameter("guardBaseDiameter").default, 15), "guard base matches source");
assert(nearlyEqual(parameter("guardTopDiameter").default, 15), "default guard is straight");
assert(
  nearlyEqual(parameter("boltDiameter").default + parameter("boltClearance").default, 8.102),
  "default bolt bore matches measured source",
);
assert(
  nearlyEqual(parameter("nutAcrossFlats").default + parameter("nutClearance").default, 13.106),
  "default captive-nut pocket matches measured source",
);
assert(nearlyEqual(parameter("nutPocketDepth").default, 5.705), "nut-pocket depth matches source");
assert(
  parameter("handleHeight").default - parameter("nutPocketDepth").default >=
    model.geometry.minimumRoofThickness,
  "default pocket preserves minimum roof thickness",
);

const source = analyzeStl(sourcePath);
assert(source.finite, "source STL contains finite coordinates");
assert(source.degenerateTriangles === 8, "source STL's eight degenerate triangles are recorded");
assert(source.nonManifoldEdges === 4, "source STL's measured four-edge defect is recorded");
assert(nearlyEqual(source.size.x, model.geometry.sourceDimensionsMm.x), "source X envelope matches");
assert(nearlyEqual(source.size.y, model.geometry.sourceDimensionsMm.y), "source Y envelope matches");
assert(nearlyEqual(source.size.z, model.geometry.sourceDimensionsMm.z), "source Z envelope matches");

const generated = analyzeStl(stlPath);
assert(generated.finite, "procedural STL contains finite coordinates");
assert(generated.degenerateTriangles === 0, "procedural STL has no degenerate triangles");
assert(generated.nonManifoldEdges === 0, "procedural STL has exactly two triangles per edge");
assert(generated.inconsistentEdges === 0, "procedural STL winding is consistent");
assert(generated.components === 1, "procedural STL is one connected shell");
assert(generated.signedVolume > 0, "procedural STL is outward-oriented");
assert(generated.triangles > 4000, "procedural STL keeps smooth lobes and bore surfaces");
assert(nearlyEqual(generated.size.x, largeGrip ? 36.168 : model.geometry.sourceDimensionsMm.x, 0.2), "default X envelope matches model target");
assert(nearlyEqual(generated.size.y, largeGrip ? 40 : model.geometry.sourceDimensionsMm.y, 0.2), "default Y envelope matches model target");
assert(nearlyEqual(generated.size.z, model.geometry.sourceDimensionsMm.z), "default total height matches source");
assert(nearlyEqual(generated.min.z, 0), "procedural STL rests on Z = 0");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
