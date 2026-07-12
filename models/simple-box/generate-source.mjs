import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(directory, "../../public/models/simple-box/simple-box.stl");
const length = 330.2;
const width = 76.2;
const height = 88.9;
const wall = 2.6;
const floor = 2.6;
const x0 = -length / 2;
const x1 = length / 2;
const y0 = -width / 2;
const y1 = width / 2;
const ix0 = x0 + wall;
const ix1 = x1 - wall;
const iy0 = y0 + wall;
const iy1 = y1 - wall;
const vertices = [];
const point = (x, y, z) => [x, y, z];
const triangle = (a, b, c) => vertices.push(...a, ...b, ...c);
const quad = (a, b, c, d) => {
  triangle(a, b, c);
  triangle(a, c, d);
};

// Outer bottom and walls.
quad(point(x0, y0, 0), point(x0, y1, 0), point(x1, y1, 0), point(x1, y0, 0));
quad(point(x0, y0, 0), point(x1, y0, 0), point(x1, y0, height), point(x0, y0, height));
quad(point(x1, y0, 0), point(x1, y1, 0), point(x1, y1, height), point(x1, y0, height));
quad(point(x1, y1, 0), point(x0, y1, 0), point(x0, y1, height), point(x1, y1, height));
quad(point(x0, y1, 0), point(x0, y0, 0), point(x0, y0, height), point(x0, y1, height));

// Interior floor and walls.
quad(point(ix0, iy0, floor), point(ix1, iy0, floor), point(ix1, iy1, floor), point(ix0, iy1, floor));
quad(point(ix0, iy0, floor), point(ix0, iy0, height), point(ix1, iy0, height), point(ix1, iy0, floor));
quad(point(ix1, iy0, floor), point(ix1, iy0, height), point(ix1, iy1, height), point(ix1, iy1, floor));
quad(point(ix1, iy1, floor), point(ix1, iy1, height), point(ix0, iy1, height), point(ix0, iy1, floor));
quad(point(ix0, iy1, floor), point(ix0, iy1, height), point(ix0, iy0, height), point(ix0, iy0, floor));

// Top rim closes the wall shell.
quad(point(x0, y0, height), point(x1, y0, height), point(ix1, iy0, height), point(ix0, iy0, height));
quad(point(x1, y0, height), point(x1, y1, height), point(ix1, iy1, height), point(ix1, iy0, height));
quad(point(x1, y1, height), point(x0, y1, height), point(ix0, iy1, height), point(ix1, iy1, height));
quad(point(x0, y1, height), point(x0, y0, height), point(ix0, iy0, height), point(ix0, iy1, height));

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
geometry.computeVertexNormals();
const mesh = new THREE.Mesh(geometry);
mesh.name = "simple-box-watertight-shell";
fs.writeFileSync(output, new STLExporter().parse(mesh));
console.log(`Wrote one-shell STL with ${vertices.length / 9} triangles to ${output}`);
