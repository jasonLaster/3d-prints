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

console.log(`Auditing ${model.name}`);
assert(model.id === "desk-tabletop", "model id is desk-tabletop");
assert(model.viewer === "dining-table-v1", "layered top uses the oak furniture viewer");

for (const key of [
  "mockScale", "finishSystem", "tableLength", "tableWidth", "coreThickness",
  "surfaceThickness", "edgeBandWidth", "tabletopCornerRadius",
  "topRoundoverRadius", "bottomRoundoverRadius", "undersideBevelInset",
  "undersideBevelDepth", "stripWidth", "stripLengthMin", "stripLengthMax",
  "seamGap",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its limits`,
  );
}

const inches = (value) => value / 25.4;
const band = parameter("edgeBandWidth");
const totalThickness = parameter("coreThickness").default + parameter("surfaceThickness").default;
assert(Math.abs(inches(parameter("surfaceThickness").default) - 0.125) < 1e-6, "default plywood veneer is 1/8 in");
assert(inches(band.limits.min) === 1 && inches(band.limits.max) === 2, "solid edge band spans the requested 1–2 in range");
assert(parameter("tabletopCornerRadius").default <= band.default, "default plan corner stays inside solid band stock");
assert(parameter("topRoundoverRadius").default + parameter("undersideBevelInset").default < band.default, "default routed profiles leave solid band stock");
assert(parameter("undersideBevelDepth").default < totalThickness, "default underside bevel ends below the top surface");
assert(parameter("stripLengthMin").default < parameter("stripLengthMax").default, "flooring strips have a variable-length range");
assert(Math.abs(inches(parameter("stripWidth").default) - 3) < 1e-6, "default flooring face is 3 in");

const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
assert(fs.existsSync(stlPath), "reference STL exists");
if (fs.existsSync(stlPath)) {
  const input = fs.readFileSync(stlPath);
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert(Array.from(position.array).every(Number.isFinite), "reference STL has finite coordinates");
  assert(position.count / 3 === 12, "reference STL is a closed 12-triangle seed solid");
  assert(size.x > 0 && size.y > 0 && size.z > 0, "reference STL has a nonzero envelope");
  geometry.dispose();
}

if (!process.exitCode) console.log(`${model.name} audit complete`);
