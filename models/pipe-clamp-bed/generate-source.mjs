import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "public/models/pipe-clamp-bed/model.json");
const bundlePath = path.join(
  os.tmpdir(),
  `pipe-clamp-bed-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

function writeStl(geometry, outputPath) {
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const result = new STLExporter().parse(mesh, { binary: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  geometry.dispose();
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/pipeClampBed.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const geometryModule = await import(
    `${pathToFileURL(bundlePath).href}?v=${Date.now()}`
  );
  writeStl(
    geometryModule.createPipeClampBedPrintGeometry(params, model),
    path.join(root, "public/models/pipe-clamp-bed/pipe-clamp-bed.stl"),
  );
  writeStl(
    geometryModule.createPipeClampBedFitCouponGeometry(params, model),
    path.join(
      root,
      "public/models/pipe-clamp-bed/pipe-clamp-bed-fit-coupon.stl",
    ),
  );
} finally {
  fs.rmSync(bundlePath, { force: true });
}
