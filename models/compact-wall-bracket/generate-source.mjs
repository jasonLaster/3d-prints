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
  "public/models/compact-wall-bracket/model.json",
);
const outputDirectory = path.join(
  root,
  "public/models/compact-wall-bracket",
);
const bundlePath = path.join(
  os.tmpdir(),
  `compact-wall-bracket-${process.pid}-${Date.now()}.mjs`,
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);

function writeBinaryStl(object, outputPath) {
  object.updateMatrixWorld(true);
  const result = new STLExporter().parse(object, { binary: true });
  fs.writeFileSync(
    outputPath,
    Buffer.from(result.buffer, result.byteOffset, result.byteLength),
  );
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

try {
  await build({
    bundle: true,
    entryPoints: [path.join(root, "src/models/compactWallBracket.ts")],
    format: "esm",
    outfile: bundlePath,
    platform: "node",
  });
  const {
    createCompactWallBracketGeometry,
    createCompactWallBracketTwoUpGeometries,
  } = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);

  const singleGeometry = createCompactWallBracketGeometry(params, model);
  const singleMesh = new THREE.Mesh(singleGeometry);
  writeBinaryStl(
    singleMesh,
    path.join(outputDirectory, model.stl.fileName),
  );

  const pairGroup = new THREE.Group();
  const pairGeometries = createCompactWallBracketTwoUpGeometries(params, model);
  pairGeometries.forEach((geometry, index) => {
    const mesh = new THREE.Mesh(geometry);
    mesh.name = `compact-wall-bracket-${index === 0 ? "left" : "right"}`;
    pairGroup.add(mesh);
  });
  writeBinaryStl(
    pairGroup,
    path.join(outputDirectory, model.twoUpStl.fileName),
  );

  singleGeometry.dispose();
  pairGeometries.forEach((geometry) => geometry.dispose());
} finally {
  fs.rmSync(bundlePath, { force: true });
}
