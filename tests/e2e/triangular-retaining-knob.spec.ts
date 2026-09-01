import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createMetricNutKnobGeometry,
  getDefaultParams,
  getMetricNutKnobSpec,
  getParameterLimits,
  type ModelDefinition,
  type ModelParams,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/triangular-retaining-knob/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "metric-nut-knob-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
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
    }
  }
  geometry.computeBoundingBox();
  return {
    bounds: geometry.boundingBox!,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    position,
    triangles: position.count / 3,
  };
}

function minimumRadiusAt(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, z: number) {
  let radius = Number.POSITIVE_INFINITY;
  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index) - z) < 1e-4) {
      radius = Math.min(radius, Math.hypot(position.getX(index), position.getY(index)));
    }
  }
  return radius;
}

function expectPrintable(params: ModelParams) {
  const geometry = createMetricNutKnobGeometry(params, model);
  const info = analyzeGeometry(geometry);
  expect(info.finite).toBe(true);
  expect(info.degenerateTriangles).toBe(0);
  expect(info.nonManifoldEdges).toBe(0);
  expect(info.triangles).toBeGreaterThan(4000);
  expect(info.bounds.min.z).toBeCloseTo(0, 4);
  expect(info.bounds.max.z).toBeCloseTo(
    params.handleHeight + params.guardHeight,
    4,
  );
  geometry.dispose();
}

test("builds a soft triangular handle with an independently tunable retention collar", () => {
  const defaults = getDefaultParams(model);
  const spec = getMetricNutKnobSpec(defaults, model);
  expect(spec.handleProfile).toBe("rounded-triangle");
  expect(spec.triangleCornerRadius).toBeCloseTo(5.5, 4);
  expect(spec.triangleSideBulge).toBeCloseTo(2.4, 4);
  expect(spec.boltHoleDiameter).toBeCloseTo(8.35, 4);
  expect(spec.retentionDiameter).toBeCloseTo(7.8, 4);
  expect(spec.retentionDiameter).toBeLessThan(defaults.boltDiameter);
  expect(spec.thinnestHandleWall).toBeGreaterThanOrEqual(
    model.geometry.minimumWallThickness,
  );

  const geometry = createMetricNutKnobGeometry(defaults, model);
  const info = analyzeGeometry(geometry);
  const bandStart =
    spec.overallHeight - spec.retentionLeadIn - spec.retentionBandHeight;
  expect(minimumRadiusAt(info.position, bandStart)).toBeCloseTo(
    spec.retentionDiameter / 2,
    4,
  );
  expectPrintable(defaults);
  geometry.dispose();

  const loose = { ...defaults, retentionInterference: 0 };
  const looseSpec = getMetricNutKnobSpec(loose, model);
  expect(looseSpec.retentionDiameter).toBeCloseTo(loose.boltDiameter, 4);
  expectPrintable(loose);

  const large = {
    ...defaults,
    knobDiameter: 52,
    handleHeight: 14,
    triangleCornerRadius: 7,
    triangleSideBulge: 4,
    handleRoundover: 2.2,
    guardBaseDiameter: 20,
    guardTopDiameter: 16,
    guardHeight: 12,
    boltDiameter: 10,
    boltClearance: 0.45,
    nutAcrossFlats: 17,
    nutClearance: 0.35,
    nutPocketDepth: 8,
    nutLeadIn: 0.6,
    retentionInterference: 0.3,
    retentionBandHeight: 1.6,
    retentionLeadIn: 1,
  };
  expectPrintable(large);
  expect(getParameterLimits(model, defaults, "guardHeight").min).toBeCloseTo(
    defaults.retentionBandHeight + defaults.retentionLeadIn * 2 + 0.4,
    5,
  );
});

test("renders, edits, persists, audits, and exports the triangular retaining knob", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=triangular-retaining-knob&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Triangle Nut Knob" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Triangle Nut Knob model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Handle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bolt retention" })).toBeVisible();
  await expect(page.getByText("7.8 mm retention collar", { exact: false })).toBeVisible();

  await page.getByLabel("Triangle tip span in millimeters").fill("44");
  await page.getByLabel("Palm-side bow in millimeters").fill("3.5");
  await page.getByLabel("Thread retention interference in millimeters").fill("0.3");
  await expect.poll(() => new URL(page.url()).searchParams.get("knobDiameter")).toBe("44");
  await expect.poll(() => new URL(page.url()).searchParams.get("triangleSideBulge")).toBe("3.5");
  await expect.poll(() => new URL(page.url()).searchParams.get("retentionInterference")).toBe("0.3");

  await page.reload();
  await expect(page.getByLabel("Triangle tip span in millimeters")).toHaveValue("44.0");
  await expect(page.getByLabel("Thread retention interference in millimeters")).toHaveValue("0.3");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ),
  ]);
  expect(download.suggestedFilename()).toContain("triangular-retaining-knob-bolt-8");
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
  exported.dispose();
  expect(pageErrors).toEqual([]);
});

test("keeps the triangular knob controls contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?model=triangular-retaining-knob&unit=mm");
  const title = page.getByRole("heading", { name: "Triangle Nut Knob" });
  await expect(title).toBeVisible();
  expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByLabel("Thread retention interference in millimeters")).toBeVisible();
});
