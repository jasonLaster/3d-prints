import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createMiterRunnerWedgeGeometry,
  getDefaultParams,
  getMiterRunnerWedgeSpec,
  getParameterLimits,
  type ModelDefinition,
  type ModelParams,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/miter-runner-wedge/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "miter-runner-wedge-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
  const directedEdges = new Map<string, number>();
  const key = (index: number) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let degenerateTriangles = 0;
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
  };
}

function expectPrintable(params: ModelParams) {
  const geometry = createMiterRunnerWedgeGeometry(params, model);
  const info = analyzeGeometry(geometry);
  expect(info.finite).toBe(true);
  expect(info.degenerateTriangles).toBe(0);
  expect(info.nonManifoldEdges).toBe(0);
  expect(info.inconsistentEdges).toBe(0);
  expect(info.bounds.min.z).toBeCloseTo(0, 4);
  geometry.dispose();
}

test("derives width from the slot while preserving the source wedge angles", () => {
  const defaults = getDefaultParams(model);
  const source = getMiterRunnerWedgeSpec(defaults, model);
  expect(source.slotWidth).toBeCloseTo(19.05, 6);
  expect(source.runningClearance).toBeCloseTo(0.25, 6);
  expect(source.finishedRunnerWidth).toBeCloseTo(18.8, 6);
  expect(source.addedWidth).toBeCloseTo(0, 6);
  expect(source.length).toBeCloseTo(240.084127, 5);
  expect(source.thickness).toBeCloseTo(5.5, 6);
  expect(source.taperAngleDegrees).toBeCloseTo(1, 5);
  expect(source.nearEndBevelDegrees).toBeCloseTo(40, 5);
  expect(source.farEndBevelDegrees).toBeCloseTo(40, 5);
  expect(source.plateMarginPerEnd).toBeGreaterThan(4.9);
  expectPrintable(defaults);

  const wider = { ...defaults, miterSlotWidth: 19.7, runningClearance: 0.2 };
  const widenedSpec = getMiterRunnerWedgeSpec(wider, model);
  expect(widenedSpec.finishedRunnerWidth).toBeCloseTo(19.5, 6);
  expect(widenedSpec.addedWidth).toBeCloseTo(0.7, 6);
  expect(widenedSpec.taperAngleDegrees).toBeCloseTo(1, 5);
  expect(widenedSpec.nearEndBevelDegrees).toBeCloseTo(40, 5);
  expect(widenedSpec.farEndBevelDegrees).toBeCloseTo(40, 5);
  expectPrintable(wider);

  expect(getParameterLimits(model, defaults, "miterSlotWidth").min).toBeCloseTo(
    18.8,
    6,
  );
  expect(getParameterLimits(model, defaults, "runningClearance").max).toBeCloseTo(
    0.25,
    6,
  );
  expect(
    getParameterLimits(
      model,
      { ...defaults, miterSlotWidth: 20.5, runningClearance: 0 },
      "runningClearance",
    ).max,
  ).toBeCloseTo(0.6, 6);
});

test("renders, persists, audits, and exports the selected wedge fit", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=miter-runner-wedge&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Adjustable Miter Runner Wedge" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Adjustable Miter Runner Wedge model viewer"),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Slot fit" })).toBeVisible();
  await expect(page.getByText("Finished runner: 18.80 mm · source width")).toBeVisible();
  await expect(page.getByText("Preserved source angles", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixed Main Part datum", { exact: true })).toBeVisible();
  await expect(page.getByText("250 mm plate fit", { exact: true })).toBeVisible();

  await page.getByLabel("Measured miter slot width in millimeters").fill("18.9");
  await expect(
    page.getByLabel("Total running clearance in millimeters"),
  ).toHaveValue("0.10");
  await expect.poll(() => new URL(page.url()).searchParams.get("runningClearance")).toBe(
    "0.1",
  );
  await expect(page.getByText("Finished runner: 18.80 mm · source width")).toBeVisible();

  await page.getByLabel("Measured miter slot width in millimeters").fill("19.4");
  await page.getByLabel("Total running clearance in millimeters").fill("0.2");
  await expect.poll(() => new URL(page.url()).searchParams.get("miterSlotWidth")).toBe(
    "19.4",
  );
  await expect.poll(() => new URL(page.url()).searchParams.get("runningClearance")).toBe(
    "0.2",
  );
  await expect(page.getByText("Finished runner: 19.20 mm · wedge adds 0.40 mm")).toBeVisible();

  await page.reload();
  await expect(
    page.getByLabel("Measured miter slot width in millimeters"),
  ).toHaveValue("19.40");
  await expect(
    page.getByLabel("Total running clearance in millimeters"),
  ).toHaveValue("0.20");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ),
  ]);
  expect(download.suggestedFilename()).toBe(
    "miter-runner-wedge-runner-19.2-slot-19.4-clearance-0.2.stl",
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
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(240.084127, 3);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(
    19.2 - model.geometry.interfaceEndX,
    3,
  );
  exported.dispose();
  expect(pageErrors).toEqual([]);
});

test("keeps precision and layout usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?model=miter-runner-wedge&unit=in");
  const title = page.getByRole("heading", {
    name: "Adjustable Miter Runner Wedge",
  });
  await expect(title).toBeVisible();
  expect(
    await title.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Measured miter slot width in inches")).toHaveValue(
    "0.750",
  );
  await expect(page.getByLabel("Total running clearance in inches")).toHaveValue(
    "0.010",
  );
  await expect(page.getByText("Finished runner: 0.740 in · source width")).toBeVisible();

  const scene = await page
    .getByLabel("Adjustable Miter Runner Wedge model viewer")
    .boundingBox();
  const inspector = await page.getByRole("heading", { name: "Inspector" }).boundingBox();
  expect(scene).not.toBeNull();
  expect(inspector).not.toBeNull();
  expect(inspector!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
});
