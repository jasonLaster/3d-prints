import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const sourcePath = path.join(
  root,
  "models/compact-wall-bracket/reference/obj_4_Corpo_04_(2).stl",
);
const singlePath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const pairPath = path.join(
  root,
  "public",
  model.twoUpStl.url.replace(/^\/+/, ""),
);
const parameter = (key) =>
  model.parameters.find((entry) => entry.key === key);
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
  const vertexTriangles = new Map();
  const key = (vector) =>
    `${vector.x.toFixed(4)},${vector.y.toFixed(4)},${vector.z.toFixed(4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerateTriangles = 0;
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
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let index = 0; index < position.count; index += 3) {
    const triangleIndex = index / 3;
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerateTriangles += 1;
    }
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const edge = [key(start), key(end)].sort().join("|");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    for (const vertex of [a, b, c]) {
      const vertexKey = key(vertex);
      const connected = vertexTriangles.get(vertexKey) ?? [];
      connected.forEach((other) => union(triangleIndex, other));
      connected.push(triangleIndex);
      vertexTriangles.set(vertexKey, connected);
    }
  }

  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const finite = Array.from(position.array).every(Number.isFinite);
  const nonManifoldEdges = [...edges.values()].filter(
    (count) => count !== 2,
  ).length;
  const components = new Set(parent.map((_, index) => find(index))).size;
  geometry.dispose();
  return {
    components,
    degenerateTriangles,
    finite,
    min,
    nonManifoldEdges,
    size,
    triangles,
  };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "compact-wall-bracket", "model id is compact-wall-bracket");
assert(
  model.viewer === "compact-wall-bracket-v1",
  "compact wall-bracket viewer is registered",
);
assert(fs.existsSync(sourcePath), "byte-faithful supplied source STL is retained");
assert(fs.existsSync(singlePath), "default single-bracket STL exists");
assert(fs.existsSync(pairPath), "default two-up STL exists");

const sourceHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(sourcePath))
  .digest("hex");
assert(
  sourceHash ===
    "0918436addeaa74ceaf597297ec8b0deef42806d7fd019e7ff0498d7de1234ec",
  "source STL SHA-256 matches the supplied file",
);

for (const key of [
  "span",
  "rise",
  "depth",
  "baseThickness",
  "diagonalThickness",
  "centerWebThickness",
  "edgeChamfer",
  "plateSize",
  "plateEdgeMargin",
  "pairGap",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}

assert(nearlyEqual(model.geometry.sourceSpan, 190.9188), "source span is measured");
assert(nearlyEqual(model.geometry.sourceRise, 99.9285), "source rise is measured");
assert(nearlyEqual(model.geometry.sourceDepth, 25.6), "source depth is measured");
assert(model.geometry.sourceHasBoltBores === false, "source body records no bolt bores");
assert(
  parameter("depth").default >= model.geometry.sourceDepth,
  "default depth is not reduced",
);
assert(
  parameter("baseThickness").default >= model.geometry.sourceBaseThickness,
  "default base rail is not reduced",
);
assert(
  parameter("diagonalThickness").default >=
    model.geometry.sourceDiagonalThickness,
  "default diagonal rail is not reduced",
);
assert(
  parameter("centerWebThickness").default >=
    model.geometry.sourceDiagonalThickness,
  "default center web is at least the source diagonal thickness",
);

const expectedPairWidth =
  parameter("span").default * 2 + parameter("pairGap").default;
const usablePlate =
  parameter("plateSize").default - parameter("plateEdgeMargin").default * 2;
assert(expectedPairWidth <= usablePlate, "default pair fits plate width inside margins");
assert(
  parameter("rise").default <= usablePlate,
  "default pair fits plate depth inside margins",
);

const source = analyzeStl(sourcePath);
assert(source.finite, "source STL contains only finite coordinates");
assert(source.degenerateTriangles === 0, "source STL has no degenerate triangles");
assert(source.nonManifoldEdges === 0, "source STL is manifold");
assert(nearlyEqual(source.size.x, model.geometry.sourceSpan), "source STL span matches measurement");
assert(nearlyEqual(source.size.y, model.geometry.sourceDepth), "source STL depth matches measurement");
assert(nearlyEqual(source.size.z, model.geometry.sourceRise), "source STL rise matches measurement");

const single = analyzeStl(singlePath);
assert(single.finite, "single STL contains only finite coordinates");
assert(single.degenerateTriangles === 0, "single STL has no degenerate triangles");
assert(single.nonManifoldEdges === 0, "single STL is manifold");
assert(single.components === 1, "single STL has one connected shell");
assert(nearlyEqual(single.size.x, parameter("span").default), "single STL span matches default");
assert(nearlyEqual(single.size.y, parameter("rise").default), "single STL rise matches default");
assert(nearlyEqual(single.size.z, parameter("depth").default), "single STL depth matches default");
assert(nearlyEqual(single.min.z, 0), "single STL broad face rests on Z=0");

const pair = analyzeStl(pairPath);
assert(pair.finite, "two-up STL contains only finite coordinates");
assert(pair.degenerateTriangles === 0, "two-up STL has no degenerate triangles");
assert(pair.nonManifoldEdges === 0, "two-up STL keeps every edge manifold");
assert(pair.components === 2, "two-up STL contains two disconnected bracket shells");
assert(nearlyEqual(pair.size.x, expectedPairWidth), "two-up STL width includes the requested gap");
assert(nearlyEqual(pair.size.y, parameter("rise").default), "two-up STL depth matches the bracket rise");
assert(nearlyEqual(pair.size.z, parameter("depth").default), "two-up STL height preserves body depth");
assert(nearlyEqual(pair.min.z, 0), "two-up STL rests on Z=0");
assert(pair.size.x <= usablePlate + model.audit.toleranceMm, "two-up STL fits usable plate width");
assert(pair.size.y <= usablePlate + model.audit.toleranceMm, "two-up STL fits usable plate depth");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
