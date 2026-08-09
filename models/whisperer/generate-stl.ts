import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { createWhispererTableWoodGeometry } from "../../src/models/whispererTable";

const root = process.cwd();
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/whisperer/model.json"), "utf8"),
);
const params = Object.fromEntries(
  model.parameters.map((parameter: { key: string; default: number }) => [
    parameter.key,
    parameter.default,
  ]),
);
const geometry = createWhispererTableWoodGeometry(params);
const mesh = new THREE.Mesh(geometry);
mesh.name = "whisperer-default";
mesh.updateMatrixWorld(true);
const output = new STLExporter().parse(mesh, { binary: true });
fs.writeFileSync(
  path.join(root, "public/models/whisperer/whisperer.stl"),
  Buffer.from(output.buffer, output.byteOffset, output.byteLength),
);
geometry.dispose();
