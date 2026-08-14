import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createRouterMortiseJigGuideGeometry,
  createRouterMortiseJigPartGeometries,
  createRouterMortiseJigPreviewParts,
  getDefaultParams,
  getParameterLimits,
  getRouterMortiseJigSpec,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/router-mortise-jig/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "router-mortise-jig-v1" }>;

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

test("derives a watertight three-part jig from the router interface", () => {
  const params = getDefaultParams(model);
  const spec = getRouterMortiseJigSpec(params, model);
  expect(spec.openingWidth).toBeCloseTo(18.25, 5);
  expect(spec.openingLength).toBeCloseTo(40.25, 5);
  expect(spec.insertSideWall).toBeCloseTo(3.4, 5);
  expect(spec.insertFloor).toBe(18);
  expect(spec.minimumPlateWeb).toBeGreaterThanOrEqual(
    model.geometry.minimumPlateWeb,
  );

  const guide = createRouterMortiseJigGuideGeometry(params, model);
  const guideTopology = analyzeGeometry(guide);
  expect(guideTopology.finite).toBe(true);
  expect(guideTopology.degenerateTriangles).toBe(0);
  expect(guideTopology.nonManifoldEdges).toBe(0);
  expect(guideTopology.triangles).toBeGreaterThan(1000);
  expect(guideTopology.bounds.min.z).toBeCloseTo(0, 5);
  expect(guideTopology.bounds.max.x - guideTopology.bounds.min.x).toBeCloseTo(
    220,
    3,
  );
  expect(guideTopology.bounds.max.y - guideTopology.bounds.min.y).toBeCloseTo(
    120,
    3,
  );
  guide.dispose();

  const parts = createRouterMortiseJigPartGeometries(params, model);
  expect(parts.map((part) => part.key)).toEqual([
    "guide-plate",
    "left-fence",
    "right-fence",
  ]);
  parts.forEach((part) => {
    const topology = analyzeGeometry(part.geometry);
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    expect(topology.bounds.min.z).toBeCloseTo(0, 5);
    part.geometry.dispose();
  });

  const preview = createRouterMortiseJigPreviewParts(params, model);
  expect(preview.map((part) => part.key)).toEqual([
    "left-fence",
    "right-fence",
    "workpiece",
    "router-base",
    "router-motor",
    "guide-bushing",
    "router-bit",
  ]);
  preview.forEach((part) => part.geometry.dispose());
});

test("keeps presets and coupled cutter, mortise, bushing, and insert limits safe", () => {
  const defaults = getDefaultParams(model);
  for (const preset of model.presets) {
    const params = {
      ...defaults,
      mortiseWidth: preset.mortiseWidth,
      mortiseLength: preset.mortiseLength,
      routerBitDiameter: preset.routerBitDiameter,
    };
    const spec = getRouterMortiseJigSpec(params, model);
    expect(spec.openingWidth).toBeCloseTo(
      preset.mortiseWidth +
        defaults.guideBushingDiameter -
        preset.routerBitDiameter +
        defaults.templateWiggle,
      5,
    );
    expect(spec.openingLength).toBeCloseTo(
      preset.mortiseLength +
        defaults.guideBushingDiameter -
        preset.routerBitDiameter +
        defaults.templateWiggle,
      5,
    );
  }

  expect(
    getParameterLimits(model, { ...defaults, mortiseWidth: 6 }, "routerBitDiameter")
      .max,
  ).toBe(6);
  expect(
    getParameterLimits(model, { ...defaults, routerBitDiameter: 10 }, "guideBushingDiameter")
      .min,
  ).toBe(12);
  expect(
    getParameterLimits(model, { ...defaults, jawDepth: 16 }, "insertDepth").max,
  ).toBe(8);
  expect(
    getParameterLimits(model, { ...defaults, insertDepth: 8 }, "jawDepth").min,
  ).toBe(16);
});

test("renders, applies preset markers, audits, and exports three individual STLs", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=router-mortise-jig&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Handheld Router Mortise Jig" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Handheld Router Mortise Jig model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText(
    "Router base stand-in 90.0 mm Ø · preview only",
  );
  await expect(
    page.locator(".audit-row").filter({ hasText: "Calculated template opening" }),
  ).toContainText("18.3 mm × 40.3 mm");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Heat-set inserts" }),
  ).toContainText("4 × M5");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Stock-width markers" }),
  ).toContainText("38.0 mm · 50.0 mm · 64.0 mm · 76.0 mm");
  await expect(page.getByText("1 guide plate STL")).toBeVisible();
  await expect(page.getByText("2 individual fence-jaw STLs")).toBeVisible();

  const preset = page.getByRole("button", { name: /10 × 40 mm.*8 mm cutter/ });
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Mortise width in millimeters")).toHaveValue("10.0");
  await expect(page.getByLabel("Mortise length in millimeters")).toHaveValue("40.0");
  await expect(page.getByLabel("Router cutter diameter in millimeters")).toHaveValue(
    "8.0",
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mortiseWidth"))
    .toBe("10");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mortiseLength"))
    .toBe("40");

  const workpiece = page.getByLabel("Workpiece width in millimeters");
  await workpiece.fill("64");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("workpieceWidth"))
    .toBe("64");
  await page.reload();
  await expect(workpiece).toHaveValue("64.0");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();

  const downloads: Array<import("@playwright/test").Download> = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page.getByRole("button", { name: "Export 3 individual STLs" }).click();
  await expect.poll(() => downloads.length).toBe(3);
  expect(downloads.map((download) => download.suggestedFilename())).toEqual([
    expect.stringContaining("-guide-plate.stl"),
    expect.stringContaining("-left-fence.stl"),
    expect.stringContaining("-right-fence.stl"),
  ]);
  for (const download of downloads) {
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const topology = inspectStl(fs.readFileSync(downloadPath!));
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    expect(topology.bounds.min.z).toBeCloseTo(0, 4);
  }

  expect(pageErrors).toEqual([]);
});
