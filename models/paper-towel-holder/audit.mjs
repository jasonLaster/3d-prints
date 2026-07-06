import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = path.resolve(process.argv[2] ?? "");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function nearlyEqual(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

function measureStl(stlPath, axis) {
  const loader = new STLLoader();
  const buffer = fs.readFileSync(stlPath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = loader.parse(arrayBuffer);
  const position = geometry.getAttribute("position");
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxRadius = 0;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) - axis.x;
    const y = position.getY(index) - axis.y;
    const z = position.getZ(index);

    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    maxRadius = Math.max(maxRadius, Math.hypot(x, y));
  }

  geometry.dispose();

  return {
    height: maxZ - minZ,
    radialDiameter: maxRadius * 2,
  };
}

function parameter(model, key) {
  return model.parameters.find((entry) => entry.key === key);
}

function validateParameter(model, key) {
  const entry = parameter(model, key);
  assert(Boolean(entry), `${key} parameter is defined`);
  if (!entry) {
    return;
  }

  assert(
    entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its limits`,
  );
  assert(entry.limits.step > 0, `${key} step is positive`);
}

if (!process.argv[2]) {
  fail("Expected a model config path");
  process.exit(1);
}

const model = readJson(configPath);
const tolerance = model.audit?.toleranceMm ?? 0.5;
const publicPath = path.join(root, "public");
const stlPath = path.join(publicPath, model.stl.url.replace(/^\/+/, ""));
const auditScript = model.scripts?.find((script) => script.name === "audit");

console.log(`Auditing ${model.name}`);

assert(model.id === "paper-towel-holder", "model id is paper-towel-holder");
assert(model.name === "Paper Towel Holder", "model name is Paper Towel Holder");
assert(model.viewer === "weighted-paper-towel-holder-v1", "viewer is supported");
assert(model.stl.fileName === "paper-towel-holder.stl", "STL is renamed");
assert(fs.existsSync(stlPath), "STL file exists");
assert(Boolean(auditScript), "model JSON registers an audit script");
assert(
  auditScript?.path === "models/paper-towel-holder/audit.mjs",
  "audit script path points to this model",
);

validateParameter(model, "height");
validateParameter(model, "diameter");
validateParameter(model, "tubeDiameter");

const height = parameter(model, "height");
const diameter = parameter(model, "diameter");
const tubeDiameter = parameter(model, "tubeDiameter");
const geometry = model.geometry;
const tubeWall =
  (geometry.centerTubeOuterDiameter - geometry.centerTubeInnerDiameter) / 2;
const sandChamberDiameter = tubeDiameter.default - tubeWall * 2;
const tubeClearance = diameter.default - tubeDiameter.default;
const requiredAuditKeys = [
  "holderHeightTarget",
  "holderDiameterTarget",
  "centerTubeOuterDiameter",
  "sandChamber",
  "estimatedSandMass",
  "flushSandChamberFloor",
  "roundedTop",
  "tubeToHolderClearance",
  "tubeRadialMove",
  "roundedTopHeight",
  "bottomTopLockBands",
  "outerWallRadialMove",
];
const configuredAuditKeys = new Set(model.audit.checks.map((check) => check.key));

assert(
  tubeClearance >= geometry.tubeToHolderDiameterClearance,
  "default holder diameter preserves tube clearance",
);
assert(sandChamberDiameter > 0, "default sand chamber remains open");
assert(
  nearlyEqual(sandChamberDiameter, geometry.centerTubeInnerDiameter, tolerance),
  "default sand chamber matches original inner diameter",
);
assert(
  geometry.bottomLockedHeight > 0 && geometry.topLockedHeight > 0,
  "locked holder bands are configured",
);
assert(
  geometry.sandBottomHeight > 0,
  "flush sand floor has positive thickness",
);
assert(
  requiredAuditKeys.every((key) => configuredAuditKeys.has(key)),
  "all runtime audit checks are configured",
);

if (fs.existsSync(stlPath)) {
  const measurements = measureStl(stlPath, geometry.mainAxis);
  assert(
    nearlyEqual(measurements.height, geometry.originalHeight, tolerance),
    `STL height ${measurements.height.toFixed(3)} mm matches declared height`,
  );
  assert(
    nearlyEqual(measurements.radialDiameter, geometry.originalDiameter, tolerance),
    `STL radial diameter ${measurements.radialDiameter.toFixed(
      3,
    )} mm matches declared diameter`,
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`${model.name} audit complete`);
