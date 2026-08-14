import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
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
  return { degenerate, finite, min, nonManifoldEdges, size, triangles: position.count / 3 };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "router-tenon-jig", "model id is router-tenon-jig");
assert(model.viewer === "router-tenon-jig-v1", "viewer is supported");
assert(model.parts.length === 5, "five individual printable parts are registered");
assert(model.presets.length === 4, "four common tenon presets are registered");
assert(
  model.geometry.presetTenonThicknessesMm.join(",") === "6,8,10,12" &&
    model.geometry.presetTenonWidthsMm.join(",") === "30,40,50,60",
  "thickness and width witness marks are defined",
);

for (const entry of model.parameters) {
  assert(entry.default >= entry.limits.min && entry.default <= entry.limits.max, `${entry.key} default is inside limits`);
}

const tenonThickness = parameter("tenonThickness").default;
const tenonWidth = parameter("tenonWidth").default;
const cutter = parameter("routerCutterDiameter").default;
const bearing = parameter("guideBearingDiameter").default;
const allowance = parameter("tenonAllowance").default;
const openingThickness = tenonThickness - bearing + cutter + allowance;
const openingWidth = tenonWidth - bearing + cutter + allowance;
const shoulderFace = (parameter("workpieceThickness").default - tenonThickness) / 2;
const shoulderEdge = (parameter("workpieceWidth").default - tenonWidth) / 2;
const insertDepth = parameter("insertDepth").default;
const baseThickness = parameter("baseThickness").default;

assert(tenonThickness === 10 && tenonWidth === 40, "default tenon is 10 × 40 mm");
assert(parameter("tenonLength").default === 30, "default tenon length is 30 mm");
assert(cutter === 12.7 && bearing === 12.7, "default cutter and bearing are equal 12.7 mm sizes");
assert(Math.abs(openingThickness - 10.2) < 1e-8, "default thickness opening is 10.2 mm");
assert(Math.abs(openingWidth - 40.2) < 1e-8, "default width opening is 40.2 mm");
assert(shoulderFace >= 3 && shoulderEdge >= 3, "default stock preserves at least 3 mm shoulders");
assert(baseThickness - insertDepth >= model.geometry.minimumInsertFloor, "blind insert pockets preserve a closed floor");

for (const part of model.parts) {
  const filePath = path.join(root, "public", part.url.replace(/^\/+/, ""));
  assert(fs.existsSync(filePath), `${part.label} STL exists`);
  if (!fs.existsSync(filePath)) continue;
  const info = stlInfo(filePath);
  assert(info.finite, `${part.label} STL contains only finite coordinates`);
  assert(info.degenerate === 0, `${part.label} STL has no degenerate triangles`);
  assert(info.nonManifoldEdges === 0, `${part.label} STL is watertight and manifold`);
  assert(Math.abs(info.min.z) <= model.audit.toleranceMm, `${part.label} rests on Z=0`);
  if (part.key === "base-bridge") {
    assert(Math.abs(info.size.x - model.geometry.baseLength) <= model.audit.toleranceMm, "base length matches the configured envelope");
    assert(Math.abs(info.size.y - model.geometry.baseWidth) <= model.audit.toleranceMm, "base width matches the configured envelope");
    assert(Math.abs(info.size.z - baseThickness) <= model.audit.toleranceMm, "base thickness matches the default");
    assert(info.triangles > 900, "base includes the stock throat and six blind insert pockets");
  } else if (part.key.includes("cheek")) {
    assert(Math.abs(info.size.x - model.geometry.cheekPlateLength) <= model.audit.toleranceMm, `${part.label} length matches the configured envelope`);
    assert(Math.abs(info.size.y - model.geometry.cheekPlateWidth) <= model.audit.toleranceMm, `${part.label} width matches the configured envelope`);
    assert(info.triangles > 850, `${part.label} includes two slots and width markers`);
  } else {
    assert(Math.abs(info.size.x - model.geometry.edgePlateLength) <= model.audit.toleranceMm, `${part.label} length matches the configured envelope`);
    assert(Math.abs(info.size.y - model.geometry.edgePlateWidth) <= model.audit.toleranceMm, `${part.label} width matches the configured envelope`);
    assert(info.triangles > 400, `${part.label} includes one slot and thickness markers`);
  }
}

if (!process.exitCode) console.log(`${model.name} audit complete`);
