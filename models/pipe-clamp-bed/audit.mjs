import crypto from "node:crypto";
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const sourcePath = path.join(
  root,
  "models/pipe-clamp-bed/reference/pipe-supporter.stl",
);
const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const couponPath = path.join(
  root,
  "public",
  model.fitCouponStl.url.replace(/^\/+/, ""),
);
const bundlePath = path.join(
  os.tmpdir(),
  `pipe-clamp-bed-audit-${process.pid}-${Date.now()}.mjs`,
);
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
const defaults = Object.fromEntries(
  model.parameters.map((entry) => [entry.key, entry.default]),
);
const nearlyEqual = (actual, expected, tolerance = model.audit.toleranceMm) =>
  Math.abs(actual - expected) <= tolerance;
let failed = false;
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed = true;
};

function analyzePosition(
  position,
  scale = 1,
  edgePrecision = 4,
  degenerateEpsilon = 1e-10,
) {
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
    `${vector.x.toFixed(edgePrecision)},${vector.y.toFixed(edgePrecision)},${vector.z.toFixed(edgePrecision)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const bounds = new THREE.Box3();
  let degenerateTriangles = 0;
  let signedVolume = 0;

  for (let index = 0; index < position.count; index += 3) {
    const triangleIndex = index / 3;
    a.fromBufferAttribute(position, index).multiplyScalar(scale);
    b.fromBufferAttribute(position, index + 1).multiplyScalar(scale);
    c.fromBufferAttribute(position, index + 2).multiplyScalar(scale);
    bounds.expandByPoint(a);
    bounds.expandByPoint(b);
    bounds.expandByPoint(c);
    if (
      ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <=
      degenerateEpsilon
    ) {
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
  return {
    components: new Set(parent.map((_, index) => find(index))).size,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    inconsistentEdges,
    min: bounds.min.clone(),
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    signedVolume,
    size: bounds.getSize(new THREE.Vector3()),
    triangles,
  };
}

function analyzeStl(
  filePath,
  scale = 1,
  edgePrecision = 4,
  degenerateEpsilon = 1e-10,
) {
  const buffer = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  const result = analyzePosition(
    geometry.getAttribute("position"),
    scale,
    edgePrecision,
    degenerateEpsilon,
  );
  geometry.dispose();
  return result;
}

function analyzeGeometry(geometry) {
  const result = analyzePosition(geometry.getAttribute("position"));
  geometry.dispose();
  return result;
}

function assertPrintableMesh(result, label) {
  assert(result.finite, `${label} contains finite coordinates`);
  assert(result.degenerateTriangles === 0, `${label} has no degenerate triangles`);
  assert(result.nonManifoldEdges === 0, `${label} has exactly two triangles per edge`);
  assert(result.inconsistentEdges === 0, `${label} winding is consistent`);
  assert(result.components === 1, `${label} is one connected shell`);
  assert(result.signedVolume > 0, `${label} is outward-oriented`);
}

console.log(`Auditing ${model.name}`);
assert(model.id === "pipe-clamp-bed", "model id is pipe-clamp-bed");
assert(model.viewer === "pipe-clamp-bed-v1", "parametric viewer is registered");
assert(fs.existsSync(sourcePath), "supplied pipe-supporter source STL is retained");
assert(fs.existsSync(stlPath), "default procedural bed STL exists");
assert(fs.existsSync(couponPath), "default fit-coupon STL exists");

const sourceHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(sourcePath))
  .digest("hex");
assert(sourceHash === model.geometry.sourceSha256, "source STL SHA-256 is byte-faithful");

for (const key of [
  "bedLength",
  "bedWidth",
  "bedThickness",
  "workpieceThickness",
  "pipeDiameter",
  "pipeClearance",
  "crownCapThickness",
  "hookWidth",
  "hookWallThickness",
  "hookUndercut",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}

assert(nearlyEqual(defaults.bedLength, 177.8), "default bed length is 7 inches");
assert(nearlyEqual(defaults.bedWidth, 38.1), "default bed width is 1.5 inches");
assert(nearlyEqual(defaults.hookWidth, 25.4), "each default end clip is 1 inch wide");
assert(nearlyEqual(defaults.pipeDiameter, 26.67), "default pipe OD is 1.050 inches");
assert(nearlyEqual(defaults.pipeClearance, 0.8), "default total pipe clearance is 0.8 mm");
assert(nearlyEqual(defaults.crownCapThickness, 1.2), "default fitted-pipe crown cap is 1.2 mm");
assert(nearlyEqual(defaults.hookWallThickness, 3), "default clip wall is 3.0 mm");
assert(nearlyEqual(defaults.hookUndercut, 1.2), "default clip retention is 1.2 mm per side");

const source = analyzeStl(
  sourcePath,
  model.geometry.sourceScaleToMm,
  2,
  1e-6,
);
assert(source.finite, "source STL contains finite coordinates");
assert(
  source.degenerateTriangles === model.geometry.sourceDegenerateTriangles,
  "source STL's 37 degenerate triangles are recorded",
);
assert(
  source.nonManifoldEdges === model.geometry.sourceNonManifoldEdges,
  "source STL's 58 non-manifold edges are recorded",
);
assert(nearlyEqual(source.size.x, model.geometry.sourceDimensionsMm.x), "source X envelope matches");
assert(nearlyEqual(source.size.y, model.geometry.sourceDimensionsMm.y), "source Y envelope matches");
assert(nearlyEqual(source.size.z, model.geometry.sourceDimensionsMm.z), "source Z envelope matches");

await build({
  bundle: true,
  entryPoints: [path.join(root, "src/models/pipeClampBed.ts")],
  format: "esm",
  outfile: bundlePath,
  platform: "node",
});

try {
  const geometryModule = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const defaultSpec = geometryModule.getPipeClampBedSpec(defaults);
  assert(nearlyEqual(defaultSpec.surfaceLiftAboveCrown, 1.6), "default support is 1.6 mm above the nominal pipe crown");
  assert(nearlyEqual(defaultSpec.workpieceCenterZ, 27.635), "1-inch stock center is 27.635 mm above the pipe axis");
  assert(nearlyEqual(defaultSpec.hookOpeningWidth, 25.07), "default easy-release opening is 25.07 mm");
  assert(nearlyEqual(defaultSpec.requiredSnapDeflectionPerSide, 0.8), "default pipe requires 0.8 mm clip expansion per side");
  assert(nearlyEqual(defaultSpec.centerBridge, 127), "default center bridge remains 127 mm long");

  const scenarios = [
    { name: "default assembly", params: defaults },
    {
      name: "loose fit",
      params: { ...defaults, pipeClearance: 1.2, hookUndercut: 1.0 },
    },
    {
      name: "larger pipe",
      params: {
        ...defaults,
        bedWidth: 45,
        bedThickness: 7.5,
        pipeDiameter: 33.4,
        pipeClearance: 1,
        crownCapThickness: 1.4,
        hookUndercut: 1.4,
      },
    },
    {
      name: "stronger retention",
      params: {
        ...defaults,
        bedWidth: 40,
        hookWallThickness: 3.5,
        hookUndercut: 2.5,
      },
    },
  ];
  for (const scenario of scenarios) {
    assertPrintableMesh(
      analyzeGeometry(
        geometryModule.createPipeClampBedGeometry(scenario.params, model),
      ),
      scenario.name,
    );
  }

  const printGeometry = analyzeGeometry(
    geometryModule.createPipeClampBedPrintGeometry(defaults, model),
  );
  assertPrintableMesh(printGeometry, "default print geometry");
  assert(nearlyEqual(printGeometry.min.z, 0), "default print geometry rests at Z = 0");

  const couponGeometry = analyzeGeometry(
    geometryModule.createPipeClampBedFitCouponGeometry(defaults, model),
  );
  assertPrintableMesh(couponGeometry, "default fit coupon geometry");
  assert(nearlyEqual(couponGeometry.min.z, 0), "fit coupon rests at Z = 0");
} finally {
  fs.rmSync(bundlePath, { force: true });
}

const generated = analyzeStl(stlPath);
assertPrintableMesh(generated, "checked-in default STL");
assert(nearlyEqual(generated.size.x, defaults.bedLength), "default STL length matches the bed");
assert(nearlyEqual(generated.size.y, defaults.bedWidth), "default STL width matches the bed");
assert(nearlyEqual(generated.min.z, 0), "default STL support face rests at Z = 0");
assert(generated.size.x <= 250 + model.audit.toleranceMm, "default STL fits a 250 mm build span");

const coupon = analyzeStl(couponPath);
assertPrintableMesh(coupon, "checked-in fit coupon STL");
assert(nearlyEqual(coupon.size.x, defaults.hookWidth), "fit coupon width matches one end clip");
assert(nearlyEqual(coupon.size.y, defaults.bedWidth), "fit coupon keeps the full bed width");
assert(nearlyEqual(coupon.min.z, 0), "fit coupon support face rests at Z = 0");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
