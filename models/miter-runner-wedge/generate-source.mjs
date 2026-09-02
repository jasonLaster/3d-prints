import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(
  root,
  "public/models/miter-runner-wedge/model.json",
);
const outputPath = path.join(
  root,
  "public/models/miter-runner-wedge/miter-runner-wedge.stl",
);
const bundlePath = path.join(
  os.tmpdir(),
  `miter-runner-wedge-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/miterRunnerWedge.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const geometryModule = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const geometry = geometryModule.createMiterRunnerWedgeGeometry(params, model);
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
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
