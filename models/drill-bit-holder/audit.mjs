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
const nearlyEqual = (actual, expected, tolerance = model.audit.toleranceMm) =>
  Math.abs(actual - expected) <= tolerance;

function analyzeStl(filePath) {
  const input = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const position = geometry.getAttribute("position");
  const edgeTriangles = new Map();
  const triangleAdjacency = Array.from(
    { length: position.count / 3 },
    () => new Set(),
  );
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerateTriangles = 0;
  let signedVolume = 0;
  const finite = Array.from(position.array).every(Number.isFinite);
  const vertexKey = (point) =>
    `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;

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
      const edge = [vertexKey(start), vertexKey(end)].sort().join("|");
      const triangles = edgeTriangles.get(edge) ?? [];
      triangles.push(triangleIndex);
      edgeTriangles.set(edge, triangles);
    }
  }

  for (const triangles of edgeTriangles.values()) {
    for (const left of triangles) {
      for (const right of triangles) {
        if (left !== right) triangleAdjacency[left].add(right);
      }
    }
  }
  const visited = new Set();
  let components = 0;
  for (let start = 0; start < triangleAdjacency.length; start += 1) {
    if (visited.has(start)) continue;
    components += 1;
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...triangleAdjacency[current]);
    }
  }

  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const nonManifoldEdges = [...edgeTriangles.values()].filter(
    (triangles) => triangles.length !== 2,
  ).length;
  geometry.dispose();
  return {
    components,
    degenerateTriangles,
    finite,
    min,
    nonManifoldEdges,
    signedVolume: Math.abs(signedVolume),
    size,
    triangles: position.count / 3,
  };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "drill-bit-holder", "model id is drill-bit-holder");
assert(model.viewer === "drill-bit-holder-v1", "viewer is supported");
assert(fs.existsSync(stlPath), "default holder STL exists");

const expectedBits = [3.175, 3.96875, 4.7625, 6.35, 7.9375, 9.525, 12.7];
assert(
  JSON.stringify(model.geometry.bitDiametersMm) === JSON.stringify(expectedBits),
  "bit set is exactly 1/8 through 1/2 inch in the requested order",
);
for (const key of [
  "bitClearance",
  "bitSpacing",
  "holderHeight",
  "holeDepth",
  "cornerRadius",
  "edgeBevel",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside limits`,
  );
}

const clearance = parameter("bitClearance").default;
const spacing = parameter("bitSpacing").default;
const height = parameter("holderHeight").default;
const holeDepth = parameter("holeDepth").default;
const bevel = parameter("edgeBevel").default;
const holeDiameters = expectedBits.map((diameter) => diameter + clearance);
const length =
  holeDiameters.reduce((sum, diameter) => sum + diameter, 0) +
  spacing * (holeDiameters.length - 1) +
  model.geometry.sideWall * 2;
const width = Math.max(...holeDiameters) + model.geometry.sideWall * 2;
const floor = height - holeDepth;
const topWeb = spacing - bevel * 2;
const topSideWall = model.geometry.sideWall - bevel * 2;

assert(clearance === 0.5, "default holes add 0.5 mm diametral clearance");
assert(spacing === 3, "default nominal hole spacing is 3 mm");
assert(nearlyEqual(length, 76.31875), "default length is derived compactly");
assert(nearlyEqual(width, 19.6), "default width is derived compactly");
assert(height === 24, "default holder height is 24 mm");
assert(holeDepth === 20, "default blind holes are 20 mm deep");
assert(
  floor >= model.geometry.minimumFloorThickness,
  "blind holes preserve the minimum floor thickness",
);
assert(
  topWeb >= model.geometry.minimumWallThickness,
  "beveled entries preserve the minimum inter-hole web",
);
assert(
  topSideWall >= model.geometry.minimumWallThickness,
  "beveled entries preserve the minimum perimeter wall",
);
assert(model.geometry.radialSegments >= 48, "holes use smooth round segmentation");
assert(model.geometry.cornerSegments >= 6, "box corners use smooth round segmentation");

if (fs.existsSync(stlPath)) {
  const info = analyzeStl(stlPath);
  assert(info.finite, "STL contains only finite coordinates");
  assert(info.degenerateTriangles === 0, "STL has no degenerate triangles");
  assert(info.nonManifoldEdges === 0, "STL has exactly two triangles per edge");
  assert(info.components === 1, "STL is one connected shell");
  assert(info.signedVolume > 0, "STL encloses non-zero volume");
  assert(info.triangles > 1500, "STL preserves smooth holes and corners");
  assert(nearlyEqual(info.size.x, length), "STL length matches the derived envelope");
  assert(nearlyEqual(info.size.y, width), "STL width matches the derived envelope");
  assert(nearlyEqual(info.size.z, height), "STL height matches the holder height");
  assert(nearlyEqual(info.min.z, 0), "STL rests on Z=0");
}

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
