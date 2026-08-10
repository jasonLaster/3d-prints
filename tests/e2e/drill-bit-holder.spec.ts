import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createDrillBitHolderGeometry,
  getDefaultParams,
  getDrillBitHolderLayout,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/drill-bit-holder/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "drill-bit-holder-v1" }>;

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
  const bounds = geometry.boundingBox!;
  return {
    bounds,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    triangles: position.count / 3,
  };
}

test("derives a compact, watertight holder around the requested bit set", () => {
  const params = getDefaultParams(model);
  const layout = getDrillBitHolderLayout(params, model);
  expect(layout.bitDiameters).toEqual([
    3.175,
    3.96875,
    4.7625,
    6.35,
    7.9375,
    9.525,
    12.7,
  ]);
  expect(layout.holeDiameters).toEqual(
    layout.bitDiameters.map((diameter) => diameter + 0.5),
  );
  expect(layout.length).toBeCloseTo(76.31875, 5);
  expect(layout.width).toBeCloseTo(19.6, 5);
  expect(layout.height).toBe(24);
  expect(layout.floorThickness).toBe(4);

  for (let index = 1; index < layout.holeCenters.length; index += 1) {
    const centerDistance = layout.holeCenters[index] - layout.holeCenters[index - 1];
    const radii =
      layout.holeDiameters[index] / 2 + layout.holeDiameters[index - 1] / 2;
    expect(centerDistance - radii).toBeCloseTo(3, 5);
  }

  const geometry = createDrillBitHolderGeometry(params, model);
  const topology = analyzeGeometry(geometry);
  expect(topology.finite).toBe(true);
  expect(topology.degenerateTriangles).toBe(0);
  expect(topology.nonManifoldEdges).toBe(0);
  expect(topology.triangles).toBeGreaterThan(1500);
  expect(topology.bounds.min.z).toBeCloseTo(0, 5);
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(
    layout.length,
    3,
  );
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(
    layout.width,
    3,
  );
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(24, 3);

  for (let index = 0; index < layout.holeCenters.length; index += 1) {
    const radius = layout.holeDiameters[index] / 2;
    const position = geometry.getAttribute("position");
    const hasFloorRimVertex = Array.from({ length: position.count }, (_, vertex) => vertex)
      .some(
        (vertex) =>
          Math.abs(position.getX(vertex) - (layout.holeCenters[index] + radius)) < 1e-3 &&
          Math.abs(position.getY(vertex)) < 1e-3 &&
          Math.abs(position.getZ(vertex) - layout.floorThickness) < 1e-3,
      );
    expect(hasFloorRimVertex).toBe(true);
  }
  geometry.dispose();

  const looser = getDrillBitHolderLayout(
    { ...params, bitClearance: 0.8, bitSpacing: 4 },
    model,
  );
  expect(looser.length - layout.length).toBeCloseTo(8.1, 5);
  expect(looser.width - layout.width).toBeCloseTo(0.3, 5);

  const customBits = getDrillBitHolderLayout(
    {
      ...params,
      bitCount: 3,
      bitDiameter1: 6.35,
      bitDiameter2: 9.525,
      bitDiameter3: 12.7,
    },
    model,
  );
  expect(customBits.bitDiameters[0]).toBe(6.35);
  expect(customBits.bitDiameters).toEqual([6.35, 9.525, 12.7]);
  expect(customBits.length).toBeCloseTo(42.475, 5);
  expect(customBits.width).toBeCloseTo(19.6, 5);
});

test("renders, audits, edits, and exports the drill bit holder", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=drill-bit-holder&unit=in");
  await expect(page.getByRole("heading", { name: "Drill Bit Holder" })).toBeVisible();
  await expect(page.getByLabel("Drill Bit Holder model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByTestId("viewer-status")).not.toContainText("Bit count");
  const bitList = page.getByLabel("Bit diameters (in)");
  await expect(bitList).toHaveValue(
    "1/8, 5/32, 3/16, 1/4, 5/16, 3/8, 1/2",
  );
  await expect(page.getByLabel("Bit 1 diameter in inches")).toHaveCount(0);
  await expect(page.getByText("Current bit sizes")).toBeVisible();
  await expect(page.getByText("1/8 in · 5/32 in · 3/16 in · 1/4 in · 5/16 in · 3/8 in · 1/2 in")).toBeVisible();
  await expect(page.getByText("Compact envelope")).toBeVisible();

  await bitList.fill("1/8, 5/32, 3/16, 1/4, 5/16, 3/8, 1/2, 5/8");
  await bitList.press("Enter");
  await expect(
    page.getByText("1/8 in · 5/32 in · 3/16 in · 1/4 in · 5/16 in · 3/8 in · 1/2 in · 5/8 in"),
  ).toBeVisible();

  await bitList.fill("1/8, 1/4, 1/2");
  await bitList.blur();
  await expect(bitList).toHaveValue("1/8, 1/4, 1/2");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("bits"))
    .toBe("0.125,0.25,0.5");
  await expect(
    page.getByText("1/8 in · 1/4 in · 1/2 in"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bit diameters (in)")).toHaveValue(
    "1/8, 1/4, 1/2",
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click(),
    ),
  ]);
  expect(download.suggestedFilename()).toBe(
    "drill-bit-holder-bits-3.175_6.35_12.7-clearance-0.5-spacing-3-height-24-depth-20-radius-3.2-bevel-0.8.stl",
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
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(36.125, 1);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(19.6, 1);
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(24, 1);
  exported.dispose();
  expect(pageErrors).toEqual([]);
});
