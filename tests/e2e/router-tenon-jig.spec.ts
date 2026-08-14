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
  expect(spec.insertFloor).toBe(6);
  expect(spec.minimumInsertWeb).toBeGreaterThanOrEqual(
    model.geometry.minimumInsertSideWall,
  );

  const base = createRouterTenonJigBaseGeometry(params, model);
  const baseTopology = analyzeGeometry(base);
  expect(baseTopology.finite).toBe(true);
  expect(baseTopology.degenerateTriangles).toBe(0);
  expect(baseTopology.nonManifoldEdges).toBe(0);
  expect(baseTopology.triangles).toBeGreaterThan(900);
  expect(baseTopology.bounds.min.z).toBeCloseTo(0, 5);
  expect(baseTopology.bounds.max.x - baseTopology.bounds.min.x).toBeCloseTo(210, 3);
  expect(baseTopology.bounds.max.y - baseTopology.bounds.min.y).toBeCloseTo(160, 3);
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
  expect(preview.map((part) => part.key)).toEqual([
    "left-cheek-guide",
    "front-edge-guide",
    "right-cheek-guide",
    "rear-edge-guide",
    "workpiece-stock",
    "finished-tenon",
    "router-base",
    "router-motor",
    "depth-stop-band",
    "guide-bearing",
    "router-cutter",
    "m5-insert-1",
    "m5-insert-2",
    "m5-insert-3",
    "m5-insert-4",
    "m5-insert-5",
    "m5-insert-6",
  ]);
  preview.forEach((part) => part.geometry.dispose());
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
    getParameterLimits(model, { ...defaults, baseThickness: 10 }, "insertDepth").max,
  ).toBe(7);
  expect(
    getParameterLimits(model, { ...defaults, insertDepth: 9 }, "baseThickness").min,
  ).toBe(12);
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
    "Router base stand-in 90.0 mm Ø · preview only",
  );
  await expect(
    page.locator(".audit-row").filter({ hasText: "Calculated bearing-guide openings" }),
  ).toContainText("10.2 mm T × 40.2 mm W");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Heat-set inserts" }),
  ).toContainText("6 × M5");
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
  await page.reload();
  await expect(stock).toHaveValue("76.0");
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
  await expect(page.getByLabel("Tenon thickness in millimeters")).toBeVisible();
});
