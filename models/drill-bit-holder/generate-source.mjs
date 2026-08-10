import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/drill-bit-holder/model.json");
const outputPath = path.join(root, "public/models/drill-bit-holder/drill-bit-holder.stl");
const bundlePath = path.join(os.tmpdir(), `drill-bit-holder-${process.pid}-${Date.now()}.mjs`);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/drillBitHolder.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createDrillBitHolderGeometry } = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const geometry = createDrillBitHolderGeometry(params, model);
  const mesh = new THREE.Mesh(geometry);
  mesh.name = "drill-bit-holder-seven-bit-index";
  const result = new STLExporter().parse(mesh, { binary: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}
