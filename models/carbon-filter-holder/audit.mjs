import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const root = path.resolve(import.meta.dirname, "../..");
const model = JSON.parse(fs.readFileSync(
  process.argv[2] || path.join(root, "public/models/carbon-filter-holder/model.json"), "utf8",
));
const defaults = Object.fromEntries(model.parameters.map((p) => [p.key, p.default]));
const bundle = path.join(os.tmpdir(), `carbon-filter-audit-${process.pid}.mjs`);
let checks = 0;
const check = (condition, message) => {
  checks++;
  assert.ok(condition, message);
};
const close = (a, b, tolerance = 0.002) => Math.abs(a - b) < tolerance;

function inspect(geometry, p, label) {
  const positions = geometry.getAttribute("position");
  const edges = new Map();
  const adjacency = new Map();
  const vertices = new Set();
  const key = (v) => v.toArray().map((n) => n.toFixed(4)).join(",");
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  check(Array.from(positions.array).every(Number.isFinite), `${label}: finite mesh`);
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    check(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-10,
      `${label}: nondegenerate triangle ${i / 3}`);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [start, end] of [[a, b], [b, c], [c, a]]) {
      const from = key(start), to = key(end);
      vertices.add(from);
      const pair = [from, to].sort().join("|");
      const edge = edges.get(pair) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += from < to ? 1 : -1;
      edges.set(pair, edge);
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      adjacency.get(from).add(to);
    }
  }
  check([...edges.values()].every((e) => e.count === 2 && e.direction === 0),
    `${label}: every edge has two opposing triangles`);
  const visited = new Set();
  const pending = [vertices.values().next().value];
  while (pending.length) {
    const v = pending.pop();
    if (visited.has(v)) continue;
    visited.add(v);
    for (const neighbor of adjacency.get(v)) pending.push(neighbor);
  }
  check(visited.size === vertices.size, `${label}: one connected shell`);
  check(vertices.size - edges.size + positions.count / 3 === 2,
    `${label}: closed genus-zero shell`);

  // Independent dimensions and integrated volume of plate + U-wall + tapered lips.
  const cw = p.filterWidth + 2 * p.sideClearance;
  const cl = p.filterLength + p.sideClearance;
  const w = cw + 2 * p.wallThickness;
  const l = cl + p.wallThickness;
  const ch = p.filterThickness + p.thicknessClearance;
  const h = p.baseThickness + ch + p.lipWidth + p.lipThickness;
  const uArea = w * l - cw * cl;
  const expectedVolume = w * l * p.baseThickness + uArea * ch +
    p.lipWidth * (uArea + p.lipWidth * cl) +
    p.lipThickness * (uArea + 2 * p.lipWidth * cl);
  check(close(volume, expectedVolume, 0.05), `${label}: outward shell with exact union volume`);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  check(close(size.x, w) && close(size.y, l) && close(size.z, h), `${label}: envelope`);
  check(close(box.min.z, 0), `${label}: flat glue face on Z=0`);
  check(size.x <= 165 && size.y <= 160, `${label}: compact print envelope`);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const cast = (origin, direction) => new THREE.Raycaster(origin, direction).intersectObject(mesh)[0];
  // Sample the entire nominal filter section, including both edges and corners.
  for (const x of [-p.filterWidth / 2, 0, p.filterWidth / 2]) {
    for (const z of [0.01, p.filterThickness / 2, p.filterThickness - 0.01]) {
      const hit = cast(new THREE.Vector3(x, -l / 2 - 1, p.baseThickness + z), new THREE.Vector3(0, 1, 0));
      check(hit && close(hit.point.y, l / 2 - p.wallThickness),
        `${label}: unobstructed front-to-rear slide at ${x},${z}`);
    }
  }
  const openWidth = cw - 2 * p.lipWidth;
  for (const x of [-openWidth / 2 + 0.1, 0, openWidth / 2 - 0.1]) {
    for (const y of [-l / 2 + 1, 0, l / 2 - p.wallThickness - 1]) {
      const hit = cast(new THREE.Vector3(x, y, h + 1), new THREE.Vector3(0, 0, -1));
      check(hit && close(hit.point.z, p.baseThickness), `${label}: open trash-facing window`);
    }
  }
  for (const x of [-p.filterWidth / 2, p.filterWidth / 2]) {
    const hit = cast(new THREE.Vector3(x, 0, h + 1), new THREE.Vector3(0, 0, -1));
    check(hit && close(hit.point.z, h), `${label}: side lips catch the filter`);
  }
  mesh.material.dispose();
}

