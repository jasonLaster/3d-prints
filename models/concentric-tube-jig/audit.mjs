import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const stlPath = path.join(root, "public", model.stl.url.replace(/^\/+/, ""));
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) process.exitCode = 1;
};

function stlInfo(filePath) {
  const input = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  const position = geometry.getAttribute("position");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerate = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) degenerate += 1;
  }
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  let baseRadius = 0;
  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index) - min.z) <= 1e-4) {
      baseRadius = Math.max(
        baseRadius,
        Math.hypot(position.getX(index), position.getY(index)),
      );
    }
  }
  const finite = Array.from(position.array).every(Number.isFinite);
  geometry.dispose();
  return {
    baseDiameter: baseRadius * 2,
    degenerate,
    finite,
    min,
    size,
    triangles: position.count / 3,
  };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "concentric-tube-jig", "model id is concentric-tube-jig");
assert(model.viewer === "concentric-tube-jig-v1", "viewer is supported");
assert(fs.existsSync(stlPath), "default jig STL exists");
for (const key of ["firstDiameter", "increment", "tubeHeight", "boreDiameter"]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max, `${key} default is inside limits`);
}
const first = parameter("firstDiameter").default;
const increment = parameter("increment").default;
const count = model.geometry.tubeCount;
const height = parameter("tubeHeight").default;
const bore = parameter("boreDiameter").default;
const last = first + (count - 1) * increment;
assert(first === 19.05, "first tube defaults to 3/4 in");
assert(last === 31.75, "last tube defaults to 1 1/4 in");
assert(increment === 1.5875, "tube steps default to 1/16 in");
assert(height === 6.35, "each tube defaults to 1/4 in high");
assert(count === 9, "default jig has nine tube steps");
assert((first - bore) / 2 >= model.geometry.minimumWallThickness, "first tube preserves minimum wall");

if (fs.existsSync(stlPath)) {
  const info = stlInfo(stlPath);
  assert(info.finite, "STL contains only finite coordinates");
  assert(info.degenerate === 0, "STL has no degenerate triangles");
  assert(info.triangles > 1800, "STL includes high-resolution round steps");
  assert(Math.abs(info.size.x - last) <= model.audit.toleranceMm, "STL width matches final tube diameter");
  assert(Math.abs(info.size.z - height * count) <= model.audit.toleranceMm, "STL height matches stacked tube steps");
  assert(Math.abs(info.min.z) <= model.audit.toleranceMm, "STL rests on Z=0");
  assert(
    Math.abs(info.baseDiameter - last) <= model.audit.toleranceMm,
    "largest tube is the build-plate face",
  );
}
if (!process.exitCode) console.log(`${model.name} audit complete`);
