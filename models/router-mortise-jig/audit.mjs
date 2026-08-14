import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const parameter = (key) =>
  model.parameters.find((entry) => entry.key === key);
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) process.exitCode = 1;
};

function stlInfo(filePath) {
  const input = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerate = 0;
  const vertexKey = (index) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerate += 1;
    }
    for (const [start, end] of [
      [vertexKey(index), vertexKey(index + 1)],
      [vertexKey(index + 1), vertexKey(index + 2)],
      [vertexKey(index + 2), vertexKey(index)],
    ]) {
      const edge = start < end ? `${start}|${end}` : `${end}|${start}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const finite = Array.from(position.array).every(Number.isFinite);
  const nonManifoldEdges = [...edges.values()].filter((count) => count !== 2).length;
  geometry.dispose();
  return {
    degenerate,
    finite,
    min,
    nonManifoldEdges,
    size,
    triangles: position.count / 3,
  };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "router-mortise-jig", "model id is router-mortise-jig");
assert(model.viewer === "router-mortise-jig-v1", "viewer is supported");
assert(model.parts.length === 3, "three individual printable parts are registered");
assert(model.presets.length === 4, "four common mortise presets are registered");
assert(
  model.geometry.presetWorkpieceWidthsMm.join(",") === "38,50,64,76",
  "38, 50, 64, and 76 mm stock witness marks are defined",
);

for (const key of [
  "mortiseWidth",
  "mortiseLength",
  "routerBitDiameter",
  "guideBushingDiameter",
  "templateWiggle",
  "workpieceWidth",
  "stockThickness",
  "workpieceWiggle",
  "plateThickness",
  "jawDepth",
  "insertPocketDiameter",
  "insertDepth",
  "routerBaseDiameter",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside limits`,
  );
}

const mortiseWidth = parameter("mortiseWidth").default;
const mortiseLength = parameter("mortiseLength").default;
const bit = parameter("routerBitDiameter").default;
const bushing = parameter("guideBushingDiameter").default;
const wiggle = parameter("templateWiggle").default;
const openingWidth = mortiseWidth + bushing - bit + wiggle;
const openingLength = mortiseLength + bushing - bit + wiggle;
const insertDiameter = parameter("insertPocketDiameter").default;
const insertDepth = parameter("insertDepth").default;
const jawDepth = parameter("jawDepth").default;

assert(mortiseWidth === 8 && mortiseLength === 30, "default mortise is 8 × 30 mm");
assert(bit === 6 && bushing === 16, "default cutter and guide bushing are 6 and 16 mm");
assert(Math.abs(openingWidth - 18.25) < 1e-8, "default guide opening width is 18.25 mm");
assert(Math.abs(openingLength - 40.25) < 1e-8, "default guide opening length is 40.25 mm");
assert(bit <= mortiseWidth, "cutter does not exceed mortise width");
assert(
  (bushing - bit) / 2 >= model.geometry.minimumBushingRadialClearance,
  "guide bushing preserves radial cutter clearance",
);
assert(
  (model.geometry.jawThickness - insertDiameter) / 2 >=
    model.geometry.minimumInsertSideWall,
  "M5 insert pockets preserve side walls",
);
assert(
  jawDepth - insertDepth >= model.geometry.minimumInsertFloor,
  "M5 insert pockets preserve a closed floor",
);

for (const part of model.parts) {
  const filePath = path.join(root, "public", part.url.replace(/^\/+/, ""));
  assert(fs.existsSync(filePath), `${part.label} STL exists`);
  if (!fs.existsSync(filePath)) continue;
  const info = stlInfo(filePath);
  assert(info.finite, `${part.label} STL contains only finite coordinates`);
  assert(info.degenerate === 0, `${part.label} STL has no degenerate triangles`);
  assert(info.nonManifoldEdges === 0, `${part.label} STL is watertight and manifold`);
  assert(Math.abs(info.min.z) <= model.audit.toleranceMm, `${part.label} rests on Z=0`);
  if (part.key === "guide-plate") {
    assert(
      Math.abs(info.size.x - model.geometry.plateLength) <= model.audit.toleranceMm,
      "guide plate length matches the configured envelope",
    );
    assert(
      Math.abs(info.size.y - model.geometry.plateWidth) <= model.audit.toleranceMm,
      "guide plate width matches the configured envelope",
    );
    assert(
      Math.abs(info.size.z - parameter("plateThickness").default) <=
        model.audit.toleranceMm,
      "guide plate thickness matches the default",
    );
    assert(info.triangles > 1000, "guide plate includes routed slots and witness marks");
  } else {
    assert(
      Math.abs(info.size.x - model.geometry.jawLength) <= model.audit.toleranceMm,
      `${part.label} length matches the configured envelope`,
    );
    assert(
      Math.abs(info.size.y - model.geometry.jawThickness) <= model.audit.toleranceMm,
      `${part.label} thickness matches the configured envelope`,
    );
    assert(
      Math.abs(info.size.z - jawDepth) <= model.audit.toleranceMm,
      `${part.label} depth matches the default`,
    );
    assert(info.triangles > 700, `${part.label} includes two blind insert pockets`);
  }
}

if (!process.exitCode) console.log(`${model.name} audit complete`);
