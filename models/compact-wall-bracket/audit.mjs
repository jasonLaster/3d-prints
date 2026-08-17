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

function parseStl(filePath) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new STLLoader().parse(arrayBuffer);
}

function analyzeStl(filePath) {
  const geometry = parseStl(filePath);
  const position = geometry.getAttribute("position");
  const edges = new Map();
  const vertexTriangles = new Map();
  const zLevels = new Set();
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
    zLevels.add(Number(a.z.toFixed(3)));
    zLevels.add(Number(b.z.toFixed(3)));
    zLevels.add(Number(c.z.toFixed(3)));
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
    zLevels: [...zLevels].sort((left, right) => left - right),
  };
}

function measureSourceDepthPlanes(filePath) {
  const geometry = parseStl(filePath);
  const position = geometry.getAttribute("position");
  const planes = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > 1e-5) continue;
    const y = Number(a.y.toFixed(4));
    const area = new THREE.Triangle(a, b, c).getArea();
    planes.set(y, (planes.get(y) ?? 0) + area);
  }
  geometry.dispose();
  const major = [...planes.entries()]
    .filter(([, area]) => area > 1000)
    .map(([y]) => y)
    .sort((left, right) => left - right);
  return {
    major,
    coreDepth: major.length === 4 ? major[2] - major[1] : Number.NaN,
    outerDepth: major.length === 4 ? major[3] - major[0] : Number.NaN,
  };
}

