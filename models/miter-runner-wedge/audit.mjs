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
const wedgeStepPath = path.join(
  root,
  "models/miter-runner-wedge/reference/Wedge.step",
);
const mainPartStepPath = path.join(
  root,
  "models/miter-runner-wedge/reference/Main Part.step",
);
const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const bundlePath = path.join(
  os.tmpdir(),
  `miter-runner-wedge-audit-${process.pid}-${Date.now()}.mjs`,
);
const defaults = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
const nearlyEqual = (actual, expected, tolerance = model.audit.toleranceMm) =>
  Math.abs(actual - expected) <= tolerance;
let failed = false;
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed = true;
};

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readStepSolidBounds(filePath, scale) {
  const step = fs.readFileSync(filePath, "utf8").replace(/\r?\n/g, " ");
  const entities = new Map(
    [...step.matchAll(/#(\d+)\s*=\s*([^;]+);/g)].map((match) => [
      Number(match[1]),
      match[2].trim(),
    ]),
  );
  const points = new Map();
  const vertices = new Map();
  const referencedVertexIds = new Set();
  for (const [id, value] of entities) {
    let match = value.match(/^CARTESIAN_POINT\('',\(([^)]+)\)\)/);
    if (match) {
      points.set(
        id,
        match[1].split(",").map(Number).map((number) => number * scale),
      );
      continue;
    }
    match = value.match(/^VERTEX_POINT\('',#(\d+)\)/);
    if (match) vertices.set(id, Number(match[1]));
  }
  for (const value of entities.values()) {
    const match = value.match(/^EDGE_CURVE\('',#(\d+),#(\d+),/);
    if (!match) continue;
    referencedVertexIds.add(Number(match[1]));
    referencedVertexIds.add(Number(match[2]));
  }
  const coordinates = [...referencedVertexIds]
    .map((id) => points.get(vertices.get(id)))
    .filter(Boolean);
  const min = [0, 1, 2].map((axis) =>
    Math.min(...coordinates.map((point) => point[axis])),
  );
  const max = [0, 1, 2].map((axis) =>
    Math.max(...coordinates.map((point) => point[axis])),
  );
  return max.map((value, axis) => value - min[axis]);
}

function analyzePosition(position) {
  const edges = new Map();
  const directedEdges = new Map();
  const bounds = new THREE.Box3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerateTriangles = 0;
  let signedVolume = 0;
  const key = (vector) =>
    `${vector.x.toFixed(4)},${vector.y.toFixed(4)},${vector.z.toFixed(4)}`;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    bounds.expandByPoint(a);
    bounds.expandByPoint(b);
    bounds.expandByPoint(c);
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
  }
  return {
    bounds,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    inconsistentEdges:
      [...directedEdges.entries()].filter(([edge, count]) => {
        const [start, end] = edge.split(">");
        return count !== 1 || directedEdges.get(`${end}>${start}`) !== 1;
      }).length / 2,
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    signedVolume,
    size: bounds.getSize(new THREE.Vector3()),
    triangles: position.count / 3,
  };
}

function analyzeGeometry(geometry) {
  const result = analyzePosition(geometry.getAttribute("position"));
  geometry.dispose();
  return result;
}

function analyzeStl(filePath) {
  const bytes = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return analyzeGeometry(geometry);
}

function assertPrintable(result, label) {
  assert(result.finite, `${label} contains finite coordinates`);
  assert(result.degenerateTriangles === 0, `${label} has no degenerate triangles`);
  assert(result.nonManifoldEdges === 0, `${label} has exactly two triangles per edge`);
  assert(result.inconsistentEdges === 0, `${label} winding is consistent`);
  assert(result.signedVolume > 0, `${label} is outward-oriented`);
  assert(nearlyEqual(result.bounds.min.z, 0), `${label} rests at Z = 0`);
}

console.log(`Auditing ${model.name}`);
assert(model.id === "miter-runner-wedge", "model id is miter-runner-wedge");
assert(model.viewer === "miter-runner-wedge-v1", "parametric viewer is registered");
assert(fs.existsSync(wedgeStepPath), "Wedge.step reference is retained");
assert(fs.existsSync(mainPartStepPath), "Main Part.step reference is retained");
assert(fs.existsSync(stlPath), "default procedural STL exists");
assert(
  sha256(wedgeStepPath) === model.geometry.sourceWedgeSha256,
  "Wedge.step SHA-256 is byte-faithful",
);
assert(
  sha256(mainPartStepPath) === model.geometry.sourceMainPartSha256,
  "Main Part.step SHA-256 is byte-faithful",
);

const wedgeBounds = readStepSolidBounds(
  wedgeStepPath,
  model.geometry.sourceScaleToMm,
);
const mainPartBounds = readStepSolidBounds(
  mainPartStepPath,
  model.geometry.sourceScaleToMm,
);
for (const [index, axis] of ["x", "y", "z"].entries()) {
  assert(
    nearlyEqual(wedgeBounds[index], model.geometry.sourceWedgeDimensionsMm[axis]),
    `Wedge.step ${axis.toUpperCase()} envelope matches`,
  );
  assert(
    nearlyEqual(mainPartBounds[index], model.geometry.sourceMainPartDimensionsMm[axis]),
    `Main Part.step ${axis.toUpperCase()} envelope matches`,
  );
}

for (const key of ["miterSlotWidth", "runningClearance"]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}

await build({
  bundle: true,
  entryPoints: [path.join(root, "src/models/miterRunnerWedge.ts")],
  format: "esm",
  outfile: bundlePath,
  platform: "node",
});

try {
  const geometryModule = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const defaultSpec = geometryModule.getMiterRunnerWedgeSpec(defaults, model);
  assert(nearlyEqual(defaultSpec.slotWidth, 19.05), "default slot is 19.05 mm (3/4 inch)");
  assert(nearlyEqual(defaultSpec.runningClearance, 0.25), "default total clearance is 0.25 mm");
  assert(nearlyEqual(defaultSpec.finishedRunnerWidth, 18.8), "default reproduces the source 18.8 mm runner width");
  assert(nearlyEqual(defaultSpec.addedWidth, 0), "default keeps the source outside face");
  assert(nearlyEqual(defaultSpec.length, 240.084127), "source wedge length is preserved");
  assert(nearlyEqual(defaultSpec.thickness, 5.5), "source wedge thickness is preserved");
  assert(nearlyEqual(defaultSpec.taperAngleDegrees, 1, 0.001), "working taper remains 1.000 degrees");
  assert(nearlyEqual(defaultSpec.nearEndBevelDegrees, 40, 0.001), "near end bevel remains 40.0 degrees");
  assert(nearlyEqual(defaultSpec.farEndBevelDegrees, 40, 0.001), "far end bevel remains 40.0 degrees");
  assert(defaultSpec.plateMarginPerEnd > 4.9, "source length leaves more than 4.9 mm per end on a 250 mm span");

  const scenarios = [
    { name: "source-width default", params: defaults },
    {
      name: "0.10 mm clearance",
      params: { ...defaults, runningClearance: 0.1 },
    },
    {
      name: "19.5 mm finished runner",
      params: { ...defaults, miterSlotWidth: 19.7, runningClearance: 0.2 },
    },
    {
      name: "maximum finished runner",
      params: { ...defaults, miterSlotWidth: 20.5, runningClearance: 0 },
    },
  ];
  for (const scenario of scenarios) {
    const spec = geometryModule.getMiterRunnerWedgeSpec(scenario.params, model);
    assert(nearlyEqual(spec.taperAngleDegrees, 1, 0.001), `${scenario.name} preserves the 1 degree taper`);
    assert(nearlyEqual(spec.nearEndBevelDegrees, 40, 0.001), `${scenario.name} preserves the near 40 degree bevel`);
    assert(nearlyEqual(spec.farEndBevelDegrees, 40, 0.001), `${scenario.name} preserves the far 40 degree bevel`);
    assert(spec.finishedRunnerWidth >= model.geometry.sourceRunnerWidth, `${scenario.name} does not undercut the fixed Main Part`);
    assertPrintable(
      analyzeGeometry(
        geometryModule.createMiterRunnerWedgeGeometry(scenario.params, model),
      ),
      scenario.name,
    );
  }

  const slotLimits = geometryModule.getMiterRunnerWedgeParameterLimits(
    model,
    defaults,
    "miterSlotWidth",
  );
  const clearanceLimits = geometryModule.getMiterRunnerWedgeParameterLimits(
    model,
    defaults,
    "runningClearance",
  );
  assert(nearlyEqual(slotLimits.min, 18.8), "slot remains editable down to the fixed Main Part width");
  assert(nearlyEqual(clearanceLimits.max, 0.25), "clearance maximum cannot make the runner narrower than the Main Part");
} finally {
  fs.rmSync(bundlePath, { force: true });
}

const generated = analyzeStl(stlPath);
assertPrintable(generated, "checked-in default STL");
assert(nearlyEqual(generated.size.x, model.geometry.sourceWedgeDimensionsMm.y), "default STL length matches Wedge.step");
assert(nearlyEqual(generated.size.y, model.geometry.sourceWedgeDimensionsMm.x), "default STL width matches Wedge.step");
assert(nearlyEqual(generated.size.z, model.geometry.sourceWedgeDimensionsMm.z), "default STL thickness matches Wedge.step");
assert(generated.size.x <= model.geometry.safeBuildPlateSpan, "default STL fits the safe 250 mm span");

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
