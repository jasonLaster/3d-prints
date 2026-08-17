import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/pipe-wall-mount/model.json");
const outputDirectory = path.join(root, "public/models/pipe-wall-mount");
const bundlePath = path.join(
  import.meta.dirname,
  `pipe-wall-mount-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/pipeWallMount.ts")],
    external: ["three"],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const {
    createPipeWallMountGeometry,
    orientPipeWallMountForPrint,
  } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
  const geometry = createPipeWallMountGeometry(params, model);
  const mesh = new THREE.Mesh(geometry);
  mesh.name = "variable-pipe-wall-mount-default";
  orientPipeWallMountForPrint(mesh, params, model);
  mesh.updateMatrixWorld(true);
  const result = new STLExporter().parse(mesh, { binary: true });
  const outputPath = path.join(outputDirectory, model.defaultStl.fileName);
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  console.log(`Generated ${path.relative(root, outputPath)}`);
  geometry.dispose();
} finally {
  fs.rmSync(bundlePath, { force: true });
}