function rotatePoint(point, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function pairBounds(span, rise, baseThickness, gap, angle) {
  const corner = Math.min(4.5, baseThickness * 0.45, (span / 2) * 0.08);
  const diagonalRise = rise - corner;
  const gapFactor = diagonalRise / Math.hypot(diagonalRise, span / 2);
  const separation = gap / gapFactor;
  const centerOffset =
    ((span / 2) * (rise / diagonalRise) + separation) / 2;
  const upright = [
    { x: -span / 2, y: -rise / 2 + corner },
    { x: -span / 2 + corner, y: -rise / 2 },
    { x: span / 2 - corner, y: -rise / 2 },
    { x: span / 2, y: -rise / 2 + corner },
    { x: 0, y: rise / 2 },
  ];
  const points = [
    ...upright.map((point) =>
      rotatePoint({ x: point.x - centerOffset, y: point.y }, angle),
    ),
    ...upright.map((point) => {
      const opposed = rotatePoint(point, Math.PI);
      return rotatePoint(
        { x: opposed.x + centerOffset, y: opposed.y },
        angle,
      );
    }),
  ];
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const depth = Math.max(...ys) - Math.min(...ys);
  return { depth, score: Math.max(width, depth), width };
}

function optimalPairLayout(span, rise, baseThickness, gap) {
  const samples = 720;
  const step = Math.PI / 2 / samples;
  let bestAngle = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    const angle = index * step;
    const score = pairBounds(span, rise, baseThickness, gap, angle).score;
    if (score < bestScore) {
      bestAngle = angle;
      bestScore = score;
    }
  }
  let low = Math.max(0, bestAngle - step);
  let high = Math.min(Math.PI / 2, bestAngle + step);
  for (let index = 0; index < 36; index += 1) {
    const left = low + (high - low) / 3;
    const right = high - (high - low) / 3;
    if (
      pairBounds(span, rise, baseThickness, gap, left).score <
      pairBounds(span, rise, baseThickness, gap, right).score
    ) {
      high = right;
    } else {
      low = left;
    }
  }
  const angle = (low + high) / 2;
  return { angle, ...pairBounds(span, rise, baseThickness, gap, angle) };
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
  "bodyDepth",
  "braceDepth",
  "baseThickness",
  "diagonalThickness",
  "centerWebThickness",
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
assert(!parameter("rise"), "rise is derived rather than independently editable");
assert(!parameter("depth"), "uniform depth control has been removed");

assert(nearlyEqual(model.geometry.sourceSpan, 190.9188), "source span is measured");
assert(nearlyEqual(model.geometry.sourceRise, 99.9285), "source rise is measured");
assert(nearlyEqual(model.geometry.sourceDepth, 25.6), "source outer depth is measured");
assert(nearlyEqual(model.geometry.sourceCoreDepth, 8.96), "source recessed core depth is measured");
assert(model.geometry.sourceHasBoltBores === false, "source body records no bolt bores");

const sourceDepthPlanes = measureSourceDepthPlanes(sourcePath);
assert(sourceDepthPlanes.major.length === 4, "source exposes four major depth planes");
assert(nearlyEqual(sourceDepthPlanes.outerDepth, model.geometry.sourceDepth), "source face planes reproduce outer depth");
assert(nearlyEqual(sourceDepthPlanes.coreDepth, model.geometry.sourceCoreDepth), "source face planes reproduce recessed core depth");

assert(
  parameter("bodyDepth").default >= parameter("braceDepth").default,
  "base body is at least as deep as diagonal and center braces",
);
assert(
  parameter("braceDepth").default >= model.geometry.sourceCoreDepth,
  "diagonal and center depth preserves the measured recessed core",
);
assert(
  parameter("baseThickness").default >= model.geometry.sourceBaseThickness,
  "default base rail thickness is not reduced",
);
assert(
  parameter("diagonalThickness").default >= model.geometry.sourceDiagonalThickness,
  "default diagonal rail thickness is not reduced",
);
assert(
  parameter("centerWebThickness").default >= model.geometry.sourceDiagonalThickness,
  "default center web thickness is not reduced",
);

const span = parameter("span").default;
const rise = span / (model.geometry.sourceSpan / model.geometry.sourceRise);
const expectedLayout = optimalPairLayout(
  span,
  rise,
  parameter("baseThickness").default,
  parameter("pairGap").default,
);
const usablePlate =
  parameter("plateSize").default - parameter("plateEdgeMargin").default * 2;
assert(nearlyEqual(span / rise, model.geometry.sourceSpan / model.geometry.sourceRise, 1e-6), "default span and rise preserve the source ratio");
assert(expectedLayout.angle > THREE.MathUtils.degToRad(20), "two-up pair is rotated off both plate axes");
assert(expectedLayout.width < span * 2, "opposed nesting avoids a straight two-span row");
assert(expectedLayout.width <= usablePlate, "default pair fits plate width inside margins");
assert(expectedLayout.depth <= usablePlate, "default pair fits plate depth inside margins");

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
assert(nearlyEqual(single.size.x, span), "single STL span matches default");
assert(nearlyEqual(single.size.y, rise), "single STL rise matches derived proportion");
assert(nearlyEqual(single.size.z, parameter("bodyDepth").default), "single STL height matches base-body depth");
assert(single.zLevels.includes(Number(parameter("braceDepth").default.toFixed(3))), "single STL contains the diagonal and center depth step");
assert(nearlyEqual(single.min.z, 0), "single STL full lower face rests on Z=0");

const pair = analyzeStl(pairPath);
assert(pair.finite, "two-up STL contains only finite coordinates");
assert(pair.degenerateTriangles === 0, "two-up STL has no degenerate triangles");
assert(pair.nonManifoldEdges === 0, "two-up STL keeps every edge manifold");
assert(pair.components === 2, "two-up STL contains two disconnected bracket shells");
assert(nearlyEqual(pair.size.x, expectedLayout.width), "two-up STL width matches optimized rotated layout");
assert(nearlyEqual(pair.size.y, expectedLayout.depth), "two-up STL depth matches optimized rotated layout");
assert(nearlyEqual(pair.size.z, parameter("bodyDepth").default), "two-up STL height matches base-body depth");
assert(pair.zLevels.includes(Number(parameter("braceDepth").default.toFixed(3))), "two-up STL preserves both depth levels");
assert(nearlyEqual(pair.min.z, 0), "two-up STL rests on Z=0");
assert(pair.size.x <= usablePlate + model.audit.toleranceMm, "two-up STL fits usable plate width");
assert(pair.size.y <= usablePlate + model.audit.toleranceMm, "two-up STL fits usable plate depth");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
