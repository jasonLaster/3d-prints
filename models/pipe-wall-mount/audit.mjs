import { build } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const retainedSourcePath = path.join(
  root,
  "models/pipe-wall-mount/reference/Strong_Universal_Wall_Hook_VCD.stl",
);
const publicSourcePath = path.join(
  root,
  "public",
  model.stl.url.replace(/^\/+/, ""),
);
const defaultStlPath = path.join(
  root,
  "public",
  model.defaultStl.url.replace(/^\/+/, ""),
);
const bundlePath = path.join(
  import.meta.dirname,
  `.pipe-wall-mount-audit-${process.pid}-${Date.now()}.mjs`,
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

function analyzeStl(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const position = geometry.getAttribute("position");
  const edges = new Map();
  const vertexTriangles = new Map();
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
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerateTriangles += 1;
    }
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
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
    bytes: buffer.byteLength,
    components,
    degenerateTriangles,
    finite,
    min,
    nonManifoldEdges,
    size,
    triangles,
  };
}

function exportBinaryStl(object) {
  object.updateMatrixWorld(true);
  const result = new STLExporter().parse(object, { binary: true });
  return Buffer.from(result.buffer, result.byteOffset, result.byteLength);
}

function geometryHasBoreWall(geometry, location, radius, plateThickness) {
  const position = geometry.getAttribute("position");
  const matching = new Set();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radialDistance = Math.hypot(x - location.x, z - location.z);
    if (
      Math.abs(radialDistance - radius) <= 0.002 &&
      y >= -0.002 &&
      y <= plateThickness + 0.002
    ) {
      matching.add(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`);
    }
  }
  return matching.size >= model.geometry.radialSegments * 2;
}

console.log(`Auditing ${model.name}`);
assert(model.id === "pipe-wall-mount", "model id is pipe-wall-mount");
assert(
  model.viewer === "pipe-wall-mount-v1",
  "pipe wall-mount viewer is registered",
);
assert(fs.existsSync(retainedSourcePath), "retained supplied source STL exists");
assert(fs.existsSync(publicSourcePath), "public reference STL exists");
assert(fs.existsSync(defaultStlPath), "default generated wall-mount STL exists");

const expectedHash =
  "f43bb7da3c21f9687e5a77740611e0879545ea032aa8b515056573bba9320c34";
for (const [label, sourcePath] of [
  ["retained", retainedSourcePath],
  ["public", publicSourcePath],
]) {
  const sourceHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(sourcePath))
    .digest("hex");
  assert(sourceHash === expectedHash, `${label} source SHA-256 is byte-faithful`);
}

for (const key of [
  "pipeCount",
  "pipeWiggle",
  "hookReach",
  "hookThickness",
  "hookWidth",
  "pipeGap",
  "bracketHeight",
  "backplateThickness",
  "drillColumnOffset",
  "mountingHoleDiameter",
  "drillEdgeOffset",
]) {
  const entry = parameter(key);
  assert(Boolean(entry), `${key} parameter is defined`);
  assert(
    entry && entry.default >= entry.limits.min && entry.default <= entry.limits.max,
    `${key} default is inside its declared limits`,
  );
}
for (let index = 1; index <= model.geometry.maximumPipeCount; index += 1) {
  assert(Boolean(parameter(`pipeDiameter${index}`)), `pipe diameter ${index} is defined`);
}

const source = analyzeStl(retainedSourcePath);
assert(source.finite, "source STL contains only finite coordinates");
assert(
  source.degenerateTriangles === 64,
  "source STL records its 64 supplied degenerate triangles",
);
assert(
  source.nonManifoldEdges === 2,
  "source STL records its two supplied non-manifold edges",
);
assert(nearlyEqual(source.size.x, model.geometry.sourceProjection), "source projection is measured");
assert(nearlyEqual(source.size.y, model.geometry.sourceHeight), "source height is measured");
assert(nearlyEqual(source.size.z, model.geometry.sourceWidth), "source width is measured");

const defaultStl = analyzeStl(defaultStlPath);
assert(defaultStl.bytes > 84, "default STL contains binary triangle data");
assert(defaultStl.finite, "default STL contains only finite coordinates");
assert(defaultStl.degenerateTriangles === 0, "default STL has no degenerate triangles");
assert(defaultStl.nonManifoldEdges === 0, "default STL keeps every edge manifold");
assert(defaultStl.components === 1, "default STL is one connected shell");
assert(nearlyEqual(defaultStl.min.z, 0), "default STL broad side rests on Z=0");
assert(nearlyEqual(defaultStl.size.x, parameter("bracketHeight").default), "print X span matches bracket height");
assert(nearlyEqual(defaultStl.size.y, parameter("hookReach").default), "print Y span matches hook reach");
assert(nearlyEqual(defaultStl.size.z, parameter("hookWidth").default), "print Z span matches contact width and excludes preview pipes");

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/pipeWallMount.ts")],
    external: ["three"],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const implementation = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const defaultParams = Object.fromEntries(
    model.parameters.map((entry) => [entry.key, entry.default]),
  );
  const defaultSpec = implementation.getPipeWallMountSpec(defaultParams, model);
  assert(defaultSpec.pipeDiameters.length === 3, "default creates three hooks");
  assert(
    defaultSpec.pipeDiameters.every((diameter) => nearlyEqual(diameter, 25.4)),
    "default hooks fit three one-inch pipes",
  );
  assert(defaultSpec.drillLocations.length === 4, "default derives four drill locations");
  assert(
    nearlyEqual(defaultSpec.drillColumnSpacing, parameter("drillColumnOffset").default * 2),
    "drill column spacing follows the editable offset",
  );
  assert(
    nearlyEqual(
      defaultSpec.drillRowSpacing,
      parameter("bracketHeight").default - parameter("drillEdgeOffset").default * 2,
    ),
    "drill row spacing follows height and edge offsets",
  );
  const defaultGeometry = implementation.createPipeWallMountGeometry(
    defaultParams,
    model,
  );
  defaultSpec.drillLocations.forEach((location, index) => {
    assert(
      geometryHasBoreWall(
        defaultGeometry,
        location,
        defaultSpec.mountingHoleDiameter / 2,
        defaultSpec.backplateThickness,
      ),
      `drill bore ${index + 1} is present in generated geometry`,
    );
  });
  defaultGeometry.dispose();

  const customParams = {
    ...defaultParams,
    pipeCount: 4,
    pipeDiameter1: 19.05,
    pipeDiameter2: 25.4,
    pipeDiameter3: 31.75,
    pipeDiameter4: 38.1,
    pipeWiggle: 2,
    bracketHeight: 280,
    hookReach: 100,
  };
  const customSpec = implementation.getPipeWallMountSpec(customParams, model);
  assert(customSpec.hooks.length === 4, "mixed custom set creates four hooks");
  assert(
    customSpec.hooks.every((hook, index) =>
      nearlyEqual(hook.cradleDiameter, customSpec.pipeDiameters[index] + 2)),
    "each custom cradle follows its own pipe diameter plus total wiggle room",
  );
  assert(
    customSpec.hooks.every((hook, index, hooks) =>
      index === 0 || hook.centerZ > hooks[index - 1].centerZ),
    "custom hooks stay ordered bottom to top",
  );
  const previewGeometries = implementation.createPipeWallMountPipePreviews(
    customParams,
    model,
  );
  assert(previewGeometries.length === 4, "pipe preview count matches the custom set");
  previewGeometries.forEach((geometry, index) => {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert(
      nearlyEqual(size.y, customSpec.pipeDiameters[index]) &&
        nearlyEqual(size.z, customSpec.pipeDiameters[index]),
      `pipe preview ${index + 1} matches its outside diameter`,
    );
    geometry.dispose();
  });
  const customGeometry = implementation.createPipeWallMountGeometry(
    customParams,
    model,
  );
  const customMesh = new THREE.Mesh(customGeometry);
  implementation.orientPipeWallMountForPrint(customMesh, customParams, model);
  const customStl = analyzeStl(exportBinaryStl(customMesh));
  assert(customStl.degenerateTriangles === 0, "custom STL has no degenerate triangles");
  assert(customStl.nonManifoldEdges === 0, "custom STL keeps every edge manifold");
  assert(customStl.components === 1, "custom STL remains one connected shell");
  assert(nearlyEqual(customStl.min.z, 0), "custom STL rests on Z=0");
  assert(nearlyEqual(customStl.size.x, customSpec.bracketHeight), "custom print span follows bracket height");
  assert(nearlyEqual(customStl.size.y, customSpec.hookReach), "custom print span follows hook reach");
  assert(nearlyEqual(customStl.size.z, customSpec.hookWidth), "custom print height follows hook width");
  customGeometry.dispose();
} finally {
  fs.rmSync(bundlePath, { force: true });
}

if (failed) process.exitCode = 1;
else console.log(`${model.name} audit complete`);
