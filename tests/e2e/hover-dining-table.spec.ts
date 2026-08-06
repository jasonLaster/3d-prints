import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createHoverDiningTableGeometry,
  getHoverDiningTableSpec,
} from "../../src/models/hoverDiningTable";
import type {
  HoverDiningTableModelDefinition,
  ModelParams,
} from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/hover-dining-table/model.json"),
    "utf8",
  ),
) as HoverDiningTableModelDefinition;
const defaultParams = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
) as ModelParams;

function inspectGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");
  let finite = true;
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const ab = [
      position.getX(index + 1) - ax,
      position.getY(index + 1) - ay,
      position.getZ(index + 1) - az,
    ];
    const ac = [
      position.getX(index + 2) - ax,
      position.getY(index + 2) - ay,
      position.getZ(index + 2) - az,
    ];
    finite &&= [ax, ay, az, ...ab, ...ac].every(Number.isFinite);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 <= 1e-12) {
      degenerateTriangles += 1;
    }
  }
  return {
    finite,
    degenerateTriangles,
    position,
    min: bounds.min.clone(),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function inspectStl(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const result = inspectGeometry(geometry);
  geometry.dispose();
  return result;
}

test("derives two centered half-lapped Xs with direct tabletop and floor contact", () => {
  const { fullSize, scaled } = getHoverDiningTableSpec(defaultParams);
  expect(fullSize.frameHeight).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.upperBrace.zTop).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.lowerBrace.zBottom).toBeCloseTo(0, 6);
  expect(fullSize.upperBrace.halfLapDepth).toBeCloseTo(
    fullSize.upperBrace.thickness / 2,
    6,
  );
  expect(fullSize.lowerBrace.halfLapDepth).toBeCloseTo(
    fullSize.lowerBrace.thickness / 2,
    6,
  );
  expect(fullSize.upperBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.upperBrace.spanX, fullSize.upperBrace.spanY),
    6,
  );
  expect(fullSize.lowerBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.lowerBrace.spanX, fullSize.lowerBrace.spanY),
    6,
  );
  expect(fullSize.upperBrace.angleRadians).toBeGreaterThan(0);
  expect(fullSize.lowerBrace.angleRadians).toBeGreaterThan(0);

  const geometry = createHoverDiningTableGeometry(defaultParams, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  expect(inspected.min.z).toBeCloseTo(0, 5);
  expect(inspected.size.x).toBeCloseTo(scaled.length, 4);
  expect(inspected.size.y).toBeCloseTo(scaled.width, 4);
  expect(inspected.size.z).toBeCloseTo(scaled.height, 4);

  let centralFloorVertices = 0;
  let centralUpperContactVertices = 0;
  for (let index = 0; index < inspected.position.count; index += 1) {
    const x = inspected.position.getX(index);
    const z = inspected.position.getZ(index);
    if (Math.abs(x) > scaled.length / 8) continue;
    if (Math.abs(z) < 1e-4) centralFloorVertices += 1;
    if (Math.abs(z - scaled.topBottom) < 1e-4) {
      centralUpperContactVertices += 1;
    }
  }
  expect(centralFloorVertices).toBeGreaterThan(0);
  expect(centralUpperContactVertices).toBeGreaterThan(0);
  geometry.dispose();
});

test("renders, manipulates, and exports the walnut X-Hover table", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(
    page.getByRole("heading", { name: "X-Hover Dining Table" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByLabel("Mock scale denominator")).toHaveValue("10");
  await expect(page.getByLabel("Table length in inches")).toHaveValue("75");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("29 1/2");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Long-edge roll depth in inches")).toHaveValue("5/8");
  await expect(page.getByLabel("End-box inner corner radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Upper-X brace width in inches")).toHaveValue("1 3/4");
  await expect(page.getByLabel("Upper-X brace thickness in inches")).toHaveValue("1");
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Floor-X brace thickness in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(page.getByLabel("Tabletop hover gap in inches")).toHaveCount(0);
  await expect(page.getByLabel("Lengthwise stretcher height in inches")).toHaveCount(0);
  await expect(page.getByLabel("Bézier curve editor")).toBeVisible();
  await expect(
    page.getByLabel("Tabletop edge curve tension Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Inner corner curve tension Bézier tension"),
  ).toHaveValue("0.580");

  await expect(page.getByText("75 in × 35 1/2 in × 29 1/2 in")).toBeVisible();
  await expect(page.getByText("2 × 32 in wide closed boxes")).toBeVisible();
  await expect(page.getByText("0 in bottom spread")).toBeVisible();
  await expect(page.getByText(/2 × .* at ±\d+\.\d°/).first()).toBeVisible();
  await expect(
    page.getByText("2 centered · 50% depth · 0 in fit clearance"),
  ).toBeVisible();
  await expect(page.getByText(/upper Z 28 1\/4 in · lower Z 0 in · zero gaps/)).toBeVisible();
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(11);

  await page.getByLabel("Table width in inches").fill("36");
  await expect(page.getByText("2 × 32 1/2 in wide closed boxes")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("1");
  await expect(page.getByText("+1 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("-1/2");
  await expect(page.getByText("-1/2 in bottom spread")).toBeVisible();
  await page.getByLabel("Floor-X brace width in inches").fill("2 1/8");
  await expect(page).toHaveURL(/lowerBraceWidth=2\.126/);
  await page.getByLabel("Half-lap fit clearance in inches").fill("1/32");
  await expect(page).toHaveURL(/halfLapClearance=0\.0315/);
  await page
    .getByLabel("Inner corner curve tension Bézier tension")
    .fill("0.65");
  await expect(page).toHaveURL(/frameInnerCurveTension=0\.65/);
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(11);

  await page.getByRole("button", { name: "Reset parameters" }).click();
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(
    page.getByLabel("Inner corner curve tension Bézier tension"),
  ).toHaveValue("0.580");

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "hover-dining-table-scale-1-10-length-1905.0-width-901.7.stl",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const stl = inspectStl(fs.readFileSync(downloadPath!));
  expect(stl.finite).toBe(true);
  expect(stl.degenerateTriangles).toBe(0);
  expect(stl.min.z).toBeCloseTo(0, 3);
  expect(stl.size.x).toBeCloseTo(190.5, 1);
  expect(stl.size.y).toBeCloseTo(90.17, 1);
  expect(stl.size.z).toBeCloseTo(74.93, 1);
  expect(pageErrors).toEqual([]);
});
