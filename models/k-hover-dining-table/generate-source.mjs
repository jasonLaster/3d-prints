import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Mesh } from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(
  root,
  "public/models/k-hover-dining-table/model.json",
);
const outputPath = path.join(
  root,
  "public/models/k-hover-dining-table/k-hover-dining-table.stl",
);
const bundlePath = path.join(
  os.tmpdir(),
  `k-hover-dining-table-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/hoverDiningTable.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createHoverDiningTableGeometry } = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const geometry = createHoverDiningTableGeometry(params, model);
  const result = new STLExporter().parse(new Mesh(geometry), { binary: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}
