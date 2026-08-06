import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/concentric-tube-jig/model.json");
const outputPath = path.join(root, "public/models/concentric-tube-jig/concentric-tube-jig.stl");
const bundlePath = path.join(os.tmpdir(), `concentric-tube-jig-${process.pid}-${Date.now()}.mjs`);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(model.parameters.map((parameter) => [parameter.key, parameter.default]));

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/concentricTubeJig.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createConcentricTubeJigGeometry } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const geometry = createConcentricTubeJigGeometry(params, model);
  const mesh = new (await import("three")).Mesh(geometry);
  const result = new STLExporter().parse(mesh, { binary: true });
  fs.writeFileSync(outputPath, Buffer.from(result.buffer, result.byteOffset, result.byteLength));
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}