try {
  await build({ bundle: true, entryPoints: [path.join(root, "src/models/carbonFilterHolder.ts")],
    outfile: bundle, platform: "node", format: "esm" });
  const api = await import(pathToFileURL(bundle).href);
  check(model.id === "carbon-filter-holder" && model.viewer === "carbon-filter-holder-v1", "catalog identity");
  check(defaults.filterWidth === 76.2 && defaults.filterLength === 76.2 && defaults.filterThickness === 6.35,
    "exact supplied 3 × 3 × 1/4 inch filter dimensions");
  const s = api.getCarbonFilterHolderSpec(defaults);
  check(close(s.width, 82) && close(s.length, 79.1) && close(s.height, 15.35), "default envelope");
  check(close(s.channelWidth, 77.2) && close(s.channelHeight, 7.15), "clear slide envelope");
  check(defaults.lipWidth === 5 && close(s.overlap, 4.5) && close(s.exposedPercent, 88.18897637795), "5 mm lips retain 4.5 mm per side with 88.19 percent exposure");
  const fixtures = [
    ["default", defaults],
    ["small thin filter", { ...defaults, filterWidth: 40, filterLength: 40, filterThickness: 2 }],
    ["large thick filter", { ...defaults, filterWidth: 150, filterLength: 150, filterThickness: 15 }],
    ["loose fit, minimum overlap", { ...defaults, sideClearance: 1.2, thicknessClearance: 2, lipWidth: 2.4 }],
    ["thick walls, wide lips", { ...defaults, wallThickness: 4, baseThickness: 4, lipWidth: 6, lipThickness: 2.4 }],
    ["minimum print walls", { ...defaults, wallThickness: 1.6, baseThickness: 1.2, lipThickness: 1.2 }],
  ];
  for (const [label, p] of fixtures) {
    const g = api.createCarbonFilterHolderGeometry(p, model);
    inspect(g, p, label);
    g.dispose();
    console.log(`PASS ${label}: one closed shell, clear slide and exposed face`);
  }
  const narrow = { ...defaults, sideClearance: 1.2, lipWidth: 1.6 };
  check(close(api.getCarbonFilterHolderParameterLimits(model, narrow, "lipWidth").min, 2.4),
    "limits preserve at least 1.2 mm overlap as clearance changes");
  check(api.getCarbonFilterHolderParameterLimits(model, defaults, "filterWithdrawal").max === 76.2,
    "preview withdrawal follows filter length");
  const empty = api.createCarbonFilterHolderGeometry(defaults, model);
  const preview = api.createCarbonFilterHolderGeometry({ ...defaults, showFilter: 1, filterWithdrawal: 50 }, model);
  check(Buffer.from(empty.getAttribute("position").array.buffer).equals(Buffer.from(preview.getAttribute("position").array.buffer)),
    "preview settings do not alter printable geometry");
  check(api.createCarbonFilterPreviewGeometry(defaults) === null, "hidden preview adds no filter");
  const withdrawn = api.createCarbonFilterPreviewGeometry({ ...defaults, showFilter: 1, filterWithdrawal: 30 });
  check(close(withdrawn.boundingBox.min.y, s.frontY - 30), "filter withdraws through the open mouth");
  const bytes = fs.readFileSync(path.join(root, "public", model.stl.url));
  const stl = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  inspect(stl, defaults, "default STL");
  check(Buffer.from(stl.getAttribute("position").array.buffer).equals(Buffer.from(empty.getAttribute("position").array.buffer)),
    "default STL exactly matches procedural viewer geometry");
  [empty, preview, withdrawn, stl].forEach((g) => g.dispose());
  console.log(`PASS ${checks} carbon-filter checks; physical fit and lid adhesion remain untested`);
} finally {
  fs.rmSync(bundle, { force: true });
}
