import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(
  root,
  "public/models/whisperer/model.json",
);
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
);
const inch = 25.4;
const close = (actual, expected, label, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );

assert.equal(model.id, "whisperer");
assert.equal(model.name, "Whisperer");
assert.equal(model.viewer, "dining-table-v1");
assert.equal(model.geometry.channelCount, 0);
assert.equal(model.geometry.legSplayDegrees, 15);
assert.equal(model.geometry.longApronEndAngleDegrees, 18);
assert.equal(model.geometry.sideApronEdgeAngleDegrees, 15);
assert.equal(model.geometry.sideApronBottomChamferDegrees, 30);
close(params.tableLength, 72 * inch, "table length");
close(params.tableWidth, 40 * inch, "table width");
close(params.overallHeight, 30 * inch, "overall height");
close(params.topThickness, 1.75 * inch, "top thickness");
close(params.topEdgeThickness, 0.5 * inch, "top perimeter thickness");
close(params.undersideBevelInset, 5 * inch, "top bevel inset");
close(params.legTopWidth, 4 * inch, "leg top width");
close(params.legFootWidth, 2.375 * inch, "leg foot width");
close(params.legThickness, 1.75 * inch, "leg thickness");
close(params.legFootChamfer, 0.5 * inch, "leg foot chamfer");
close(params.longApronLength, 52.25 * inch, "long apron length");
close(params.longApronHeight, 3.5 * inch, "long apron height");
close(params.sideApronLength, 25.5 * inch, "side apron length");
close(params.sideApronHeight, 4 * inch, "side apron height");
close(params.apronThickness, 1.5 * inch, "apron thickness");
close(params.apronSetback, 0.25 * inch, "apron setback");

const verticalLegHeight = params.overallHeight - params.topThickness;
const legBlankLength =
  verticalLegHeight / Math.cos((model.geometry.legSplayDegrees * Math.PI) / 180);
close(legBlankLength, 29.25 * inch, "derived leg blank length", 0.1);
assert.ok(params.topEdgeThickness < params.topThickness);
assert.ok(params.undersideBevelInset * 2 < params.tableWidth);
assert.ok(params.legFootWidth < params.legTopWidth);
assert.ok(params.legFootChamfer * 2 < params.legThickness);
assert.ok(params.apronThickness <= params.legThickness);
assert.ok(params.longApronLength + params.legTopWidth < params.tableLength);
assert.ok(params.sideApronLength + params.legThickness < params.tableWidth);

const splayRun = verticalLegHeight * Math.tan((15 * Math.PI) / 180);
const topLegCenter = params.longApronLength / 2;
const outerFoot = topLegCenter + splayRun + params.legFootWidth / 2;
assert.ok(outerFoot <= params.tableLength / 2, "feet must remain inside the top plan");

const mockEnvelope = [
  params.tableLength / params.mockScale,
  params.tableWidth / params.mockScale,
  params.overallHeight / params.mockScale,
];
assert.ok(mockEnvelope[0] <= 256, "default mock length must fit a 256 mm bed");
assert.ok(mockEnvelope[1] <= 256, "default mock width must fit a 256 mm bed");
assert.ok(params.apronSetback / params.mockScale >= 0.3);

const source = fs.readFileSync(
  path.join(root, "src/models/whispererTable.ts"),
  "utf8",
);
for (const required of [
  "createWhispererTableWoodGeometry",
  "createWhispererTopGeometry",
  "createWhispererLegGeometry",
  "createLongApronGeometry",
  "createSideApronGeometry",
  "LEG_SPLAY_RADIANS",
]) {
  assert.ok(source.includes(required), `procedural source is missing ${required}`);
}

console.log(
  `whisperer audit passed: 72 × 40 × 30 in full size, 1:${params.mockScale} mock ${mockEnvelope.map((value) => value.toFixed(1)).join(" × ")} mm`,
);
