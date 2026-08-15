import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/router-mortise-jig/photo-model.json");
const bundlePath = path.join(
  os.tmpdir(),
  `router-mortise-jig-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/routerMortiseJigPhoto.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createRouterMortiseJigPartGeometries } = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const parts = createRouterMortiseJigPartGeometries(params, model);
  const exporter = new STLExporter();

  for (const part of parts) {
    const definition = model.parts.find((candidate) => candidate.key === part.key);
    if (!definition) throw new Error(`Missing part definition for ${part.key}`);
    const mesh = new THREE.Mesh(part.geometry);
    mesh.name = `${model.id}-${part.key}`;
    mesh.updateMatrixWorld(true);
    const result = exporter.parse(mesh, { binary: true });
    const outputPath = path.join(root, "public/models/router-mortise-jig", definition.fileName);
    fs.writeFileSync(
      outputPath,
      Buffer.from(result.buffer, result.byteOffset, result.byteLength),
    );
    part.geometry.dispose();
    console.log(`Generated ${path.relative(root, outputPath)}`);
  }
} finally {
  fs.rmSync(bundlePath, { force: true });
}
