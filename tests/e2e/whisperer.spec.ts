import { expect, test, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
} from "../../src/models/diningTable";
import { getDefaultParams } from "../../src/models/shared";
import type { DiningTableModelDefinition } from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/whisperer/model.json"), "utf8"),
) as DiningTableModelDefinition;

test("builds the plan-derived Whisperer geometry without separate hardware", () => {
  const params = getDefaultParams(model);
  const geometry = createDiningTableWoodGeometry(params, model);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");

  expect(bounds.max.x - bounds.min.x).toBeCloseTo(182.88, 2);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(101.6, 2);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(76.2, 2);
  expect(bounds.min.z).toBeCloseTo(0, 4);
  expect(
    Array.from({ length: position.count }, (_, index) => [
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ]).flat().every(Number.isFinite),
  ).toBe(true);

  const hardware = createDiningTableHardwareGeometries(params);
  expect(hardware.plates).toEqual([]);
  expect(hardware.channels).toEqual([]);
  geometry.dispose();
});

test("renders, persists a plan parameter, and exports one Whisperer STL", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=whisperer&unit=in");
  await expect(page.getByRole("heading", { name: "Whisperer" })).toBeVisible();
  await expect(page.getByLabel("Whisperer model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Table length in inches")).toHaveValue("72");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("40");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 3/4");
  const bevelInset = page.getByLabel("Underside bevel inset in inches");
  await expect(bevelInset).toHaveValue("5");
  await bevelInset.fill("4 1/2");
  await bevelInset.press("Enter");
  await expect(page).toHaveURL(/undersideBevelInset=4\.5/);
  await page.reload();
  await expect(bevelInset).toHaveValue("4 1/2");
  await expect(page.getByText(/15° splay/)).toBeVisible();
  await expect(page.getByText(/1 top · 4 legs/)).toBeVisible();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download: Download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "whisperer-scale-1-10-length-1828.8-width-1016.0.stl",
  );
  const downloadPath = await download.path();
  const buffer = fs.readFileSync(downloadPath!);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const exported = new STLLoader().parse(arrayBuffer);
  exported.computeBoundingBox();
  expect(exported.boundingBox!.min.z).toBeCloseTo(0, 3);
  expect(
    exported.boundingBox!.max.z - exported.boundingBox!.min.z,
  ).toBeCloseTo(76.2, 1);
  const exportedPosition = exported.getAttribute("position");
  let bedMinX = Infinity;
  let bedMaxX = -Infinity;
  let bedMinY = Infinity;
  let bedMaxY = -Infinity;
  for (let index = 0; index < exportedPosition.count; index += 1) {
    if (
      Math.abs(
        exportedPosition.getZ(index) - exported.boundingBox!.min.z,
      ) > 1e-4
    ) {
      continue;
    }
    bedMinX = Math.min(bedMinX, exportedPosition.getX(index));
    bedMaxX = Math.max(bedMaxX, exportedPosition.getX(index));
    bedMinY = Math.min(bedMinY, exportedPosition.getY(index));
    bedMaxY = Math.max(bedMaxY, exportedPosition.getY(index));
  }
  expect(bedMaxX - bedMinX).toBeGreaterThan(180);
  expect(bedMaxY - bedMinY).toBeGreaterThan(100);
  exported.dispose();
  expect(pageErrors).toEqual([]);
});
