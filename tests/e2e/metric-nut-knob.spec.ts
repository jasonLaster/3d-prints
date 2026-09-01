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
    path.join(root, "public/models/metric-nut-knob/model.json"),
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
    triangles: position.count / 3,
  };
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

test("keeps the handle, guard, bore, and nut pocket independently parametric", () => {
  const defaults = getDefaultParams(model);
  const spec = getMetricNutKnobSpec(defaults, model);
  expect(spec.lobeCount).toBe(6);
  expect(spec.knobDiameter).toBeCloseTo(25.038, 4);
  expect(spec.handleHeight).toBeCloseTo(9.375, 4);
  expect(spec.guardHeight).toBeCloseTo(7.625, 4);
  expect(spec.overallHeight).toBeCloseTo(17, 4);
  expect(spec.boltHoleDiameter).toBeCloseTo(8.102, 4);
  expect(spec.nutPocketAcrossFlats).toBeCloseTo(13.106, 4);
  expect(spec.nutPocketDepth).toBeCloseTo(5.705, 4);
  expect(spec.pocketRoofThickness).toBeCloseTo(3.67, 4);
  expect(spec.thinnestHandleWall).toBeGreaterThanOrEqual(
    model.geometry.minimumWallThickness,
  );
  expectPrintable(defaults);

  const largeTapered = {
    ...defaults,
    knobDiameter: 40,
    handleHeight: 14,
    lobeCount: 8,
    lobeDepth: 4,
    lobeRadius: 5.5,
    handleRoundover: 2,
    guardBaseDiameter: 20,
    guardTopDiameter: 14,
    guardHeight: 12,
    boltDiameter: 10,
    boltClearance: 0.4,
    nutAcrossFlats: 17,
    nutClearance: 0.4,
    nutPocketDepth: 8,
    nutLeadIn: 0.6,
  };
  const largeSpec = getMetricNutKnobSpec(largeTapered, model);
  expect(largeSpec.lobeCount).toBe(8);
  expect(largeSpec.guardBaseDiameter).not.toBe(largeSpec.guardTopDiameter);
  expect(largeSpec.boltHoleDiameter).toBeCloseTo(10.4, 5);
  expect(largeSpec.nutPocketAcrossFlats).toBeCloseTo(17.4, 5);
  expectPrintable(largeTapered);

  const small = {
    ...defaults,
    knobDiameter: 18,
    handleHeight: 5,
    lobeCount: 5,
    lobeDepth: 1.5,
    lobeRadius: 2,
    handleRoundover: 0.6,
    guardBaseDiameter: 8,
    guardTopDiameter: 7,
    guardHeight: 3,
    boltDiameter: 3,
    boltClearance: 0.3,
    nutAcrossFlats: 5.5,
    nutClearance: 0.3,
    nutPocketDepth: 2.5,
    nutLeadIn: 0.2,
  };
  expectPrintable(small);

  expect(getParameterLimits(model, defaults, "nutPocketDepth").max).toBeCloseTo(
    defaults.handleHeight - model.geometry.minimumRoofThickness,
    5,
  );
  expect(getParameterLimits(model, defaults, "guardBaseDiameter").min).toBeCloseTo(
    spec.boltHoleDiameter + model.geometry.minimumWallThickness * 2,
    5,
  );
});

test("renders, edits, persists, audits, and exports the metric nut knob", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=metric-nut-knob&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Metric Nut Knob" }),
  ).toBeVisible();
  await expect(page.getByLabel("Metric Nut Knob model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Handle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spacer / guard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fastener fit" })).toBeVisible();
  await expect(page.getByText("Fastener interfaces")).toBeVisible();
  await expect(page.getByText("Pocket roof thickness")).toBeVisible();
  await expect(page.getByText("Minimum radial walls")).toBeVisible();

  await page.getByLabel("Handle height in millimeters").fill("12");
  await page.getByRole("spinbutton", { name: "Grip lobe count" }).fill("8");
  await page.getByLabel("Spacer / guard height in millimeters").fill("10");
  await page.getByLabel("Spacer / guard top diameter in millimeters").fill("13");
  await expect.poll(() => new URL(page.url()).searchParams.get("handleHeight")).toBe("12");
  await expect.poll(() => new URL(page.url()).searchParams.get("lobeCount")).toBe("8");
  await expect.poll(() => new URL(page.url()).searchParams.get("guardHeight")).toBe("10");
  await expect.poll(() => new URL(page.url()).searchParams.get("guardTopDiameter")).toBe("13");

  await page.reload();
  await expect(page.getByLabel("Handle height in millimeters")).toHaveValue("12.0");
  await expect(
    page.getByRole("spinbutton", { name: "Grip lobe count" }),
  ).toHaveValue("8");
  await expect(page.getByLabel("Spacer / guard height in millimeters")).toHaveValue("10.0");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ),
  ]);
  expect(download.suggestedFilename()).toContain(
    "metric-nut-knob-bolt-8-nut-af-13-handle-25.04x12-guard-15x13x10.stl",
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
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(22, 2);
  exported.dispose();
  expect(pageErrors).toEqual([]);
});

test("keeps the metric nut knob title and inspector contained on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?model=metric-nut-knob&unit=mm");
  const title = page.getByRole("heading", { name: "Metric Nut Knob" });
  await expect(title).toBeVisible();
  expect(
    await title.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const scene = await page.getByLabel("Metric Nut Knob model viewer").boundingBox();
  const inspector = await page.getByRole("heading", { name: "Inspector" }).boundingBox();
  expect(scene).not.toBeNull();
  expect(inspector).not.toBeNull();
  expect(inspector!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
  await expect(page.getByRole("spinbutton", { name: "Grip lobe count" })).toBeVisible();
});
