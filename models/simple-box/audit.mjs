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
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const edgeTriangles = new Map();
  let degenerateTriangles = 0;
  let signedVolume = 0;
  const finite = Array.from(position.array).every(Number.isFinite);
  const key = (vector) =>
    `${vector.x.toFixed(4)},${vector.y.toFixed(4)},${vector.z.toFixed(4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

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
      const pair = [key(start), key(end)].sort();
      const edge = pair.join("|");
      const triangles = edgeTriangles.get(edge) ?? [];
      triangles.push(triangleIndex);
      edgeTriangles.set(edge, triangles);
    }
  }

  const adjacency = Array.from({ length: position.count / 3 }, () => new Set());
  for (const triangles of edgeTriangles.values()) {
    for (const left of triangles) {
      for (const right of triangles) {
        if (left !== right) adjacency[left].add(right);
      }
    }
  }
  const visited = new Set();
  let components = 0;
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    components += 1;
    const stack = [start];
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...adjacency[current]);
    }
  }

  const nonManifoldEdges = [...edgeTriangles.values()].filter(
    (triangles) => triangles.length !== 2,
  ).length;
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  geometry.dispose();
  return {
    components,
    degenerateTriangles,
    finite,
    nonManifoldEdges,
    signedVolume: Math.abs(signedVolume),
    size,
    min,
    triangles: position.count / 3,
  };
}

assert(model.id === "simple-box", "model id is simple-box");
assert(model.viewer === "simple-box-v1", "viewer is simple-box-v1");
assert(fs.existsSync(stlPath), "generated smooth-wall STL exists");
assert(parameter("length").default === 330.2, "default length is 13 inches");
assert(parameter("width").default === 76.2, "default width is 3 inches");
assert(parameter("height").default === 88.9, "default height is 3.5 inches");
assert(!parameter("ribRelief"), "model exposes no rib parameter");
assert(model.geometry.originalRibRelief === 0, "smooth source bypasses rib scaling");
assert(parameter("dividerCount").default === 2, "model defaults to two dividers");
assert(parameter("dividerPosition1").default === 146.05, "first divider is at 5.75 inches");
assert(parameter("dividerPosition2").default === 228.6, "second divider is at 9 inches");
assert(parameter("dividerPosition1").default < parameter("dividerPosition2").default, "default dividers are ordered");
assert(model.geometry.dividerThickness >= 1.2, "divider thickness is printable");
assert(model.geometry.dividerFloorOverlap > 0, "dividers overlap the floor for slicing");
assert(model.geometry.dividerWallInset < model.geometry.originalFloorThickness, "dividers overlap side walls for slicing");
assert(model.geometry.stackingLipThickness >= 1.2, "stacking lip thickness is printable");
assert(model.geometry.stackingLipFloorOverlap > 0, "stacking lip overlaps the floor for slicing");
assert(
  model.geometry.stackingLipWallInset === model.geometry.originalFloorThickness,
  "lip inset is derived from the box wall thickness",
);
assert(model.audit.invariants.some((value) => value.includes("free of decorative ribs")), "smooth-wall invariant is documented");
const openingLength = parameter("length").default - 2 * model.geometry.originalFloorThickness;
const openingWidth = parameter("width").default - 2 * model.geometry.originalFloorThickness;
const stackingLipLength =
  parameter("length").default -
  2 * (model.geometry.stackingLipWallInset + parameter("lipClearance").default);
const stackingLipWidth =
  parameter("width").default -
  2 * (model.geometry.stackingLipWallInset + parameter("lipClearance").default);
assert(nearlyEqual(openingLength - stackingLipLength, parameter("lipClearance").default * 2), "stacking lip length has exact two-sided clearance");
assert(nearlyEqual(openingWidth - stackingLipWidth, parameter("lipClearance").default * 2), "stacking lip width has exact two-sided clearance");
assert(stackingLipLength < openingLength && stackingLipWidth < openingWidth, "stacking lip cannot collide with receiving walls");
assert(parameter("lipHeight").default - model.geometry.stackingLipFloorOverlap >= 1, "stacking lip has positive engagement depth");
assert(parameter("lidThickness").default >= 1.2, "lid plate thickness is printable");
assert(parameter("lidSkirtHeight").default >= 1, "lid skirt has positive engagement depth");
assert(parameter("lidClearance").default > 0, "lid has positive per-side clearance");
assert(nearlyEqual(parameter("lidClearance").default, parameter("lipClearance").default), "lid and stack use the same proven fit allowance");

if (fs.existsSync(stlPath)) {
  const topology = analyzeStl(stlPath);
  assert(topology.finite, "source STL contains only finite coordinates");
  assert(topology.degenerateTriangles === 0, "source STL has no degenerate triangles");
  assert(topology.nonManifoldEdges === 0, "source STL has exactly two triangles per edge");
  assert(topology.components === 1, "source STL is one connected shell");
  assert(topology.signedVolume > 0, "source STL encloses non-zero volume");
  assert(nearlyEqual(topology.size.x, model.geometry.originalLength), "source length matches geometry contract");
  assert(nearlyEqual(topology.size.y, model.geometry.originalWidth), "source width matches geometry contract");
  assert(nearlyEqual(topology.size.z, model.geometry.originalHeight), "source height matches geometry contract");
  assert(nearlyEqual(topology.min.z, 0), "source rests on Z=0");
}

if (failed) process.exitCode = 1;
