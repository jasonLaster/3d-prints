import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/door-lock-adapter/model.json");
const outputPath = path.join(
  root,
  "public/models/door-lock-adapter/door-lock-adapter.stl",
);
const bundlePath = path.join(
  os.tmpdir(),
  `door-lock-adapter-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/doorLockAdapter.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const { createDoorLockAdapterGeometry } = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  const geometry = createDoorLockAdapterGeometry(params, model);
  const mesh = new (await import("three")).Mesh(geometry);
  const result = new STLExporter().parse(mesh, { binary: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  fs.rmSync(bundlePath, { force: true });
}
