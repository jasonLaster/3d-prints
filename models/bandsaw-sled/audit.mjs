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
  let degenerate = 0;
  const key = (index) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (
      new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .lengthSq() <= 1e-10
    ) {
      degenerate += 1;
    }
    for (const [start, end] of [
      [key(index), key(index + 1)],
      [key(index + 1), key(index + 2)],
      [key(index + 2), key(index)],
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
assert(model.id === "bandsaw-sled", "model id is bandsaw-sled");
assert(model.viewer === "bandsaw-sled-v1", "viewer is supported");
assert(model.parts.length === 4, "four individual printable parts are registered");

for (const key of [
  "baseWidth", "baseDepth", "baseThickness", "fenceWidth", "fenceHeight",
  "fenceThickness", "fencePosition", "bladeKerf", "bracketSpacing",
  "bracketWidth", "bracketDepth", "lockSlotLength", "lockBoltDiameter",
  "lockBoltLength", "baseInsertDiameter", "baseInsertDepth",
  "boardBoltDiameter", "boardBoltLength", "insertPocketDiameter", "insertDepth",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max, `${key} default is inside limits`);
}

const baseThickness = parameter("baseThickness").default;
const fenceWidth = parameter("fenceWidth").default;
const fenceThickness = parameter("fenceThickness").default;
const bracketWidth = parameter("bracketWidth").default;
const bracketDepth = parameter("bracketDepth").default;
const bracketSpacing = parameter("bracketSpacing").default;
const slotLength = parameter("lockSlotLength").default;
const insertDepth = parameter("insertDepth").default;
const woodInsertDepth = parameter("baseInsertDepth").default;
const boardEngagement = parameter("boardBoltLength").default - fenceThickness - model.geometry.boardWasherThickness;
const lockEngagement = parameter("lockBoltLength").default - model.geometry.bracketFootThickness - model.geometry.lockWasherThickness;
const slotTravel = (slotLength - model.geometry.lockSlotWidth) / 2;
const nominalFence = model.geometry.baseInsertStationY - fenceThickness / 2 - bracketDepth / 2;

assert(fenceWidth <= parameter("baseWidth").default - 20, "wood fence stays inside the wood base width");
assert((fenceWidth - bracketSpacing - bracketWidth) / 2 >= model.geometry.minimumFenceEdgeMargin, "brackets preserve fence edge margins");
assert((bracketDepth - slotLength) / 2 >= model.geometry.minimumSlotEndWeb, "M6 slots preserve end webs");
assert(model.geometry.bracketBackThickness - insertDepth >= model.geometry.minimumInsertShoulder, "M5 heat-set pockets preserve a shoulder");
assert(baseThickness - woodInsertDepth >= model.geometry.minimumWoodInsertFloor, "M6 wood inserts preserve the base floor");
assert(boardEngagement >= 4 && boardEngagement <= insertDepth + 0.5, "M5 board bolts engage the heat-set inserts without excessive projection");
assert(lockEngagement >= 8 && lockEngagement <= woodInsertDepth + 0.5, "M6 lock bolts engage the wood inserts without excessive projection");
assert(parameter("fencePosition").default >= nominalFence - slotTravel && parameter("fencePosition").default <= nominalFence + slotTravel, "default fence lies inside both adjustment slots");

const effectiveSpan = parameter("fenceHeight").default - model.geometry.bracketGussetHeight;
const force = model.geometry.screenLateralLoadN / 2;
const secondMoment = bracketWidth * Math.pow(model.geometry.bracketBackThickness, 3) / 12;
const deflection = force * Math.pow(effectiveSpan, 3) / (3 * model.geometry.screenModulusMpa * secondMoment);
const stress = 6 * force * effectiveSpan / (bracketWidth * Math.pow(model.geometry.bracketBackThickness, 2));
const safetyFactor = model.geometry.screenAllowableStressMpa / stress;
assert(deflection <= model.geometry.maximumScreenDeflection, "gusseted bracket deflection screen passes");
assert(safetyFactor >= model.geometry.minimumScreenSafetyFactor, "gusseted bracket stress screen passes");

for (const part of model.parts) {
  const filePath = path.join(root, "public", part.url.replace(/^\/+/, ""));
  assert(fs.existsSync(filePath), `${part.label} STL exists`);
  if (!fs.existsSync(filePath)) continue;
  const info = stlInfo(filePath);
  assert(info.finite, `${part.label} STL contains only finite coordinates`);
  assert(info.degenerate === 0, `${part.label} STL has no degenerate triangles`);
  assert(info.nonManifoldEdges === 0, `${part.label} STL is watertight and manifold`);
  assert(Math.abs(info.min.z) <= model.audit.toleranceMm, `${part.label} rests on Z=0`);
  if (part.key.includes("bracket")) {
    assert(Math.abs(info.size.x - bracketWidth) <= model.audit.toleranceMm, `${part.label} width matches`);
    assert(Math.abs(info.size.y - bracketDepth) <= model.audit.toleranceMm, `${part.label} foot depth matches`);
    assert(Math.abs(info.size.z - parameter("fenceHeight").default) <= model.audit.toleranceMm, `${part.label} back height matches`);
    assert(info.triangles > 900, `${part.label} includes slot, gussets, and two stepped insert pockets`);
  } else {
    assert(Math.abs(info.size.x - model.geometry.lockKnobDiameter) <= model.audit.toleranceMm * 3, `${part.label} diameter matches`);
    assert(Math.abs(info.size.z - model.geometry.lockKnobThickness) <= model.audit.toleranceMm, `${part.label} thickness matches`);
    assert(info.triangles > 300, `${part.label} includes lobes and captive bolt-head pocket`);
  }
}

if (!process.exitCode) console.log(`${model.name} audit complete`);
