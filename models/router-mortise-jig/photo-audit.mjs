import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const p = (key) => model.parameters.find((entry) => entry.key === key);
const assert = (condition, message) => { console.log(`${condition ? "PASS" : "FAIL"} ${message}`); if (!condition) process.exitCode = 1; };
function inspect(filePath) {
  const input = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position"); const edges = new Map(); let degenerate = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const key = (i) => [position.getX(i), position.getY(i), position.getZ(i)].map((v) => v.toFixed(4)).join(",");
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() <= 1e-10) degenerate += 1;
    for (const [u, v] of [[key(i), key(i + 1)], [key(i + 1), key(i + 2)], [key(i + 2), key(i)]]) { const edge = u < v ? `${u}|${v}` : `${v}|${u}`; edges.set(edge, (edges.get(edge) ?? 0) + 1); }
  }
  geometry.computeBoundingBox(); const size = geometry.boundingBox.getSize(new THREE.Vector3()); const min = geometry.boundingBox.min.clone();
  const result = { finite: Array.from(position.array).every(Number.isFinite), degenerate, nonManifold: [...edges.values()].filter((n) => n !== 2).length, size, min, triangles: position.count / 3 };
  geometry.dispose(); return result;
}
console.log(`Auditing ${model.name}`);
assert(model.parts.length === 10, "ten individual printable parts are registered");
for (const parameter of model.parameters) assert(parameter.default >= parameter.limits.min && parameter.default <= parameter.limits.max, `${parameter.key} default is inside limits`);
const openingW = p("mortiseWidth").default + p("guideBushingDiameter").default - p("routerBitDiameter").default + p("templateWiggle").default;
const openingL = p("mortiseLength").default + p("guideBushingDiameter").default - p("routerBitDiameter").default + p("templateWiggle").default;
const railWidth = (model.geometry.deckOverallWidth - openingW) / 2;
const support = (model.geometry.deckOverallWidth - p("routerBaseDiameter").default) / 2;
const sectionWidth = railWidth - model.geometry.boltSlotWidth * 2; const span = openingW;
const inertia = sectionWidth * model.geometry.deckRailThickness ** 3 / 12;
const deflection = model.geometry.screenLoadN * span ** 3 / (48 * model.geometry.screenModulusMpa * inertia);
const stress = model.geometry.screenLoadN * span * model.geometry.deckRailThickness / (8 * inertia);
const jawInnerGap = p("stockThickness").default + p("workpieceWiggle").default;
const jawFastenerY = jawInnerGap / 2 + model.geometry.jawInsertOffset;
const jawSlotMargin = model.geometry.railAdjustmentSlotLength / 2 - Math.abs(jawFastenerY - model.geometry.jawSlotStationY) - model.geometry.boltSlotWidth / 2;
const minJawFastenerY = p("stockThickness").limits.min / 2 + p("workpieceWiggle").limits.min / 2 + model.geometry.jawInsertOffset;
const maxJawFastenerY = p("stockThickness").limits.max / 2 + p("workpieceWiggle").limits.max / 2 + model.geometry.jawInsertOffset;
const minJawSlotMargin = Math.min(
  model.geometry.railAdjustmentSlotLength / 2 - Math.abs(minJawFastenerY - model.geometry.jawSlotStationY) - model.geometry.boltSlotWidth / 2,
  model.geometry.railAdjustmentSlotLength / 2 - Math.abs(maxJawFastenerY - model.geometry.jawSlotStationY) - model.geometry.boltSlotWidth / 2,
);
const presetMarkerPositions = model.geometry.presetWorkpieceWidthsMm.map((thickness) => thickness / 2 + p("workpieceWiggle").default / 2 + model.geometry.jawInsertOffset);
assert(openingW === 18.25 && openingL === 40.25, "default router travel is 18.25 × 40.25 mm");
assert(openingW > 0 && railWidth > 0, "top deck rails create the calculated mortise-width opening");
assert(jawInnerGap === 30.5, "lower L-jaws create a 30.5 mm gap for 30 mm stock");
assert(jawSlotMargin >= 0 && minJawSlotMargin >= 0, "lower-jaw screws remain inside deck-rail slots across the stock-thickness range");
assert(presetMarkerPositions.length === 6 && presetMarkerPositions.every((position) => Math.abs(position - model.geometry.jawSlotStationY) + model.geometry.markerWidth / 2 <= model.geometry.railAdjustmentSlotLength / 2), "six lower-jaw thickness witness ticks align with the adjustment slots");
assert(support >= model.geometry.minimumRouterSupportOverlap, "router base remains supported by both rails");
assert(Math.min(model.geometry.jawInsertOffset, model.geometry.jawFlangeWidth - model.geometry.jawInsertOffset) - p("insertPocketDiameter").default / 2 >= model.geometry.minimumInsertSideWall, "M5 insert pockets preserve L-jaw flange side walls");
assert(model.geometry.jawFlangeThickness - p("insertDepth").default >= model.geometry.minimumInsertFloor, "M5 insert pockets preserve a closed L-jaw flange floor");
assert(p("railScrewLength").default - model.geometry.deckRailThickness >= model.geometry.minimumInsertEngagement, "rail screws preserve insert engagement");
assert(deflection <= model.geometry.maximumScreenDeflection, `150 N screen deflection is ${deflection.toFixed(3)} mm`);
assert(model.geometry.screenAllowableStressMpa / stress >= model.geometry.minimumScreenSafetyFactor, `150 N stress margin is ${(model.geometry.screenAllowableStressMpa / stress).toFixed(1)}×`);
const expected = {
  "left-deck-rail": [260, railWidth, model.geometry.deckRailThickness], "right-deck-rail": [260, railWidth, model.geometry.deckRailThickness],
  "front-stop": [70, 210, model.geometry.crossStopThickness], "rear-stop": [70, 210, model.geometry.crossStopThickness],
  "left-thickness-jaw": [220, model.geometry.jawFlangeWidth, model.geometry.jawDepth], "right-thickness-jaw": [220, model.geometry.jawFlangeWidth, model.geometry.jawDepth],
  "positioning-bridge": [70, 54, 8], "centering-base": [260, 180, 12], "centering-left-fence": [180, 16, 34], "centering-right-fence": [180, 16, 34]
};
for (const part of model.parts) {
  const filePath = path.join(root, "public", part.url.replace(/^\/+/, "")); assert(fs.existsSync(filePath), `${part.label} STL exists`); if (!fs.existsSync(filePath)) continue;
  const info = inspect(filePath); assert(info.finite && info.degenerate === 0, `${part.label} has finite, nondegenerate triangles`); assert(info.nonManifold === 0, `${part.label} is watertight and manifold`); assert(Math.abs(info.min.z) <= model.audit.toleranceMm, `${part.label} rests on Z=0`);
  expected[part.key].forEach((target, axis) => assert(Math.abs(info.size.getComponent(axis) - target) <= model.audit.toleranceMm, `${part.label} ${"XYZ"[axis]} envelope matches`)); assert(info.triangles >= 50, `${part.label} retains fabrication detail`);
}
if (!process.exitCode) console.log(`${model.name} audit complete`);
