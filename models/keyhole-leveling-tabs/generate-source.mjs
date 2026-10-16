import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "public/models/keyhole-leveling-tabs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyhole-tabs-"));
const m = JSON.parse(fs.readFileSync(path.join(out, "model.json"), "utf8"));
const defaults = Object.fromEntries(
  m.parameters.map((p) => [p.key, p.default]),
);
try {
  const bundle = path.join(temp, "model.mjs");
  await build({
    entryPoints: [path.join(root, "src/models/keyholeLevelingTabs.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: bundle,
  });
  const mod = await import(pathToFileURL(bundle).href);
  fs.mkdirSync(path.join(out, "stl"), { recursive: true });
  fs.mkdirSync(path.join(out, "print"), { recursive: true });
  const exporter = new STLExporter();
  const objects = [];
  const items = [];
  for (let n = 1; n <= 8; n++) {
    const p = { ...defaults, variant: n };
    const g = mod.createKeyholeTabPrintGeometry(p, m);
    const mesh = new THREE.Mesh(g);
    mesh.updateMatrixWorld(true);
    const result = exporter.parse(mesh, { binary: true });
    fs.writeFileSync(
      path.join(out, "stl", mod.keyholeVariantName(n)),
      Buffer.from(result.buffer, result.byteOffset, result.byteLength),
    );
    const positions = g.getAttribute("position");
    const vertices = [],
      triangles = [],
      ids = new Map();
    for (let i = 0; i < positions.count; i += 3) {
      const indices = [];
      for (let j = 0; j < 3; j++) {
        const xyz = [
          positions.getX(i + j),
          positions.getY(i + j),
          positions.getZ(i + j),
        ].map((v) => (Math.abs(v) < 1e-7 ? 0 : Number(v.toFixed(6))));
        const key = xyz.join(",");
        if (!ids.has(key)) {
          ids.set(key, vertices.length);
          vertices.push(xyz);
        }
        indices.push(ids.get(key));
      }
      triangles.push(indices);
    }
    objects.push(
      `<object id="${n}" type="model" name="${n}-${mod.KEYHOLE_FRACTIONS[n - 1].replace("/", "-")}"><mesh><vertices>${vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${triangles.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("")}</triangles></mesh></object>`,
    );
    items.push(
      `<item objectid="${n}" transform="1 0 0 0 1 0 0 0 1 ${85 + ((n - 1) % 4) * 21} ${110 + Math.floor((n - 1) / 4) * 12} 0"/>`,
    );
    g.dispose();
  }
  fs.copyFileSync(path.join(out, "stl", mod.keyholeVariantName(defaults.variant)), path.join(out, m.stl.fileName));
  fs.mkdirSync(path.join(temp, "3D"));
  fs.mkdirSync(path.join(temp, "_rels"));
  fs.writeFileSync(
    path.join(temp, "3D/3dmodel.model"),
    `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">Keyhole leveling tabs - assumed dimensions - prototype</metadata><resources>${objects.join("")}</resources><build>${items.join("")}</build></model>`,
  );
  fs.writeFileSync(
    path.join(temp, "[Content_Types].xml"),
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
  );
  fs.writeFileSync(
    path.join(temp, "_rels/.rels"),
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
  );
  const zip = spawnSync(
    "python3",
    [
      "-c",
      "import zipfile,sys,pathlib; base=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.write(base/p,p) for p in ['[Content_Types].xml','_rels/.rels','3D/3dmodel.model']]; z.close()",
      temp,
      path.join(out, "print/all_variants.3mf"),
    ],
    { encoding: "utf8" },
  );
  if (zip.status !== 0) throw new Error(zip.stderr);
  fs.copyFileSync(
    path.join(root, "src/models/keyholeLevelingTabs.ts"),
    path.join(out, "keyholeLevelingTabs.ts"),
  );
  console.log(
    "Generated eight individual STLs and a geometry-only 3MF plate from the shared viewer model.",
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
