import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

type ModelJson = {
  id: string;
  name: string;
  viewer: string;
  stl: {
    fileName: string;
    sourceName: string;
    units: string;
    url: string;
  };
  export: {
    filePrefix: string;
  };
  geometry: Record<string, unknown>;
  parameters: Array<{
    key: string;
    label: string;
    statusLabel?: string;
    default: number;
    limits: {
      min: number;
      max: number;
      step: number;
    };
  }>;
  audit: {
    toleranceMm: number;
    dimensionTargets: string[];
    invariants: string[];
    checks: Array<{ key: string; label: string }>;
  };
  scripts: Array<{
    name: string;
    path: string;
    command: string;
  }>;
};

test("cataloged models declare STL files, parameters, audits, and scripts", () => {
  const catalog = readJson(path.join(root, "public/models/index.json"));
  expect(catalog.models).toHaveLength(3);

  for (const entry of catalog.models) {
    const model = readJson(path.join(root, "public", entry.configUrl.replace(/^\//, "")));
    const stlPath = path.join(root, "public", model.stl.url.replace(/^\//, ""));
    const auditScript = model.scripts.find((script: { name: string }) => script.name === "audit");

    expect(model.id).toBe(entry.id);
    expect(model.name).toBe(entry.name);
    expect(fs.existsSync(stlPath)).toBe(true);
    expect(model.parameters.length).toBeGreaterThanOrEqual(3);
    expect(model.audit.dimensionTargets.length).toBeGreaterThan(0);
    expect(model.audit.invariants.length).toBeGreaterThan(0);
    expect(model.audit.checks.length).toBeGreaterThan(0);
    expect(auditScript?.path).toContain(`models/${entry.id}/audit.mjs`);
    expect(fs.existsSync(path.join(root, auditScript.path))).toBe(true);
  }
});

test("model JSON files satisfy the stricter catalog schema contract", () => {
  const catalog = readJson(path.join(root, "public/models/index.json"));
  const catalogIds = new Set<string>();
  const expectedCheckKeys: Record<string, string[]> = {
    "weighted-paper-towel-holder-v1": [
      "holderHeightTarget",
      "holderDiameterTarget",
      "centerTubeOuterDiameter",
      "sandChamber",
      "estimatedSandMass",
      "flushSandChamberFloor",
      "roundedTop",
      "tubeToHolderClearance",
      "tubeRadialMove",
      "roundedTopHeight",
      "bottomTopLockBands",
      "outerWallRadialMove",
    ],
    "japandi-tray-v1": [
      "trayLengthTarget",
      "trayWidthTarget",
      "trayHeightTarget",
      "trayFloorThickness",
      "trayRibRelief",
      "trayAspectRatio",
      "trayInteriorDepth",
      "trayOriginalReference",
    ],
    "simple-box-v1": [
      "trayLengthTarget",
      "trayWidthTarget",
      "trayHeightTarget",
      "trayFloorThickness",
      "trayAspectRatio",
      "trayInteriorDepth",
      "trayOriginalReference",
      "trayStackingLip",
      "trayDividers",
      "trayStackingFit",
      "trayLidFit",
    ],
  };

  for (const entry of catalog.models) {
    expect(catalogIds.has(entry.id)).toBe(false);
    catalogIds.add(entry.id);

    const model = readJson(
      path.join(root, "public", entry.configUrl.replace(/^\//, "")),
    ) as ModelJson;
    const parameterKeys = new Set<string>();
    const checkKeys = model.audit.checks.map((check) => check.key);

    expect(model.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(model.id).toBe(entry.id);
    expect(model.stl.units).toBe("mm");
    expect(model.stl.url).toBe(`/models/${model.id}/${model.stl.fileName}`);
    expect(model.export.filePrefix).toBe(model.id);
    expect(model.audit.toleranceMm).toBeGreaterThan(0);
    expect(model.audit.toleranceMm).toBeLessThanOrEqual(1);
    expect(model.audit.dimensionTargets.length).toBeGreaterThanOrEqual(4);
    expect(model.audit.invariants.length).toBeGreaterThanOrEqual(5);
    expect(checkKeys).toEqual(expectedCheckKeys[model.viewer]);

    for (const parameter of model.parameters) {
      expect(parameter.key).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(parameterKeys.has(parameter.key)).toBe(false);
      parameterKeys.add(parameter.key);
      expect(parameter.label.trim()).not.toBe("");
      expect(Number.isFinite(parameter.default)).toBe(true);
      expect(parameter.limits.min).toBeLessThan(parameter.limits.max);
      expect(parameter.limits.step).toBeGreaterThan(0);
      expect(parameter.default).toBeGreaterThanOrEqual(parameter.limits.min);
      expect(parameter.default).toBeLessThanOrEqual(parameter.limits.max);
      if (parameter.statusLabel) {
        expect(parameter.statusLabel.trim()).not.toBe("");
      }
    }

    for (const script of model.scripts) {
      expect(script.path).toBe(`models/${model.id}/${script.name}.mjs`);
      expect(script.command).toContain(`npm run ${script.name} -- ${model.id}`);
      expect(fs.existsSync(path.join(root, script.path))).toBe(true);
    }
  }
});

test("model-specific parameter dependencies are declared auditable", () => {
  const holder = readJson(
    path.join(root, "public/models/paper-towel-holder/model.json"),
  ) as ModelJson & {
    geometry: {
      centerTubeInnerDiameter: number;
      centerTubeOuterDiameter: number;
      tubeToHolderDiameterClearance: number;
      sandBottomHeight: number;
      sandHeadspace: number;
      sandDensityGramsPerCc: number;
    };
  };
  const tray = readJson(
    path.join(root, "public/models/japandi-tray/model.json"),
  ) as ModelJson & {
    geometry: {
      originalFloorThickness: number;
      minimumFloorThickness: number;
      minimumWallHeight: number;
      maximumRibRelief: number;
      footprintRotationDegrees: number;
    };
  };
  const simpleBox = readJson(
    path.join(root, "public/models/simple-box/model.json"),
  ) as ModelJson & {
    geometry: {
      originalFloorThickness: number;
      stackingLipWallInset: number;
      stackingLipFloorOverlap: number;
      dividerWallInset: number;
      dividerFloorOverlap: number;
    };
  };

  const holderParams = Object.fromEntries(
    holder.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(holderParams.diameter.default).toBeGreaterThanOrEqual(
    holderParams.tubeDiameter.default + holder.geometry.tubeToHolderDiameterClearance,
  );
  expect(holder.geometry.centerTubeInnerDiameter).toBeLessThan(
    holder.geometry.centerTubeOuterDiameter,
  );
  expect(holder.geometry.sandHeadspace).toBeGreaterThan(0);
  expect(holder.geometry.sandBottomHeight).toBeGreaterThan(0);
  expect(holder.geometry.sandDensityGramsPerCc).toBeGreaterThan(1);
  expect(holder.audit.invariants.join(" ")).toContain("Do not apply uniform XYZ scaling");

  const trayParams = Object.fromEntries(
    tray.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(trayParams.floorThickness.default).toBeLessThan(trayParams.height.default);
  expect(tray.geometry.originalFloorThickness).toBeGreaterThanOrEqual(
    tray.geometry.minimumFloorThickness,
  );
  expect(tray.geometry.minimumWallHeight).toBeGreaterThan(
    tray.geometry.minimumFloorThickness,
  );
  expect(tray.geometry.maximumRibRelief).toBeLessThan(2);
  expect(trayParams.rotation.default).toBe(0);
  expect(trayParams.rotation.limits.max).toBe(
    tray.geometry.footprintRotationDegrees,
  );
  expect(tray.audit.invariants.join(" ")).toContain("Preserve the source STL");

  const simpleBoxParams = Object.fromEntries(
    simpleBox.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(simpleBoxParams.ribRelief).toBeUndefined();
  expect(simpleBoxParams.length.default).toBe(330.2);
  expect(simpleBoxParams.width.default).toBe(76.2);
  expect(simpleBoxParams.height.default).toBe(88.9);
  expect(simpleBoxParams.dividerCount.default).toBe(2);
  expect(simpleBoxParams.dividerPosition1.default).toBe(146.05);
  expect(simpleBoxParams.dividerPosition2.default).toBe(228.6);
  expect(simpleBox.geometry.stackingLipWallInset).toBe(
    simpleBox.geometry.originalFloorThickness,
  );
  expect(simpleBox.geometry.stackingLipFloorOverlap).toBeGreaterThan(0);
  expect(simpleBox.geometry.dividerWallInset).toBeLessThan(
    simpleBox.geometry.originalFloorThickness,
  );
  expect(simpleBox.geometry.dividerFloorOverlap).toBeGreaterThan(0);
});

test("request coverage document tracks the app behaviors under Playwright", () => {
  const coverage = readText(path.join(root, "docs/testing-and-audit-coverage.md"));
  const requiredPhrases = [
    "View STL models in a Vite React app",
    "center tube holds sand with a flush base floor and rounded top",
    "Tube diameter is independently parameterized",
    "Imperial fractions such as `1/8th in` are accepted",
    "Unit control appears as contextual text with a caret",
    "Sidebar shows models and selected-model saved versions",
    "Save, Fork, theme, and export are organized in the top-right actions menu",
    "Orientation cube owns 3D, top, X, and Y views",
    "Zoom, reset, and center controls remain easy to use in 3D",
    "Rendering options include a solid view",
    "Original inlay/source overlay can be toggled",
    "per-model JSON for parameters, audit, and scripts",
    "Japandi tray supports width, length, height, floor thickness, rib relief, and rotation",
    "Dark theme is available",
    "Parameter state is saved in the URL",
    "Sidebars have collapsible and resizable rails",
    "Convex library stores saved versions and forks",
    "Comprehensive specifications and test plan stay current",
  ];

  for (const phrase of requiredPhrases) {
    expect(coverage).toContain(phrase);
  }
});

test("product specifications and test plan describe the release contract", () => {
  const specs = readText(path.join(root, "docs/specifications.md"));
  const testPlan = readText(path.join(root, "docs/test-plan.md"));
  const readme = readText(path.join(root, "README.md"));

  for (const phrase of [
    "The root route `/` opens the default model workspace",
    "Parameter query values are always stored in millimeters",
    "The app must never solve parameter changes by uniformly scaling all axes",
    "Arbitrary STL upload is intentionally unsupported",
    "Export downloads the current generated STL",
    "The sidebar resizers are keyboard reachable",
  ]) {
    expect(specs).toContain(phrase);
  }

  for (const phrase of [
    "Model audit scripts",
    "Browser E2E",
    "Live Convex persistence",
    "Production smoke",
    "Release Gate",
  ]) {
    expect(testPlan).toContain(phrase);
  }

  expect(readme).toContain("docs/specifications.md");
  expect(readme).toContain("docs/test-plan.md");
});

test("model-specific audit docs mention their JSON-owned runtime checks", () => {
  const paperDoc = readText(path.join(root, "docs/audit-specifications.md"));
  const trayDoc = readText(path.join(root, "docs/japandi-tray-audit-specifications.md"));

  for (const phrase of [
    "weighted sand chamber",
    "flush base floor",
    "rounded top",
    "Center tube diameter is adjustable independently",
    "Do not apply uniform XYZ scaling",
    "Slicer review should confirm the center tube can be filled with sand",
  ]) {
    expect(paperDoc).toContain(phrase);
  }

  for (const phrase of [
    "length, width, wall height, floor thickness, rib relief, and rotation",
    "Keep the original STL available as an overlay reference",
    "Do not let floor thickness equal or exceed total wall height",
    "Runtime audit checks include tray length",
  ]) {
    expect(trayDoc).toContain(phrase);
  }
});

test("line coverage audit samples exactly ten documented request lines", () => {
  const lineAudit = readText(path.join(root, "docs/line-coverage-audit.md"));
  const sampledRows = lineAudit
    .split("\n")
    .filter((line) => /^\| \d+ \|/.test(line));

  expect(sampledRows).toHaveLength(10);
  expect(lineAudit).toContain("root and sidebar model-opening path");
  expect(lineAudit).toContain("All ten sampled lines");
});

test("Convex library persistence is documented and wired to Vercel builds", () => {
  const docs = readText(path.join(root, "docs/convex-library.md"));
  const schema = readText(path.join(root, "convex/schema.ts"));
  const functions = readText(path.join(root, "convex/library.ts"));
  const packageJson = readJson(path.join(root, "package.json"));
  const vercelJson = readJson(path.join(root, "vercel.json"));

  for (const phrase of [
    "Vercel Marketplace resource",
    "Save",
    "Fork",
    "Open",
    "Selected-model sidebar view",
    "Arbitrary STL upload is intentionally not supported yet",
    "VITE_CONVEX_URL",
  ]) {
    expect(docs).toContain(phrase);
  }

  expect(schema).toContain("models: defineTable");
  expect(schema).toContain("versions: defineTable");
  expect(functions).toContain("generateUploadUrl");
  expect(functions).toContain("saveVersion");
  expect(functions).toContain("forkVersion");
  expect(functions).not.toContain("saveUploadedModel");
  expect(functions).not.toContain("uploaded STL");
  expect(functions).toContain("listLibrary");
  expect(functions).toContain("parentVersionId");
  expect(schema).toContain("source: v.union");
  expect(schema).toContain(".index(\"by_key\"");
  expect(schema).toContain(".index(\"by_parent\"");
  expect(packageJson.scripts["build:vercel"]).toContain("convex deploy");
  expect(packageJson.scripts["build:vercel"]).toContain("VITE_CONVEX_URL");
  expect(vercelJson.buildCommand).toBe("npm run build:vercel");
});
