import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
const root = path.resolve(import.meta.dirname, "../..");
const configPath =
  process.argv[2] ??
  path.join(root, "public/models/keyhole-leveling-tabs/model.json");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const defaults = Object.fromEntries(
  model.parameters.map((p) => [p.key, p.default]),
);
let failed = false,
  checks = 0;
const assert = (condition, message) => {
  checks++;
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) failed = true;
};
const close = (a, b, tolerance = 0.0001) => Math.abs(a - b) <= tolerance;
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
    for (const [start, end] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
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
function components(position) {
  const graph = new Map();
  const key = (i) =>
    [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => v.toFixed(4))
      .join(",");
  for (let i = 0; i < position.count; i += 3) {
    const keys = [key(i), key(i + 1), key(i + 2)];
    keys.forEach((a) => {
      if (!graph.has(a)) graph.set(a, new Set());
      keys.forEach((b) => graph.get(a).add(b));
    });
  }
  const remaining = new Set(graph.keys());
  let count = 0;
  while (remaining.size) {
    count++;
    const stack = [remaining.values().next().value];
    while (stack.length) {
      const a = stack.pop();
      if (!remaining.delete(a)) continue;
      for (const b of graph.get(a)) stack.push(b);
    }
  }
  return count;
}
function printable(g, label) {
  const pos = g.getAttribute("position"),
    info = analyzePosition(pos);
  assert(
    info.finite && info.degenerateTriangles === 0,
    `${label}: finite nondegenerate triangles`,
  );
  assert(
    info.nonManifoldEdges === 0 && info.inconsistentEdges === 0,
    `${label}: closed, consistently wound manifold`,
  );
  assert(info.signedVolume > 0, `${label}: positive enclosed volume`);
  assert(
    components(pos) === 1,
    `${label}: pad, leg and all bumps form one connected shell`,
  );
  return info;
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyhole-audit-"));
try {
  const bundle = path.join(temp, "geometry.mjs");
  await build({
    entryPoints: [path.join(root, "src/models/keyholeLevelingTabs.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
  });
  const mod = await import(pathToFileURL(bundle).href);
  assert(
    model.id === "keyhole-leveling-tabs" &&
      model.viewer === "keyhole-leveling-tabs-v1",
    "catalog model routes to supported parametric viewer",
  );
  assert(
    close(model.geometry.incrementMm, 25.4 / 32, 1e-12),
    "exact 1/32 inch increment, no rounded metric constants",
  );
  assert(model.materials.includes("PLA Tough"), "PLA Tough accepted");
  assert(
    !model.geometry.dimensionsConfirmed &&
      !model.geometry.physicalLoadTestPassed,
    "unmeasured geometry and physical load test remain pending",
  );
  const loader = new STLLoader();
  for (let n = 1; n <= 8; n++) {
    const p = { ...defaults, variant: n },
      s = mod.getKeyholeTabsSpec(p, model);
    const g = mod.createKeyholeTabCanonicalGeometry(p, model),
      pos = g.getAttribute("position");
    printable(g, `variant ${n}`);
    assert(
      close(s.lift, (n * 25.4) / 32, 1e-10) &&
        close(s.legContactOffset, (-n * 25.4) / 32, 1e-10),
      `variant ${n}: downward contact produces positive exact lift`,
    );
    const inward = Array.from({ length: pos.count }, (_, i) => [
      pos.getY(i),
      pos.getZ(i),
    ]).filter(([, z]) => z < 0);
    assert(
      close(Math.min(...inward.map(([y]) => y)), -s.offset) &&
        close(Math.max(...inward.map(([y]) => y)), 0),
      `variant ${n}: mesh leg spans actual contact datums`,
    );
    assert(
      close(g.boundingBox.min.z, -p.legDepth),
      `variant ${n}: short leg projects into negative frame Z`,
    );
    const crownBaseY =
      -s.crownRadius + Math.sqrt(s.crownRadius ** 2 - (s.tipWidth / 2) ** 2);
    const crownVertices = [];
    for (let i = 0; i < pos.count; i++) {
      if (close(pos.getZ(i), -p.legDepth) && pos.getY(i) >= crownBaseY - 1e-6) {
        crownVertices.push([pos.getX(i), pos.getY(i)]);
      }
    }
    assert(
      crownVertices.length >= 33 &&
        crownVertices.every(([x, y]) =>
          close(x * x + (y + s.crownRadius) ** 2, s.crownRadius ** 2, 0.00001),
        ),
      `variant ${n}: actual front crown vertices lie on the slot-roof circle`,
    );
    assert(
      crownVertices.some(([x, y]) => close(x, 0) && close(y, 0)),
      `variant ${n}: round crown preserves Y=0 apex`,
    );
    assert(
      close(s.legWidth, 3) && close(s.crownRadius, p.keyholeSlotWidth / 2),
      `variant ${n}: 3 mm root follows assumed roof radius`,
    );
    assert(
      s.edgeHeight >= model.geometry.minimumLegEdgeHeight - 1e-8,
      `variant ${n}: crown leaves a positive edge section`,
    );
    const apex = new Set();
    for (let i = 0; i < pos.count; i++)
      if (close(pos.getZ(i), s.padMaxZ + p.bumpHeight))
        apex.add(`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)}`);
    assert(
      apex.size === n,
      `variant ${n}: mesh contains ${n} integrated bump apices`,
    );
    for (const key of [
      "roundedCrown",
      "slotFit",
      "depthFit",
      "headEntry",
      "neckSeat",
      "wallClearance",
    ])
      assert(
        mod.getKeyholeTabsAuditValue({ key, label: key }, p, "mm", model)
          .status === "pass",
        `variant ${n}: ${key} passes for assumed dimensions`,
      );
    const printed = mod.createKeyholeTabPrintGeometry(p, model);
    const bounds = printable(printed, `printed ${n}`).bounds;
    assert(close(bounds.min.z, 0), `printed ${n}: rests on Z=0`);
    const data = fs.readFileSync(
      path.join(
        root,
        "public/models/keyhole-leveling-tabs/stl",
        mod.keyholeVariantName(n),
      ),
    );
    const stl = loader.parse(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    printable(stl, `STL ${n}`);
    assert(
      Buffer.from(stl.getAttribute("position").array.buffer).equals(
        Buffer.from(printed.getAttribute("position").array.buffer),
      ),
      `STL ${n}: exported vertices exactly match shared geometry`,
    );
    g.dispose();
    printed.dispose();
    stl.dispose();
  }
  for (const parameter of model.parameters.filter(
    (p) => !["variant", "previewMode"].includes(p.key),
  ))
    for (const value of [parameter.limits.min, parameter.limits.max]) {
      const p = { ...defaults, [parameter.key]: value };
      const g = mod.createKeyholeTabCanonicalGeometry(p, model);
      const info = analyzePosition(g.getAttribute("position"));
      assert(
        info.finite &&
          info.nonManifoldEdges === 0 &&
          info.degenerateTriangles === 0 &&
          info.inconsistentEdges === 0,
        `${parameter.key}=${value}: manifold finite geometry`,
      );
      g.dispose();
    }
  // All eight variants must also remain manifold at a wide, shallow input.
  for (let n = 1; n <= 8; n++) {
    const p = { ...defaults, variant: n, legWidth: 4.1 };
    const g = mod.createKeyholeTabCanonicalGeometry(p, model);
    const info = analyzePosition(g.getAttribute("position"));
    assert(
      info.finite &&
        info.nonManifoldEdges === 0 &&
        info.degenerateTriangles === 0 &&
        info.inconsistentEdges === 0,
      `wide variant ${n}: invalid fit still produces valid inspectable geometry`,
    );
    if (n === 1)
      assert(
        mod.getKeyholeTabsAuditValue(
          { key: "roundedCrown", label: "Circular leg crown" },
          p,
          "mm",
          model,
        ).status === "warn",
        "flatter crown mismatch is exposed as a warning",
      );
    g.dispose();
  }
  const invalid = {
    ...defaults,
    wideOpeningDiameter: 7.8,
    screwHeadDiameter: 10,
    wallGap: 2,
    legDepth: 3,
  };
  for (const key of ["headEntry", "depthFit", "wallClearance"])
    assert(
      mod.getKeyholeTabsAuditValue({ key, label: key }, invalid, "mm", model)
        .status === "warn",
      `invalid ${key} is exposed as a warning`,
    );
  const s = mod.getKeyholeTabsSpec(defaults, model);
  assert(
    s.plateWidth < model.geometry.safeBuildPlateSpan &&
      s.plateDepth < model.geometry.safeBuildPlateSpan,
    "all eight fit conservative 250 mm print envelope",
  );
  const zip = spawnSync(
    "python3",
    [
      "-c",
      `import zipfile,xml.etree.ElementTree as E,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
m=E.fromstring(z.read('3D/3dmodel.model')); ns={'c':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
assert m.attrib['unit']=='millimeter'
objects=m.findall('c:resources/c:object',ns); items=m.findall('c:build/c:item',ns)
assert len(objects)==len(items)==8
bounds=[]
for obj,item in zip(objects,items):
 v=[tuple(float(a.attrib[k]) for k in ['x','y','z']) for a in obj.findall('c:mesh/c:vertices/c:vertex',ns)]
 assert v; assert min(a[2] for a in v)==0
 t=[float(a) for a in item.attrib['transform'].split()]; assert t[:9]==[1,0,0,0,1,0,0,0,1]
 b=[(min(a[k] for a in v)+t[9+k],max(a[k] for a in v)+t[9+k]) for k in range(3)]
 assert all(0<=b[k][0]<b[k][1]<=250 for k in [0,1]); bounds.append(b)
 for triangle in obj.findall('c:mesh/c:triangles/c:triangle',ns): assert all(0<=int(triangle.attrib[k])<len(v) for k in ['v1','v2','v3'])
for i,a in enumerate(bounds):
 for b in bounds[i+1:]: assert a[0][1]+1<=b[0][0] or b[0][1]+1<=a[0][0] or a[1][1]+1<=b[1][0] or b[1][1]+1<=a[1][0]
print('3MF: 8 mesh objects, mm units, grounded, separate, in-bounds')`,
      path.join(
        root,
        "public/models/keyhole-leveling-tabs/print/all_variants.3mf",
      ),
    ],
    { encoding: "utf8" },
  );
  assert(
    zip.status === 0,
    `3MF plate integrity: ${zip.status === 0 ? zip.stdout.trim() : zip.stderr}`,
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log(
  `${checks} assertions; ${failed ? "FAILED" : "passed"}. Physical validation remains pending.`,
);
if (failed) process.exitCode = 1;
