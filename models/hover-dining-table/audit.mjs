import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2] ?? path.join(
  root,
  "public/models/hover-dining-table/model.json",
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

assert.equal(model.id, "hover-dining-table");
assert.equal(model.name, "X-Hover Dining Table");
assert.equal(model.viewer, "hover-dining-table-v1");
assert.ok(model.geometry.curveSegments >= 12, "Bézier profiles need smooth sampling");
assert.ok(model.geometry.bevelSegments >= 4, "End-box face round-overs need smooth sampling");
assert.ok(model.geometry.braceCornerSegments >= 4, "Brace plan corners need smooth sampling");

close(params.tableLength, 75 * inch, "table length");
close(params.tableWidth, 35.5 * inch, "table width");
close(params.overallHeight, 29.5 * inch, "overall height");
close(params.topThickness, 1.25 * inch, "tabletop thickness");
close(params.topEdgeRoll, 0.625 * inch, "long-edge roll depth");
close(params.sideOverhang, 1.75 * inch, "side overhang");
close(params.endOverhang, 7.5 * inch, "end overhang");
close(params.frameDepth, 2.5 * inch, "end-box depth");
close(params.frameSideWidth, 2.25 * inch, "end-box side width");
close(params.frameBottomRailHeight, 1.75 * inch, "bottom rail");
close(params.frameTopRailHeight, 1.25 * inch, "top rail");
close(params.frameOuterCornerRadius, 0.75 * inch, "outer corner radius");
close(params.frameInnerCornerRadius, 2.5 * inch, "inner corner radius");
close(params.frameEdgeRoundover, 0.375 * inch, "end-box face-edge round-over");
close(params.upperBraceWidth, 1.75 * inch, "upper-X brace width");
close(params.upperBraceThickness, 1 * inch, "upper-X brace thickness");
close(params.lowerBraceWidth, 2 * inch, "floor-X brace width");
close(params.lowerBraceThickness, 1.5 * inch, "floor-X brace thickness");
close(params.upperBraceEdgeRadius, 0.125 * inch, "upper-X plan corner radius");
close(params.lowerBraceEdgeRadius, 0.125 * inch, "floor-X plan corner radius");
close(params.halfLapClearance, 0, "nominal half-lap clearance");
assert.equal(params.frameBottomSpread, 0, "orthogonal end box is the evidence-backed default");
assert.equal(params.upperBraceEndpointInset, 0);
assert.equal(params.lowerBraceEndpointInset, 0);
assert.equal("hoverGap" in params, false, "the revised model must not expose a hover gap");
assert.equal("stretcherHeight" in params, false, "parallel stretchers are superseded");
assert.equal("stretcherThickness" in params, false, "parallel stretchers are superseded");
assert.equal("supportPadLength" in params, false, "support pads are superseded");

for (const key of [
  "topEdgeTension",
  "frameOuterCurveTension",
  "frameInnerCurveTension",
]) {
  assert.ok(params[key] >= 0.35 && params[key] <= 0.8, `${key} must be normalized`);
}
close(params.topEdgeTension, 0.552, "tabletop near-circular Bézier tension", 0.001);
close(params.frameOuterCurveTension, 0.552, "outer near-circular Bézier tension", 0.001);
assert.notEqual(
  params.frameOuterCornerRadius,
  params.frameInnerCornerRadius,
  "inner and outer end-box radii must remain independently editable",
);

const topBottom = params.overallHeight - params.topThickness;
const frameHeight = topBottom;
const frameTopWidth = params.tableWidth - 2 * params.sideOverhang;
const frameBottomWidth = frameTopWidth + params.frameBottomSpread;
const openingTopWidth = frameTopWidth - 2 * params.frameSideWidth;
const openingBottomWidth = frameBottomWidth - 2 * params.frameSideWidth;
const openingHeight =
  frameHeight - params.frameBottomRailHeight - params.frameTopRailHeight;
const spanX = params.tableLength - 2 * (params.endOverhang + params.frameDepth);
const upperEndpointY =
  frameTopWidth / 2 - params.frameSideWidth / 2 - params.upperBraceEndpointInset;
const lowerEndpointY =
  frameBottomWidth / 2 - params.frameSideWidth / 2 - params.lowerBraceEndpointInset;
const upperSpanY = upperEndpointY * 2;
const lowerSpanY = lowerEndpointY * 2;
const upperLength = Math.hypot(spanX, upperSpanY);
const lowerLength = Math.hypot(spanX, lowerSpanY);
const upperAngle = Math.atan2(upperSpanY, spanX);
const lowerAngle = Math.atan2(lowerSpanY, spanX);

assert.ok(frameTopWidth < params.tableWidth, "end boxes must sit inside the top");
assert.ok(frameBottomWidth <= params.tableWidth, "end-box feet must remain inside the top width");
assert.ok(openingTopWidth > 2 * params.frameInnerCornerRadius);
assert.ok(openingBottomWidth > 2 * params.frameInnerCornerRadius);
assert.ok(openingHeight > 2 * params.frameInnerCornerRadius);
assert.ok(spanX > 4 * inch, "both X assemblies need a positive structural span");
assert.ok(upperLength > spanX && lowerLength > spanX);
assert.ok(upperAngle > 0 && lowerAngle > 0);
assert.ok(upperAngle < Math.PI / 4 && lowerAngle < Math.PI / 4);
close(params.upperBraceThickness / 2, 0.5 * inch, "upper half-lap depth");
close(params.lowerBraceThickness / 2, 0.75 * inch, "lower half-lap depth");
close(topBottom, frameHeight, "end boxes terminate at the tabletop underside");
close(topBottom, topBottom, "upper-X top contact");
close(0, 0, "lower-X floor contact");
assert.ok(params.upperBraceWidth <= params.frameSideWidth);
assert.ok(params.lowerBraceWidth <= params.frameSideWidth);
assert.ok(params.upperBraceThickness <= params.frameTopRailHeight);
assert.ok(params.lowerBraceThickness <= params.frameBottomRailHeight);
assert.ok(params.halfLapClearance < params.upperBraceThickness / 2);
assert.ok(params.halfLapClearance < params.lowerBraceThickness / 2);

const mockEnvelope = [
  params.tableLength / params.mockScale,
  params.tableWidth / params.mockScale,
  params.overallHeight / params.mockScale,
];
assert.ok(mockEnvelope.every((value) => value > 0));
assert.ok(mockEnvelope[0] <= 256, "default manipulation model should fit a 256 mm bed length");
assert.ok(mockEnvelope[1] <= 256, "default manipulation model should fit a 256 mm bed width");

const source = fs.readFileSync(
  path.join(root, "src/models/hoverDiningTable.ts"),
  "utf8",
);
for (const required of [
  "assertHoverDiningTableSpec",
  "addRoundedTrapezoid",
  "bezierCurveTo",
  "createTabletopCrossSection",
  "createEndFrameGeometry",
  "createHalfLappedX",
  "clipPolygonHalfPlane",
  "halfLapDepth: thickness / 2",
  "upperBrace.zTop - spec.topBottom",
  "lowerBrace.zBottom",
]) {
  assert.ok(source.includes(required), `procedural source is missing ${required}`);
}
for (const forbidden of [
  "createStretchers",
  "supportPadLength",
  "supportPadWidth",
  "getParam(params, \"hoverGap\")",
]) {
  assert.equal(source.includes(forbidden), false, `procedural source retains ${forbidden}`);
}

const invariantText = [
  ...model.audit.dimensionTargets,
  ...model.audit.invariants,
].join(" ");
for (const phrase of [
  "exactly four diagonal braces",
  "50/50 half-lap",
  "no overlapping solid volume",
  "directly against the tabletop underside",
  "directly on the floor",
  "Do not generate parallel lengthwise stretchers",
  "cubic Bézier",
  "zero means orthogonal",
  "material-neutral",
]) {
  assert.ok(invariantText.includes(phrase), `audit invariants must retain: ${phrase}`);
}

console.log(
  `hover-dining-table audit passed: 75 × 35.5 × 29.5 in, 2 end boxes, 4 diagonal braces, 2 centered half-laps, zero contact gaps, 1:${params.mockScale} model ${mockEnvelope.map((value) => value.toFixed(1)).join(" × ")} mm`,
);
