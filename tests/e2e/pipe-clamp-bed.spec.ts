import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createPipeClampBedGeometry,
  createPipeClampBedPrintGeometry,
  getDefaultParams,
  getParameterLimits,
  getPipeClampBedSpec,
  type ModelDefinition,
  type ModelParams,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/pipe-clamp-bed/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "pipe-clamp-bed-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
  const directedEdges = new Map<string, number>();
  let degenerateTriangles = 0;
  const key = (index: number) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
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
      directedEdges.set(
        `${start}>${end}`,
        (directedEdges.get(`${start}>${end}`) ?? 0) + 1,
      );
    }
  }
  geometry.computeBoundingBox();
  return {
    bounds: geometry.boundingBox!,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    inconsistentEdges:
      [...directedEdges.entries()].filter(([edge, count]) => {
        const [start, end] = edge.split(">");
        return count !== 1 || directedEdges.get(`${end}>${start}`) !== 1;
      }).length / 2,
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    triangles: position.count / 3,
  };
}

function expectPrintable(params: ModelParams, printOrientation = false) {
  const geometry = printOrientation
    ? createPipeClampBedPrintGeometry(params, model)
    : createPipeClampBedGeometry(params, model);
  const info = analyzeGeometry(geometry);
  expect(info.finite).toBe(true);
  expect(info.degenerateTriangles).toBe(0);
  expect(info.nonManifoldEdges).toBe(0);
  expect(info.inconsistentEdges).toBe(0);
  expect(info.triangles).toBeGreaterThan(500);
  if (printOrientation) expect(info.bounds.min.z).toBeCloseTo(0, 4);
  geometry.dispose();
}

test("derives the level crown support and easy-release clips from independent controls", () => {
  const defaults = getDefaultParams(model);
  const spec = getPipeClampBedSpec(defaults);
  expect(spec.bedLength).toBeCloseTo(177.8, 5);
  expect(spec.bedWidth).toBeCloseTo(38.1, 5);
  expect(spec.pipeDiameter).toBeCloseTo(26.67, 5);
  expect(spec.fittedRadius).toBeCloseTo(13.735, 5);
  expect(spec.surfaceLiftAboveCrown).toBeCloseTo(1.6, 5);
  expect(spec.supportSurfaceZ).toBeCloseTo(14.935, 5);
  expect(spec.workpieceCenterZ).toBeCloseTo(27.635, 5);
  expect(spec.hookOpeningWidth).toBeCloseTo(25.07, 5);
  expect(spec.requiredSnapDeflectionPerSide).toBeCloseTo(0.8, 5);
  expect(spec.hookWidth).toBeCloseTo(25.4, 5);
  expect(spec.centerBridge).toBeCloseTo(127, 5);
  expectPrintable(defaults);
  expectPrintable(defaults, true);

  expectPrintable({
    ...defaults,
    bedWidth: 45,
    bedThickness: 7.5,
    pipeDiameter: 33.4,
    pipeClearance: 1,
    crownCapThickness: 1.4,
    hookUndercut: 1.4,
  });
  expectPrintable({
    ...defaults,
    bedLength: 120,
    hookWidth: 30,
    pipeClearance: 1.2,
    hookUndercut: 1,
  });

  expect(getParameterLimits(model, defaults, "bedLength").min).toBeGreaterThanOrEqual(
    defaults.hookWidth * 2 + model.geometry.minimumCenterBridge,
  );
  expect(getParameterLimits(model, defaults, "hookWidth").max).toBeLessThanOrEqual(
    (defaults.bedLength - model.geometry.minimumCenterBridge) / 2,
  );
  expect(getParameterLimits(model, defaults, "bedWidth").min).toBeGreaterThan(
    defaults.pipeDiameter + defaults.pipeClearance + defaults.hookWallThickness * 2,
  );
});

test("renders, edits, persists, audits, and exports the pipe clamp bed", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=pipe-clamp-bed&unit=mm");
  await expect(page.getByRole("heading", { name: "Pipe Clamp Bed" })).toBeVisible();
  await expect(page.getByLabel("Pipe Clamp Bed model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bed surface" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipe fit & height" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Snap clips" })).toBeVisible();
  await expect(page.getByText("Support height", { exact: true })).toBeVisible();
  await expect(page.getByText("Workpiece center", { exact: true })).toBeVisible();
  await expect(page.getByText("Snap-on / release", { exact: true })).toBeVisible();
  await expect(page.getByText("Surface 1.6 mm above crown")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download default fit coupon STL" })).toBeVisible();

  await page.getByLabel("Material above fitted pipe crown in millimeters").fill("1.5");
  await page.getByLabel("Clip retention per side in millimeters").fill("1.0");
  await expect.poll(() => new URL(page.url()).searchParams.get("crownCapThickness")).toBe("1.5");
  await expect.poll(() => new URL(page.url()).searchParams.get("hookUndercut")).toBe("1");
  await expect(page.getByText("Surface 1.9 mm above crown")).toBeVisible();

  await page.reload();
  await expect(
    page.getByLabel("Material above fitted pipe crown in millimeters"),
  ).toHaveValue("1.5");
  await expect(
    page.getByLabel("Clip retention per side in millimeters"),
  ).toHaveValue("1.0");

  const [couponDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download default fit coupon STL" }).click(),
  ]);
  expect(couponDownload.suggestedFilename()).toBe(
    "pipe-clamp-bed-fit-coupon.stl",
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ),
  ]);
  expect(download.suggestedFilename()).toBe(
    "pipe-clamp-bed-177.8x38.1-pipe-26.67-clearance-0.8-clips-25.4.stl",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const input = fs.readFileSync(downloadPath!);
  const exported = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const topology = analyzeGeometry(exported);
  expect(topology.finite).toBe(true);
  expect(topology.degenerateTriangles).toBe(0);
  expect(topology.nonManifoldEdges).toBe(0);
  expect(topology.inconsistentEdges).toBe(0);
  expect(topology.bounds.min.z).toBeCloseTo(0, 3);
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(177.8, 2);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(38.1, 2);
  exported.dispose();
  expect(pageErrors).toEqual([]);
});

test("keeps the pipe clamp bed usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?model=pipe-clamp-bed&unit=in");
  const title = page.getByRole("heading", { name: "Pipe Clamp Bed" });
  await expect(title).toBeVisible();
  expect(
    await title.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const scene = await page.getByLabel("Pipe Clamp Bed model viewer").boundingBox();
  const inspector = await page.getByRole("heading", { name: "Inspector" }).boundingBox();
  expect(scene).not.toBeNull();
  expect(inspector).not.toBeNull();
  expect(inspector!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
  await expect(page.getByLabel("Bed length in inches")).toHaveValue("7");
  await expect(page.getByLabel("Bed width in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Pipe outside diameter in inches")).toHaveValue(
    "1.050",
  );
  await expect(page.getByText("Pipe 1.050 in · 1/32 in total clearance")).toBeVisible();
});
