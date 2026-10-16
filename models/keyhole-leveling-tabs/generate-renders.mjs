// Render actual CAD meshes through Bambu Studio CLI; no browser automation.
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "public/models/keyhole-leveling-tabs/renders");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keyhole-cad-renders-"));
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/keyhole-leveling-tabs/model.json"),
    "utf8",
  ),
);
const params = Object.fromEntries(
  model.parameters.map((p) => [p.key, p.default]),
);
const cli =
  process.env.BAMBUSTUDIO_BIN ??
  "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio";
try {
  await build({
    entryPoints: [path.join(root, "src/models/keyholeLevelingTabs.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: path.join(temp, "model.mjs"),
  });
  const mod = await import(pathToFileURL(path.join(temp, "model.mjs")).href);
  const installedParts = [
    mod.createKeyholeTabPrintGeometry(params, model),
    ...mod
      .createKeyholeTabsPreviewParts({ ...params, previewMode: 2 }, model)
      .map((p) => (p.geometry.index ? p.geometry.toNonIndexed() : p.geometry)),
  ];
  installedParts.forEach((g) => g.deleteAttribute("uv"));
  const installed = mergeGeometries(installedParts, false);
  installedParts.forEach((g) => g.dispose());
  const sources = [
    ["selected", mod.createKeyholeTabPrintGeometry(params, model)],
    [
      "variants",
      mod.createKeyholeTabsGeometry({ ...params, previewMode: 1 }, model),
    ],
    ["installed", installed],
    ["cross_section", installed.clone(), 3],
  ];
  fs.mkdirSync(out, { recursive: true });
  for (const [name, geometry, view = 0] of sources) {
    geometry.rotateZ(Math.PI); // Show the inward-facing leg with the fixed ISO camera.
    geometry.computeBoundingBox();
    const pos = geometry.getAttribute("position"),
      vertices = [],
      triangles = [],
      ids = new Map();
    for (let i = 0; i < pos.count; i += 3) {
      const indices = [];
      for (let j = 0; j < 3; j++) {
        const xyz = [pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)].map(
          (v) => (Math.abs(v) < 1e-7 ? 0 : Number(v.toFixed(6))),
        );
        const key = xyz.join(",");
        if (!ids.has(key)) {
          ids.set(key, vertices.length);
          vertices.push(xyz);
        }
        indices.push(ids.get(key));
      }
      triangles.push(indices);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${triangles.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("")}</triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 125 125 ${Math.max(0, -geometry.boundingBox.min.z)}"/></build></model>`;
    const dir = path.join(temp, name);
    fs.mkdirSync(dir);
    const xmlFile = path.join(dir, "model.xml");
    fs.writeFileSync(xmlFile, xml);
    const plate = path.join(dir, "preview.3mf");
    const zipped = spawnSync(
      "python3",
      [
        "-c",
        `import zipfile,sys
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 z.write(sys.argv[1],'3D/3dmodel.model')
 z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
 z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')`,
        xmlFile,
        plate,
      ],
      { encoding: "utf8" },
    );
    if (zipped.status !== 0) throw Error(zipped.stderr);
    const rendered = spawnSync(
      cli,
      [
        "--export-png",
        "1",
        "--camera-view",
        String(view),
        "--arrange",
        "0",
        "--orient",
        "0",
        `--outputdir=${dir}`,
        plate,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    const png = path.join(dir, `plate_1_${view}.png`);
    if (rendered.status !== 0 || !fs.existsSync(png))
      throw Error(rendered.stdout + rendered.stderr);
    fs.copyFileSync(png, path.join(out, `${name}.png`));
    geometry.dispose();
  }
  console.log(
    "Rendered selected tab, all eight and installed section from current CAD meshes with Bambu Studio CLI.",
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
