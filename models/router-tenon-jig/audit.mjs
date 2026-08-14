import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const configPath = path.resolve(process.argv[2] ?? "");
const model = JSON.parse(fs.readFileSync(configPath, "utf8"));
const root = path.resolve(path.dirname(configPath), "../../..");
const parameter = (key) => model.parameters.find((entry) => entry.key === key);
const assert = (condition, message) => {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) process.exitCode = 1;
};

function stlInfo(filePath) {
  const input = fs.readFileSync(filePath);
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let degenerate = 0;
  const vertexKey = (index) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() <= 1e-10) {
      degenerate += 1;
    }
    for (const [start, end] of [
      [vertexKey(index), vertexKey(index + 1)],
      [vertexKey(index + 1), vertexKey(index + 2)],
      [vertexKey(index + 2), vertexKey(index)],
    ]) {
      const edge = start < end ? `${start}|${end}` : `${end}|${start}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const min = geometry.boundingBox.min.clone();
  const finite = Array.from(position.array).every(Number.isFinite);
  const nonManifoldEdges = [...edges.values()].filter((count) => count !== 2).length;
  geometry.dispose();
  return { degenerate, finite, min, nonManifoldEdges, size, triangles: position.count / 3 };
}

console.log(`Auditing ${model.name}`);
assert(model.id === "router-tenon-jig", "model id is router-tenon-jig");
assert(model.viewer === "router-tenon-jig-v1", "viewer is supported");
assert(model.parts.length === 5, "five individual printable parts are registered");
assert(model.presets.length === 4, "four common tenon presets are registered");
assert(
  model.geometry.presetTenonThicknessesMm.join(",") === "6,8,10,12" &&
    model.geometry.presetTenonWidthsMm.join(",") === "30,40,50,60",
  "thickness and width witness marks are defined",
);

for (const entry of model.parameters) {
  assert(entry.default >= entry.limits.min && entry.default <= entry.limits.max, `${entry.key} default is inside limits`);
}

const tenonThickness = parameter("tenonThickness").default;
const tenonWidth = parameter("tenonWidth").default;
const cutter = parameter("routerCutterDiameter").default;
const bearing = parameter("guideBearingDiameter").default;
const allowance = parameter("tenonAllowance").default;
const openingThickness = tenonThickness - bearing + cutter + allowance;
const openingWidth = tenonWidth - bearing + cutter + allowance;
const shoulderFace = (parameter("workpieceThickness").default - tenonThickness) / 2;
const shoulderEdge = (parameter("workpieceWidth").default - tenonWidth) / 2;
const insertDepth = parameter("insertDepth").default;
const baseThickness = parameter("baseThickness").default;
const guideThickness = parameter("guidePlateThickness").default;
const screwLength = parameter("knobScrewLength").default;
const routerBaseDiameter = parameter("routerBaseDiameter").default;
const screwEngagement =
  screwLength - model.geometry.washerThickness - guideThickness;
const screwTipClearance = insertDepth - screwEngagement;
const cornerX = model.geometry.verticalRecessWidth / 2;
const cornerY = model.geometry.horizontalRecessWidth / 2;
const routerCenters = [
  { x: openingWidth / 2 + bearing / 2, y: 0 },
  { x: 0, y: openingThickness / 2 + bearing / 2 },
];
const supportOverlaps = routerCenters.map(
  ({ x, y }) =>
    routerBaseDiameter / 2 -
    Math.hypot(
      Math.max(0, cornerX - Math.abs(x)),
      Math.max(0, cornerY - Math.abs(y)),
    ),
);
const effectiveBeamWidth =
  (model.geometry.baseWidth - model.geometry.throatThickness) / 2 -
  parameter("insertPocketDiameter").default;
const beamMoment = (effectiveBeamWidth * baseThickness ** 3) / 12;
const baseDeflection =
  (model.geometry.screenLoadN * model.geometry.throatWidth ** 3) /
  (48 * model.geometry.screenModulusMpa * beamMoment);
const baseStress =
  (3 * model.geometry.screenLoadN * model.geometry.throatWidth) /
  (2 * effectiveBeamWidth * baseThickness ** 2);
const baseSafetyFactor = model.geometry.screenAllowableStressMpa / baseStress;
const cheekGuideSpan = model.geometry.throatWidth / 2 - openingWidth / 2;
const edgeGuideSpan = model.geometry.throatThickness / 2 - openingThickness / 2;
const guideScreens = [
  {
    span: cheekGuideSpan,
    width: model.geometry.cheekPlateWidth - 2 * model.geometry.boltSlotWidth,
  },
  {
    span: edgeGuideSpan,
    width: model.geometry.edgePlateLength - 2 * model.geometry.boltSlotWidth,
  },
].map(({ span, width }) => {
  const moment = (width * guideThickness ** 3) / 12;
  const deflection =
    (model.geometry.screenLoadN * span ** 3) /
    (3 * model.geometry.screenModulusMpa * moment);
  const stress =
    (6 * model.geometry.screenLoadN * span) /
    (width * guideThickness ** 2);
  return {
    deflection,
    safetyFactor: model.geometry.screenAllowableStressMpa / stress,
    stress,
  };
});
const maximumGuideDeflection = Math.max(
  ...guideScreens.map(({ deflection }) => deflection),
);
const maximumGuideStress = Math.max(
  ...guideScreens.map(({ stress }) => stress),
);
const minimumGuideSafetyFactor = Math.min(
  ...guideScreens.map(({ safetyFactor }) => safetyFactor),
);
const conservativeGuideScreens = [
  {
    span:
      model.geometry.throatWidth / 2 -
      model.geometry.minimumGuideOpening / 2,
    width: model.geometry.cheekPlateWidth - 2 * model.geometry.boltSlotWidth,
  },
  {
    span:
      model.geometry.throatThickness / 2 -
      model.geometry.minimumGuideOpening / 2,
    width: model.geometry.edgePlateLength - 2 * model.geometry.boltSlotWidth,
  },
].map(({ span, width }) => {
  const moment = (width * guideThickness ** 3) / 12;
  const deflection =
    (model.geometry.screenLoadN * span ** 3) /
    (3 * model.geometry.screenModulusMpa * moment);
  const stress =
    (6 * model.geometry.screenLoadN * span) /
    (width * guideThickness ** 2);
  return {
    deflection,
    safetyFactor: model.geometry.screenAllowableStressMpa / stress,
  };
});
const conservativeGuideDeflection = Math.max(
  ...conservativeGuideScreens.map(({ deflection }) => deflection),
);
const conservativeGuideSafetyFactor = Math.min(
  ...conservativeGuideScreens.map(({ safetyFactor }) => safetyFactor),
);
const minimumBaseThickness = parameter("baseThickness").limits.min;
const minimumBaseDeflection =
  baseDeflection * (baseThickness / minimumBaseThickness) ** 3;
const minimumBaseStress =
  baseStress * (baseThickness / minimumBaseThickness) ** 2;
const minimumBaseSafetyFactor =
  model.geometry.screenAllowableStressMpa / minimumBaseStress;
const cheekSlotHalfTravel =
  (model.geometry.adjustmentSlotLength - 5) / 2;
const edgeSlotHalfTravel =
  (model.geometry.edgeAdjustmentSlotLength - 5) / 2;
const cheekOpenings = [
  model.geometry.minimumGuideOpening,
  model.geometry.maximumGuideOpeningWidth,
];
const edgeOpenings = [
  model.geometry.minimumGuideOpening,
  model.geometry.maximumGuideOpeningThickness,
];
const cheekSlotRangePasses = cheekOpenings.every((opening) => {
  const localScrew =
    model.geometry.cheekInsertX -
    (opening / 2 + model.geometry.cheekPlateLength / 2);
  return (
    Math.abs(localScrew - model.geometry.cheekSlotCenterLocalX) <=
    cheekSlotHalfTravel
  );
});
const edgeSlotRangePasses = edgeOpenings.every((opening) => {
  const localScrew =
    model.geometry.edgeInsertY -
    (opening / 2 + model.geometry.edgePlateWidth / 2);
  return (
    Math.abs(localScrew - model.geometry.edgeSlotCenterLocalY) <=
    edgeSlotHalfTravel
  );
});
const guidesSeatAcrossRange =
  model.geometry.maximumGuideOpeningWidth / 2 +
      model.geometry.cheekPlateLength <=
    model.geometry.horizontalRecessLength / 2 &&
  model.geometry.maximumGuideOpeningThickness / 2 +
      model.geometry.edgePlateWidth <=
    model.geometry.verticalRecessLength / 2;
const minimumBearing = parameter("guideBearingDiameter").limits.min;
const conservativeRouterCenters = [
  {
    x: model.geometry.minimumGuideOpening / 2 + minimumBearing / 2,
    y: 0,
  },
  {
    x: 0,
    y: model.geometry.minimumGuideOpening / 2 + minimumBearing / 2,
  },
];
const conservativeSupportOverlaps = conservativeRouterCenters.map(
  ({ x, y }) =>
    routerBaseDiameter / 2 -
    Math.hypot(
      Math.max(0, cornerX - Math.abs(x)),
      Math.max(0, cornerY - Math.abs(y)),
    ),
);

assert(tenonThickness === 10 && tenonWidth === 40, "default tenon is 10 × 40 mm");
assert(parameter("tenonLength").default === 30, "default tenon length is 30 mm");
assert(cutter === 12.7 && bearing === 12.7, "default cutter and bearing are equal 12.7 mm sizes");
assert(Math.abs(openingThickness - 10.2) < 1e-8, "default thickness opening is 10.2 mm");
assert(Math.abs(openingWidth - 40.2) < 1e-8, "default width opening is 40.2 mm");
assert(shoulderFace >= 3 && shoulderEdge >= 3, "default stock preserves at least 3 mm shoulders");
assert(baseThickness - insertDepth >= model.geometry.minimumInsertFloor, "blind insert pockets preserve a closed floor");
assert(screwEngagement >= model.geometry.minimumInsertEngagement, "M5 screws preserve minimum insert engagement");
assert(screwTipClearance >= model.geometry.minimumPocketTipClearance, "M5 screws do not bottom in blind pockets");
assert(cheekSlotRangePasses && edgeSlotRangePasses, "two-bolt slots cover the complete configured opening range without guide rotation");
assert(guidesSeatAcrossRange, "both guide pairs remain fully seated in their recess across the configured opening range");
assert(supportOverlaps.every((value) => value >= model.geometry.minimumRouterSupportOverlap), `auxiliary sub-base reaches a raised support region in both default setups (${Math.min(...supportOverlaps).toFixed(2)} mm minimum overlap)`);
assert(conservativeSupportOverlaps.every((value) => value >= model.geometry.minimumRouterSupportOverlap), "default auxiliary sub-base preserves support overlap at the conservative opening and bearing limits");
assert(baseDeflection <= model.geometry.maximumScreenDeflection, `base beam screen stays below the deflection limit (${baseDeflection.toFixed(3)} mm)`);
assert(baseSafetyFactor >= model.geometry.minimumScreenSafetyFactor, `base beam screen preserves the stress safety-factor threshold (${baseSafetyFactor.toFixed(1)}×)`);
assert(minimumBaseDeflection <= model.geometry.maximumScreenDeflection && minimumBaseSafetyFactor >= model.geometry.minimumScreenSafetyFactor, `minimum base thickness preserves both strength-screen thresholds (${minimumBaseDeflection.toFixed(3)} mm, ${minimumBaseSafetyFactor.toFixed(1)}×)`);
assert(maximumGuideDeflection <= model.geometry.maximumScreenDeflection, `guide cantilever screen stays below the deflection limit (${maximumGuideDeflection.toFixed(3)} mm)`);
assert(minimumGuideSafetyFactor >= model.geometry.minimumScreenSafetyFactor, `guide cantilever screen preserves the stress safety-factor threshold (${minimumGuideSafetyFactor.toFixed(1)}× at ${maximumGuideStress.toFixed(2)} MPa)`);
assert(conservativeGuideDeflection <= model.geometry.maximumScreenDeflection && conservativeGuideSafetyFactor >= model.geometry.minimumScreenSafetyFactor, `default guide thickness preserves both strength-screen thresholds across the full opening range (${conservativeGuideDeflection.toFixed(3)} mm, ${conservativeGuideSafetyFactor.toFixed(1)}×)`);
assert((model.geometry.baseWidth - model.geometry.verticalRecessLength) / 2 >= model.geometry.minimumClampLedge, "front and rear clamp ledges meet the minimum width");

for (const part of model.parts) {
  const filePath = path.join(root, "public", part.url.replace(/^\/+/, ""));
  assert(fs.existsSync(filePath), `${part.label} STL exists`);
  if (!fs.existsSync(filePath)) continue;
  const info = stlInfo(filePath);
  assert(info.finite, `${part.label} STL contains only finite coordinates`);
  assert(info.degenerate === 0, `${part.label} STL has no degenerate triangles`);
  assert(info.nonManifoldEdges === 0, `${part.label} STL is watertight and manifold`);
  assert(Math.abs(info.min.z) <= model.audit.toleranceMm, `${part.label} rests on Z=0`);
  if (part.key === "base-bridge") {
    assert(Math.abs(info.size.x - model.geometry.baseLength) <= model.audit.toleranceMm, "base length matches the configured envelope");
    assert(Math.abs(info.size.y - model.geometry.baseWidth) <= model.audit.toleranceMm, "base width matches the configured envelope");
    assert(Math.abs(info.size.z - (baseThickness + guideThickness)) <= model.audit.toleranceMm, "raised platform height matches the recessed floor plus guide thickness");
    assert(info.triangles > 1200, "base includes the stock throat, flush guide recess, and eight blind insert pockets");
  } else if (part.key.includes("cheek")) {
    assert(Math.abs(info.size.x - model.geometry.cheekPlateLength) <= model.audit.toleranceMm, `${part.label} length matches the configured envelope`);
    assert(Math.abs(info.size.y - model.geometry.cheekPlateWidth) <= model.audit.toleranceMm, `${part.label} width matches the configured envelope`);
    assert(info.triangles > 850, `${part.label} includes two slots and width markers`);
  } else {
    assert(Math.abs(info.size.x - model.geometry.edgePlateLength) <= model.audit.toleranceMm, `${part.label} length matches the configured envelope`);
    assert(Math.abs(info.size.y - model.geometry.edgePlateWidth) <= model.audit.toleranceMm, `${part.label} width matches the configured envelope`);
    assert(info.triangles > 700, `${part.label} includes two slots and thickness markers`);
  }
}

if (!process.exitCode) console.log(`${model.name} audit complete`);
