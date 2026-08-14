import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createRouterTenonJigBaseGeometry,
  createRouterTenonJigPartGeometries,
  createRouterTenonJigPreviewParts,
  getDefaultParams,
  getParameterLimits,
  getRouterTenonJigSpec,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/router-tenon-jig/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "router-tenon-jig-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let degenerateTriangles = 0;
  const key = (index: number) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (
      new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .lengthSq() <= 1e-10
    ) {
      degenerateTriangles += 1;
    }
    for (const [start, end] of [
      [key(index), key(index + 1)],
      [key(index + 1), key(index + 2)],
      [key(index + 2), key(index)],
    ]) {
      const edge = start < end ? `${start}|${end}` : `${end}|${start}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  source.computeBoundingBox();
  const bounds = source.boundingBox!.clone();
  const result = {
    bounds,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    triangles: position.count / 3,
  };
  source.dispose();
  return result;
}

function inspectStl(input: Buffer) {
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const result = analyzeGeometry(geometry);
  geometry.dispose();
  return result;
}

test("derives a watertight five-part jig from the tenon and bearing bit", () => {
  const params = getDefaultParams(model);
  const spec = getRouterTenonJigSpec(params, model);
  expect(spec.guideOpeningThickness).toBeCloseTo(10.2, 5);
  expect(spec.guideOpeningWidth).toBeCloseTo(40.2, 5);
  expect(spec.shoulderThickness).toBe(14);
  expect(spec.shoulderWidth).toBe(12);
  expect(spec.insertFloor).toBe(5);
  expect(spec.platformThickness).toBe(22);
  expect(spec.screwEngagement).toBe(4.5);
  expect(spec.screwTipClearance).toBe(2.5);
  expect(spec.slotTravelMargin).toBeGreaterThanOrEqual(0);
  expect(spec.routerSupportOverlap).toBeGreaterThanOrEqual(
    model.geometry.minimumRouterSupportOverlap,
  );
  expect(spec.baseScreenDeflection).toBeLessThanOrEqual(
    model.geometry.maximumScreenDeflection,
  );
  expect(spec.baseScreenSafetyFactor).toBeGreaterThanOrEqual(
    model.geometry.minimumScreenSafetyFactor,
  );
  expect(spec.guideScreenDeflection).toBeLessThanOrEqual(
    model.geometry.maximumScreenDeflection,
  );
  expect(spec.guideScreenSafetyFactor).toBeGreaterThanOrEqual(
    model.geometry.minimumScreenSafetyFactor,
  );
  expect(spec.clampLedge).toBeGreaterThanOrEqual(
    model.geometry.minimumClampLedge,
  );
  expect(spec.minimumInsertWeb).toBeGreaterThanOrEqual(
    model.geometry.minimumInsertSideWall,
  );

  const base = createRouterTenonJigBaseGeometry(params, model);
  const baseTopology = analyzeGeometry(base);
  expect(baseTopology.finite).toBe(true);
  expect(baseTopology.degenerateTriangles).toBe(0);
  expect(baseTopology.nonManifoldEdges).toBe(0);
  expect(baseTopology.triangles).toBeGreaterThan(1200);
  expect(baseTopology.bounds.min.z).toBeCloseTo(0, 5);
  expect(baseTopology.bounds.max.z).toBeCloseTo(spec.platformThickness, 5);
  expect(baseTopology.bounds.max.x - baseTopology.bounds.min.x).toBeCloseTo(210, 3);
  expect(baseTopology.bounds.max.y - baseTopology.bounds.min.y).toBeCloseTo(170, 3);
  base.dispose();

  const parts = createRouterTenonJigPartGeometries(params, model);
  expect(parts.map((part) => part.key)).toEqual([
    "base-bridge",
    "left-cheek-guide",
    "right-cheek-guide",
    "front-edge-guide",
    "rear-edge-guide",
  ]);
  parts.forEach((part) => {
    const topology = analyzeGeometry(part.geometry);
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    expect(topology.bounds.min.z).toBeCloseTo(0, 5);
    part.geometry.dispose();
  });

  const preview = createRouterTenonJigPreviewParts(params, model);
  expect(preview.slice(0, 2).map((part) => part.key)).toEqual([
    "left-cheek-guide",
    "right-cheek-guide",
  ]);
  expect(preview.filter((part) => part.key.startsWith("m5-insert-"))).toHaveLength(8);
  expect(preview.filter((part) => part.key.startsWith("active-washer-"))).toHaveLength(4);
  expect(preview.filter((part) => part.key.startsWith("active-screw-"))).toHaveLength(4);

  const widthGuides = preview.slice(0, 2).map((part) => analyzeGeometry(part.geometry));
  expect(widthGuides[0].bounds.max.x).toBeCloseTo(-spec.guideOpeningWidth / 2, 4);
  expect(widthGuides[1].bounds.min.x).toBeCloseTo(spec.guideOpeningWidth / 2, 4);
  widthGuides.forEach(({ bounds }) => {
    expect(bounds.min.z).toBeCloseTo(spec.baseThickness, 5);
    expect(bounds.max.z).toBeCloseTo(spec.platformThickness, 5);
  });
  const routerBase = analyzeGeometry(
    preview.find((part) => part.key === "router-base")!.geometry,
  );
  expect(routerBase.bounds.min.z).toBeCloseTo(spec.platformThickness, 5);
  const finishedTenon = analyzeGeometry(
    preview.find((part) => part.key === "finished-tenon")!.geometry,
  );
  expect(finishedTenon.bounds.max.z).toBeCloseTo(spec.baseThickness, 5);
  expect(finishedTenon.bounds.min.z).toBeCloseTo(
    spec.baseThickness - spec.tenonLength,
    5,
  );
  preview.forEach((part) => part.geometry.dispose());

  const thicknessParams = { ...params, activeGuidePair: 1 };
  const thicknessSpec = getRouterTenonJigSpec(thicknessParams, model);
  const thicknessPreview = createRouterTenonJigPreviewParts(thicknessParams, model);
  expect(thicknessPreview.slice(0, 2).map((part) => part.key)).toEqual([
    "front-edge-guide",
    "rear-edge-guide",
  ]);
  const thicknessGuides = thicknessPreview
    .slice(0, 2)
    .map((part) => analyzeGeometry(part.geometry));
  expect(thicknessGuides[0].bounds.max.y).toBeCloseTo(
    -thicknessSpec.guideOpeningThickness / 2,
    4,
  );
  expect(thicknessGuides[1].bounds.min.y).toBeCloseTo(
    thicknessSpec.guideOpeningThickness / 2,
    4,
  );
  expect(thicknessSpec.routerSupportOverlap).toBeGreaterThanOrEqual(
    model.geometry.minimumRouterSupportOverlap,
  );
  thicknessPreview.forEach((part) => part.geometry.dispose());
});

test("keeps presets and coupled tenon, stock, bearing, and insert limits safe", () => {
  const defaults = getDefaultParams(model);
  for (const preset of model.presets) {
    const params = {
      ...defaults,
      tenonThickness: preset.tenonThickness,
      tenonWidth: preset.tenonWidth,
      tenonLength: preset.tenonLength,
    };
    const spec = getRouterTenonJigSpec(params, model);
    expect(spec.guideOpeningThickness).toBeCloseTo(
      preset.tenonThickness - defaults.guideBearingDiameter + defaults.routerCutterDiameter + defaults.tenonAllowance,
      5,
    );
    expect(spec.guideOpeningWidth).toBeCloseTo(
      preset.tenonWidth - defaults.guideBearingDiameter + defaults.routerCutterDiameter + defaults.tenonAllowance,
      5,
    );
  }

  expect(
    getParameterLimits(model, { ...defaults, tenonWidth: 50 }, "workpieceWidth").min,
  ).toBe(56);
  expect(
    getParameterLimits(model, { ...defaults, tenonThickness: 12 }, "workpieceThickness").min,
  ).toBe(18);
  expect(
    getParameterLimits(model, { ...defaults, baseThickness: 11 }, "insertDepth").max,
  ).toBe(8);
  expect(
    getParameterLimits(model, { ...defaults, insertDepth: 9 }, "baseThickness").min,
  ).toBe(12);
  expect(
    getParameterLimits(model, defaults, "knobScrewLength"),
  ).toMatchObject({ min: 16, max: 18 });
  expect(
    getParameterLimits(model, { ...defaults, activeGuidePair: 1 }, "routerBaseDiameter").min,
  ).toBeLessThanOrEqual(defaults.routerBaseDiameter);
  expect(
    getParameterLimits(
      model,
      {
        ...defaults,
        tenonWidth: 60,
        tenonThickness: 16,
        guideBearingDiameter: 6,
        tenonAllowance: 0.8,
      },
      "routerCutterDiameter",
    ).max,
  ).toBeCloseTo(7.2, 5);
  expect(
    getParameterLimits(
      model,
      {
        ...defaults,
        tenonWidth: 60,
        tenonThickness: 16,
        routerCutterDiameter: 19.05,
        tenonAllowance: 0.8,
      },
      "guideBearingDiameter",
    ).min,
  ).toBeCloseTo(17.85, 5);
});

test("renders, applies tenon presets, audits, and exports five individual STLs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=router-tenon-jig&unit=mm");
  await expect(page.getByRole("heading", { name: "Handheld Router Tenon Jig" })).toBeVisible();
  await expect(page.getByLabel("Handheld Router Tenon Jig model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText(
    "Auxiliary sub-base stand-in 150.0 mm Ø · preview only",
  );
  await expect(
    page.locator(".audit-row").filter({ hasText: "Calculated bearing-guide openings" }),
  ).toContainText("10.2 mm T × 40.2 mm W");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Heat-set inserts" }),
  ).toContainText("8 × M5");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Sequential assembly clearance" }),
  ).toContainText("Width / cheek pair installed");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Base strength screen" }),
  ).toContainText("75 N");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Guide-plate strength screen" }),
  ).toContainText("75 N");
  await expect(page.getByText("1 base-bridge STL")).toBeVisible();
  await expect(page.getByText("2 individual cheek-guide STLs")).toBeVisible();

  const preset = page.getByRole("button", { name: /12 × 50 × 35 mm.*T × W × L/ });
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Tenon thickness in millimeters")).toHaveValue("12.0");
  await expect(page.getByLabel("Tenon width in millimeters")).toHaveValue("50.0");
  await expect(page.getByLabel("Tenon length / cut depth in millimeters")).toHaveValue("35.0");
  await expect.poll(() => new URL(page.url()).searchParams.get("tenonWidth")).toBe("50");

  const stock = page.getByLabel("Workpiece width in millimeters");
  await stock.fill("76");
  await expect.poll(() => new URL(page.url()).searchParams.get("workpieceWidth")).toBe("76");

  const thicknessPass = page.getByRole("button", { name: /Thickness pass.*Edge guides/ });
  await thicknessPass.click();
  await expect(thicknessPass).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => new URL(page.url()).searchParams.get("activeGuidePair")).toBe("1");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Sequential assembly clearance" }),
  ).toContainText("Thickness / edge pair installed");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await page.reload();
  await expect(stock).toHaveValue("76.0");
  await expect(thicknessPass).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();

  const downloads: Array<import("@playwright/test").Download> = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page.getByRole("button", { name: "Export 5 individual STLs" }).click();
  await expect.poll(() => downloads.length).toBe(5);
  expect(downloads.map((download) => download.suggestedFilename())).toEqual([
    expect.stringContaining("-base-bridge.stl"),
    expect.stringContaining("-left-cheek-guide.stl"),
    expect.stringContaining("-right-cheek-guide.stl"),
    expect.stringContaining("-front-edge-guide.stl"),
    expect.stringContaining("-rear-edge-guide.stl"),
  ]);
  for (const download of downloads) {
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const topology = inspectStl(fs.readFileSync(downloadPath!));
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
  }
  expect(pageErrors).toEqual([]);
});

test("keeps the tenon workspace usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?model=router-tenon-jig&unit=mm");
  await expect(page.getByRole("heading", { name: "Handheld Router Tenon Jig" })).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /10 × 40 × 30 mm/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Thickness pass.*Edge guides/ })).toBeVisible();
  await expect(page.getByLabel("Tenon thickness in millimeters")).toBeVisible();
});
