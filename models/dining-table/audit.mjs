import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(root, "public/models/dining-table/model.json");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const params = Object.fromEntries(model.parameters.map((parameter) => [parameter.key, parameter.default]));
const inch = 25.4;
const close = (actual, expected, label, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);

assert.equal(model.id, "dining-table");
assert.equal(model.name, "Plate Table");
assert.equal(model.viewer, "dining-table-v1");
assert.equal(model.geometry.channelCount, 3);
close(params.tableLength, 76 * inch, "table length");
close(params.tableWidth, 38 * inch, "table width");
close(params.topThickness, 1.5 * inch, "top thickness");
close(params.overallHeight, 30 * inch, "overall height");
close(params.legSize, 4 * inch, "leg size");
close(params.tabletopCornerRadius, inch, "tabletop corner radius");
close(params.legCornerRadius, inch, "other three post corner radii");
close(params.legOuterCornerRadius, inch, "outer post corner radius");
close(params.topRoundoverRadius, 0.5 * inch, "top roundover");
close(params.bottomRoundoverRadius, 0.5 * inch, "bottom roundover");
close(params.topThickness - params.topRoundoverRadius - params.bottomRoundoverRadius, 0.5 * inch, "flat edge band");
assert.equal(params.legGrooveEnabled, 1, "post-top groove should be enabled by default");
close(params.legGrooveHeight, 0.25 * inch, "post groove height");
close(params.legGrooveDepth, 0.125 * inch, "post groove depth");
close(params.legTopRoundoverRadius, 0.25 * inch, "leg top roundover");
close(params.legBottomRoundoverRadius, 0.25 * inch, "leg bottom roundover");
assert.equal(params.levelingFeetEnabled, 1, "independent leveling feet should be enabled by default");
close(params.levelingFootPadDiameter, 1.5 * inch, "leveling-foot pad diameter");
close(params.levelingFootPadThickness, 0.25 * inch, "leveling-foot pad thickness");
close(params.levelingFootRodDiameter, 0.375 * inch, "leveling-foot rod diameter");
close(params.levelingFootRodLength, 3 * inch, "leveling-foot rod length");
for (const key of [
  "levelingFootExtensionLeftFront",
  "levelingFootExtensionLeftRear",
  "levelingFootExtensionRightFront",
  "levelingFootExtensionRightRear",
]) {
  close(params[key], 0.75 * inch, `${key} default extension`);
  assert.ok(params[key] >= params.levelingFootPadThickness, `${key} must expose the whole pad`);
  assert.ok(
    params.levelingFootRodLength - (params[key] - params.levelingFootPadThickness) >=
      Math.max(2 * params.levelingFootRodDiameter, inch),
    `${key} must preserve threaded embedment`,
  );
}
close(params.plateSize, 6 * inch, "plate size");
close(params.plateThickness, 0.25 * inch, "plate thickness");
close(params.plateEdgeInset, 0.5 * inch, "plate edge setback");
close(params.channelPosition1, 16 * inch, "first channel position");
close(params.channelPosition2, 38 * inch, "second channel position");
close(params.channelPosition3, 60 * inch, "third channel position");
assert.ok(params.channelPosition1 < params.channelPosition2);
assert.ok(params.channelPosition2 < params.channelPosition3);
assert.ok(params.channelLength <= params.tableWidth);
assert.ok(params.channelDepth <= params.topThickness);
assert.ok(params.plateSize >= params.legSize);
assert.ok(params.plateEdgeInset > 0);
assert.ok(params.plateEdgeInset < params.legSize);
assert.ok(params.legGrooveDepth < params.legSize / 2, "post groove must preserve a bearing face");
assert.ok(
  params.legGrooveHeight + params.legTopRoundoverRadius + params.legBottomRoundoverRadius <
    params.overallHeight - params.topThickness,
  "post groove and roundovers must fit within the leg height",
);

const mockEnvelope = [
  params.tableLength / params.mockScale,
  params.tableWidth / params.mockScale,
  params.overallHeight / params.mockScale,
];
assert.ok(mockEnvelope[0] <= 256, "default mock length must fit a 256 mm bed");
assert.ok(mockEnvelope[1] <= 256, "default mock width must fit a 256 mm bed");
assert.ok(params.legTopRoundoverRadius / params.mockScale >= 0.3, "top post roundover must survive the default print scale");
assert.ok(params.legBottomRoundoverRadius / params.mockScale >= 0.3, "bottom post roundover must survive the default print scale");
assert.ok(params.legGrooveDepth / params.mockScale >= 0.3, "post groove must survive the default print scale");
assert.ok(params.levelingFootPadThickness / params.mockScale >= 0.3, "foot pad must survive the default print scale");
assert.ok(params.levelingFootRodDiameter / params.mockScale >= 0.3, "foot rod must survive the default print scale");

const source = fs.readFileSync(path.join(root, "src/models/diningTable.ts"), "utf8");
for (const required of [
  "createDiningTableWoodGeometry",
  "createDiningTableHardwareGeometries",
  "createRoundedLoft",
  "legLayers",
  "outerCornerIndex",
  "channelPosition${index}",
  "getDiningTableStructuralAssessment",
  "plateEngagementFactor",
  "channelTorsionFactor",
  "getPlateTableLevelingFeetSpec",
  "leveling-foot geometry",
]) {
  assert.ok(source.includes(required), `procedural source is missing ${required}`);
}

for (const invariant of [
  "geometry-only structural screen",
  "increasing overall height cannot improve",
  "all four pads on the floor reference",
]) {
  assert.ok(
    model.audit.invariants.some((entry) => entry.includes(invariant)),
    `model audit invariants are missing ${invariant}`,
  );
}

const structuralSpec = fs.readFileSync(
  path.join(root, "docs/dining-table-audit-specifications.md"),
  "utf8",
);
for (const heading of [
  "Apronless post racking",
  "Plate-joint leverage",
  "Tabletop torsional rigidity",
  "Tipping margin",
  "Floor rocking tolerance",
  "Member stiffness",
  "Overall weighting and grades",
  "Independent leveling feet",
]) {
  assert.ok(structuralSpec.includes(`### ${heading}`), `structural spec is missing ${heading}`);
}

console.log(
  `dining-table audit passed: 76 × 38 × 30 in full size, 1:${params.mockScale} mock ${mockEnvelope.map((value) => value.toFixed(1)).join(" × ")} mm`,
);
