import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createBandsawSledBaseGeometry,
  createBandsawSledFenceGeometry,
  createBandsawSledPartGeometries,
  createBandsawSledPreviewParts,
  getBandsawSledSpec,
  getDefaultParams,
  getParameterLimits,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/bandsaw-sled/model.json"), "utf8"),
) as Extract<ModelDefinition, { viewer: "bandsaw-sled-v1" }>;

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
  const result = {
    bounds: source.boundingBox!.clone(),
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

test("builds the wood sled around four watertight printed parts", () => {
  const params = getDefaultParams(model);
  const spec = getBandsawSledSpec(params, model);
  expect(spec.fenceTravelMin).toBeCloseTo(32.5, 5);
  expect(spec.fenceTravelMax).toBeCloseTo(77.5, 5);
  expect(spec.boardBoltEngagement).toBeCloseTo(5.5, 5);
  expect(spec.lockEngagement).toBeCloseTo(13, 5);
  expect(spec.baseInsertFloor).toBeCloseTo(5, 5);
  expect(spec.baseInsertStationY).toBeCloseTo(109, 5);
  expect(spec.insertShoulder).toBeCloseTo(4, 5);
  expect(spec.bracketGussetLengthRatio).toBeCloseTo(0.5, 5);
  expect(spec.bracketGussetDepth).toBeCloseTo(45, 5);
  expect(spec.baseSupportMargin).toBeCloseTo(6, 5);
  expect(spec.bracketDeflection).toBeLessThanOrEqual(
    model.geometry.maximumScreenDeflection,
  );
  expect(spec.bracketSafetyFactor).toBeGreaterThanOrEqual(
    model.geometry.minimumScreenSafetyFactor,
  );

  const base = createBandsawSledBaseGeometry(params, model);
  const baseTopology = analyzeGeometry(base);
  expect(baseTopology.finite).toBe(true);
  expect(baseTopology.degenerateTriangles).toBe(0);
  expect(baseTopology.nonManifoldEdges).toBe(0);
  expect(baseTopology.bounds.max.x - baseTopology.bounds.min.x).toBeCloseTo(420, 3);
  expect(baseTopology.bounds.max.y - baseTopology.bounds.min.y).toBeCloseTo(320, 3);
  base.dispose();

  const fence = createBandsawSledFenceGeometry(params, model);
  const fenceTopology = analyzeGeometry(fence);
  expect(fenceTopology.finite).toBe(true);
  expect(fenceTopology.degenerateTriangles).toBe(0);
  expect(fenceTopology.nonManifoldEdges).toBe(0);
  expect(fenceTopology.bounds.min.z).toBeCloseTo(18, 3);
  fence.dispose();

  const parts = createBandsawSledPartGeometries(params, model);
  expect(parts.map((part) => part.key)).toEqual([
    "left-bracket",
    "right-bracket",
    "left-lock-knob",
    "right-lock-knob",
  ]);
  parts.forEach((part) => {
    const topology = analyzeGeometry(part.geometry);
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    expect(topology.bounds.min.z).toBeCloseTo(0, 5);
    part.geometry.dispose();
  });

  const preview = createBandsawSledPreviewParts(params, model);
  expect(preview.filter((part) => part.material === "wood")).toHaveLength(3);
  expect(preview.filter((part) => part.material === "brass")).toHaveLength(6);
  expect(preview.filter((part) => part.key.startsWith("board-bolt"))).toHaveLength(4);
  expect(preview.filter((part) => part.key.startsWith("lock-bolt"))).toHaveLength(2);
  preview.forEach((part) => part.geometry.dispose());
});

test("couples fence travel, bracket spacing, slots, and insert floors", () => {
  const defaults = getDefaultParams(model);
  expect(getParameterLimits(model, defaults, "fencePosition")).toMatchObject({
    min: 32.5,
    max: 77.5,
  });
  expect(
    getParameterLimits(model, { ...defaults, fenceWidth: 330 }, "bracketSpacing").max,
  ).toBe(248);
  expect(
    getParameterLimits(model, { ...defaults, bracketDepth: 76 }, "lockSlotLength").max,
  ).toBe(52);
  expect(getParameterLimits(model, defaults, "baseDepth").min).toBe(320);
  expect(
    getParameterLimits(model, defaults, "bracketDepth").max,
  ).toBeCloseTo(203.2, 5);
  expect(
    getParameterLimits(model, defaults, "bracketDepth").min,
  ).toBeCloseTo(76, 5);
  expect(
    getParameterLimits(
      model,
      { ...defaults, bracketDepth: 203.2 },
      "baseDepth",
    ).min,
  ).toBe(545);
  expect(
    getParameterLimits(model, { ...defaults, baseThickness: 17 }, "baseInsertDepth").max,
  ).toBe(13);
  expect(
    getParameterLimits(model, { ...defaults, baseInsertDepth: 15 }, "baseThickness").min,
  ).toBe(19);
});

test("keeps an 8 inch bracket manifold with its proportional 4 inch gusset", () => {
  const params = {
    ...getDefaultParams(model),
    baseDepth: 545,
    bracketDepth: 203.2,
  };
  const spec = getBandsawSledSpec(params, model);
  expect(spec.bracketDepth).toBeCloseTo(203.2, 5);
  expect(spec.bracketGussetDepth).toBeCloseTo(101.6, 5);
  expect(spec.baseInsertStationY).toBeCloseTo(165.6, 5);
  expect(spec.baseSupportMargin).toBeGreaterThanOrEqual(
    model.geometry.minimumBaseEdgeMargin,
  );
  expect(spec.fenceTravelMin).toBeCloseTo(32.5, 5);
  expect(spec.fenceTravelMax).toBeCloseTo(77.5, 5);

  const parts = createBandsawSledPartGeometries(params, model);
  for (const part of parts) {
    const topology = analyzeGeometry(part.geometry);
    expect(topology.finite).toBe(true);
    expect(topology.degenerateTriangles).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    if (part.key.includes("bracket")) {
      expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(203.2, 3);
    }
    part.geometry.dispose();
  }
});

test("renders material roles, moves the fence, audits hardware, and exports four STLs", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=bandsaw-sled&unit=mm");
  await expect(page.getByRole("heading", { name: "Adjustable Fence Bandsaw Sled" })).toBeVisible();
  await expect(page.getByLabel("Adjustable Fence Bandsaw Sled model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Bandsaw sled material legend")).toContainText("Wood cut parts");
  await expect(page.getByLabel("Bandsaw sled material legend")).toContainText("Printed STL parts");
  await expect(page.getByTestId("viewer-status")).toContainText("Printed brackets × 2");
  await expect(page.getByText("Wood: 1 plywood base, 1 sacrificial fence, 1 hardwood runner")).toBeVisible();
  await expect(page.locator(".audit-row").filter({ hasText: "Threaded inserts" })).toContainText("4 M5 heat-set inserts");
  await expect(page.locator(".audit-row").filter({ hasText: "Fence adjustment travel" })).toContainText("32.5 mm–77.5 mm");
  await expect(page.locator(".audit-row").filter({ hasText: "Bracket strength screen" })).toContainText("safety factor");
  await expect(page.locator(".audit-row").filter({ hasText: "Bracket and gusset lengths" })).toContainText("base margin");

  const baseDepth = page.getByLabel("Wood base depth in millimeters");
  const bracketLength = page.getByLabel("Printed bracket length in millimeters");
  await bracketLength.fill("203.2");
  await expect(baseDepth).toHaveValue("545.0");
  await expect(bracketLength).toHaveValue("203.2");
  await expect(page.getByLabel("Triangular gusset length in millimeters")).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("bracketDepth")).toBe("203.2");
  await expect.poll(() => new URL(page.url()).searchParams.has("bracketGussetDepth")).toBe(false);
  const bracketAudit = page.locator(".audit-row").filter({ hasText: "Bracket and gusset lengths" });
  await expect(bracketAudit).toContainText("203.2 mm bracket");
  await expect(bracketAudit).toContainText("101.6 mm gusset (50%)");
  await expect(page.getByTestId("viewer-status")).toContainText("gusset 101.6 mm (50%)");

  const fencePosition = page.getByLabel("Fence setback from sled center in millimeters");
  await fencePosition.fill("70");
  await expect.poll(() => new URL(page.url()).searchParams.get("fencePosition")).toBe("70");
  await page.reload();
  await expect(fencePosition).toHaveValue("70.0");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();

  const downloads: Array<import("@playwright/test").Download> = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page.getByRole("button", { name: "Export 4 printed-part STLs" }).click();
  await expect.poll(() => downloads.length).toBe(4);
  expect(downloads.map((download) => download.suggestedFilename())).toEqual([
    expect.stringMatching(/-bracket-203\.2-gusset-101\.6-left-bracket\.stl$/),
    expect.stringContaining("-right-bracket.stl"),
    expect.stringContaining("-left-lock-knob.stl"),
    expect.stringContaining("-right-lock-knob.stl"),
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
