import { expect, test, type Download } from "@playwright/test";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

function inspectStl(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");
  let finite = true;
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const a = new Float32Array([
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ]);
    const b = new Float32Array([
      position.getX(index + 1),
      position.getY(index + 1),
      position.getZ(index + 1),
    ]);
    const c = new Float32Array([
      position.getX(index + 2),
      position.getY(index + 2),
      position.getZ(index + 2),
    ]);
    finite &&= [...a, ...b, ...c].every(Number.isFinite);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 <= 1e-12) {
      degenerateTriangles += 1;
    }
  }
  let bedMinX = Infinity;
  let bedMaxX = -Infinity;
  let bedMinY = Infinity;
  let bedMaxY = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index) - bounds.min.z) > 1e-4) continue;
    bedMinX = Math.min(bedMinX, position.getX(index));
    bedMaxX = Math.max(bedMaxX, position.getX(index));
    bedMinY = Math.min(bedMinY, position.getY(index));
    bedMaxY = Math.max(bedMaxY, position.getY(index));
  }
  geometry.dispose();
  return {
    finite,
    degenerateTriangles,
    min: {
      x: bounds.min.x,
      y: bounds.min.y,
      z: bounds.min.z,
    },
    bedContactSize: {
      x: bedMaxX - bedMinX,
      y: bedMaxY - bedMinY,
    },
    size: {
      x: bounds.max.x - bounds.min.x,
      y: bounds.max.y - bounds.min.y,
      z: bounds.max.z - bounds.min.z,
    },
  };
}

test("renders the oak table and exports the registered two-color 1:10 mock", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=dining-table&unit=in");
  await expect(page.getByRole("heading", { name: "Oak Dining Table" })).toBeVisible();
  await expect(page.getByLabel("Oak Dining Table model viewer")).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByLabel("Mock scale denominator")).toHaveValue("10");
  await expect(page.getByLabel("Table length in inches")).toHaveValue("76");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("38");
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("30");
  await expect(page.getByLabel("Leg post size in inches")).toHaveValue("4");
  const otherCornerRadii = page.getByLabel("Other three post corner radii in inches");
  const outerCornerRadius = page.getByLabel("Outer post corner radius in inches");
  await expect(otherCornerRadii).toHaveValue("1");
  await expect(outerCornerRadius).toHaveValue("1");
  await outerCornerRadius.fill("1/2");
  await expect(outerCornerRadius).toHaveValue("1/2");
  await expect(otherCornerRadii).toHaveValue("1");
  await expect(page.getByText("1/2 in outer · 1 in other three")).toBeVisible();
  const grooveToggle = page.getByLabel("Post-top groove / rabbet");
  await expect(grooveToggle).toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toHaveValue("1/4");
  await expect(page.getByLabel("Post groove depth in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Leg top shoulder roundover radius in inches")).toHaveValue("1/4");
  await expect(page.getByLabel("Leg bottom roundover radius in inches")).toHaveValue("1/4");
  await expect(page.getByText("1/4 in high × 1/8 in deep; 1/4 in shoulder")).toBeVisible();
  await expect(page.getByLabel("Plate edge setback in inches")).toHaveValue("1/2");
  await expect(page.getByText("16 in · 38 in · 60 in")).toBeVisible();
  await expect(page.getByText("1:10; 193.0 × 96.5 × 76.2 mm")).toBeVisible();

  await page.getByText("Post-top groove / rabbet", { exact: true }).click();
  await expect(grooveToggle).not.toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toHaveCount(0);
  await expect(page.getByLabel("Post groove depth in inches")).toHaveCount(0);
  await expect(page.getByText("1/4 in top · 1/4 in bottom")).toBeVisible();
  await page.getByText("Post-top groove / rabbet", { exact: true }).click();
  await expect(grooveToggle).toBeChecked();
  await expect(page.getByLabel("Post groove height in inches")).toBeVisible();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Export two-color STLs" }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const woodDownload = downloads.find((download) =>
    download.suggestedFilename().endsWith("-support-free-wood-color-1.stl"),
  );
  const hardwareDownload = downloads.find((download) =>
    download.suggestedFilename().endsWith("-support-free-hardware-color-2.stl"),
  );
  expect(woodDownload?.suggestedFilename()).toBe(
    "dining-table-scale-1-10-length-1930.4-width-965.2-support-free-wood-color-1.stl",
  );
  expect(hardwareDownload?.suggestedFilename()).toBe(
    "dining-table-scale-1-10-length-1930.4-width-965.2-support-free-hardware-color-2.stl",
  );
  const woodPath = await woodDownload?.path();
  const hardwarePath = await hardwareDownload?.path();
  expect(woodPath).not.toBeNull();
  expect(hardwarePath).not.toBeNull();
  const fs = await import("node:fs");
  const woodStl = inspectStl(fs.readFileSync(woodPath!));
  const hardwareStl = inspectStl(fs.readFileSync(hardwarePath!));
  expect(woodStl.finite).toBe(true);
  expect(woodStl.degenerateTriangles).toBe(0);
  expect(woodStl.min.z).toBeCloseTo(0, 3);
  expect(woodStl.size.x).toBeCloseTo(193.04, 1);
  expect(woodStl.size.y).toBeCloseTo(96.52, 1);
  expect(woodStl.size.z).toBeCloseTo(76.2, 1);
  expect(woodStl.bedContactSize.x).toBeGreaterThan(185);
  expect(woodStl.bedContactSize.y).toBeGreaterThan(90);
  expect(hardwareStl.finite).toBe(true);
  expect(hardwareStl.degenerateTriangles).toBe(0);
  expect(hardwareStl.min.z).toBeCloseTo(2.54, 1);
  expect(hardwareStl.size.x).toBeCloseTo(190.5, 1);
  expect(hardwareStl.size.y).toBeCloseTo(93.98, 1);
  expect(hardwareStl.size.z).toBeCloseTo(1.27, 1);
  expect(pageErrors).toEqual([]);
});
