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

function measureStl(stlPath, geometryConfig) {
  const loader = new STLLoader();
  const buffer = fs.readFileSync(stlPath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = loader.parse(arrayBuffer);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const position = geometry.getAttribute("position");
  const angle = THREE.MathUtils.degToRad(geometryConfig.footprintRotationDegrees);
  const rotationCos = Math.cos(angle);
  const rotationSin = Math.sin(angle);
  let minFootprintWidth = Infinity;
  let maxFootprintWidth = -Infinity;
  let minFootprintLength = Infinity;
  let maxFootprintLength = -Infinity;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) - geometryConfig.mainAxis.x;
    const y = position.getY(index) - geometryConfig.mainAxis.y;
    const footprintWidth = x * rotationCos + y * rotationSin;
    const footprintLength = -x * rotationSin + y * rotationCos;
    minFootprintWidth = Math.min(minFootprintWidth, footprintWidth);
    maxFootprintWidth = Math.max(maxFootprintWidth, footprintWidth);
    minFootprintLength = Math.min(minFootprintLength, footprintLength);
    maxFootprintLength = Math.max(maxFootprintLength, footprintLength);
  }

  const footprint = {
    length: maxFootprintLength - minFootprintLength,
    width: maxFootprintWidth - minFootprintWidth,
  };
  geometry.dispose();
  return { size, center, footprint, minZ: box.min.z };
}

if (!process.argv[2]) {
  fail("Expected a model config path");
  process.exit(1);
}

const model = readJson(configPath);
const geometry = model.geometry;
const tolerance = model.audit?.toleranceMm ?? 0.5;
const publicPath = path.join(root, "public");
const stlPath = path.join(publicPath, model.stl.url.replace(/^\/+/, ""));
const auditScript = model.scripts?.find((script) => script.name === "audit");

console.log(`Auditing ${model.name}`);

assert(model.id === "japandi-tray", "model id is japandi-tray");
assert(model.name === "Japandi Tray", "model name is Japandi Tray");
assert(model.viewer === "japandi-tray-v1", "viewer is supported");
assert(model.stl.fileName === "japandi-tray.stl", "STL is named for this model");
assert(fs.existsSync(stlPath), "STL file exists");
assert(Boolean(auditScript), "model JSON registers an audit script");
assert(
  auditScript?.path === "models/japandi-tray/audit.mjs",
  "audit script path points to this model",
);

["length", "width", "height", "floorThickness", "ribRelief", "rotation"].forEach(
  (key) => validateParameter(model, key),
);

const height = parameter(model, "height");
const floorThickness = parameter(model, "floorThickness");
const ribRelief = parameter(model, "ribRelief");
const rotation = parameter(model, "rotation");
const configuredAuditKeys = new Set(model.audit.checks.map((check) => check.key));
const requiredAuditKeys = [
  "trayLengthTarget",
  "trayWidthTarget",
  "trayHeightTarget",
  "trayFloorThickness",
  "trayRibRelief",
  "trayAspectRatio",
  "trayInteriorDepth",
  "trayOriginalReference",
];

assert(
  floorThickness.default < height.default,
  "default floor thickness stays below wall height",
);
assert(
  ribRelief.default >= geometry.minimumRibRelief &&
    ribRelief.default <= geometry.maximumRibRelief,
  "default rib relief is inside the printable relief range",
);
assert(
  Number.isFinite(geometry.footprintRotationDegrees),
  "tray footprint rotation is configured",
);
assert(rotation.default === 0, "default tray rotation is X-axis aligned");
assert(
  rotation.limits.max === geometry.footprintRotationDegrees,
  "maximum tray rotation matches the source footprint angle",
);
assert(
  requiredAuditKeys.every((key) => configuredAuditKeys.has(key)),
  "all runtime audit checks are configured",
);

if (fs.existsSync(stlPath)) {
  const measurements = measureStl(stlPath, geometry);
  assert(
    nearlyEqual(measurements.footprint.length, geometry.originalLength, tolerance),
    `STL footprint length ${measurements.footprint.length.toFixed(3)} mm matches declared length`,
  );
  assert(
    nearlyEqual(measurements.footprint.width, geometry.originalWidth, tolerance),
    `STL footprint width ${measurements.footprint.width.toFixed(3)} mm matches declared width`,
  );
  assert(
    nearlyEqual(measurements.size.z, geometry.originalHeight, tolerance),
    `STL height ${measurements.size.z.toFixed(3)} mm matches declared height`,
  );
  assert(
    nearlyEqual(measurements.center.x, geometry.mainAxis.x, tolerance) &&
      nearlyEqual(measurements.center.y, geometry.mainAxis.y, tolerance),
    "declared center axis matches STL center",
  );
  assert(nearlyEqual(measurements.minZ, geometry.mainAxis.z, tolerance), "Z origin matches STL bottom");
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`${model.name} audit complete`);
