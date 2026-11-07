import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { createCarbonFilterHolderGeometry } from "../../src/models/carbonFilterHolder";
import { getDefaultParams } from "../../src/models/shared";
import type { CarbonFilterHolderModelDefinition } from "../../src/models/types";

const model = JSON.parse(fs.readFileSync(
  path.resolve("public/models/carbon-filter-holder/model.json"), "utf8",
)) as CarbonFilterHolderModelDefinition;
const screenshots = path.resolve(".playwright/carbon-filter-holder");

test("opens from the catalog, previews sliding, restores dimensions and exports only the holder", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?model=paper-towel-holder&unit=mm");
  await page.getByRole("button", { name: "Open Carbon Filter Holder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Carbon Filter Holder", exact: true })).toBeVisible();
  const canvas = page.locator(".scene-panel canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("carbon-filter-exposure")).toContainText("83.0%");
  await expect(page.getByLabel("Filter thickness in millimeters")).toHaveValue("6.35");
  await expect(page.getByLabel("Retaining lip width in millimeters")).toHaveValue("5.00");
  await expect(page.getByLabel("Front detent overlap per side in millimeters")).toHaveValue("0.40");
  await expect(page.getByText("Front retention", { exact: true })).toBeVisible();
  await expect(page.getByText("Physical fit", { exact: true })).toBeVisible();
  await expect(page.getByText(/Test a flexible pad through the detents and check lid adhesion/)).toBeVisible();
  const image = PNG.sync.read(await canvas.screenshot());
  const colors = new Set<string>();
  for (let i = 0; i < image.data.length; i += 160) {
    colors.add(`${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`);
  }
  expect(colors.size).toBeGreaterThan(30);
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "desktop-empty.png") });

  const emptyView = await canvas.screenshot();
  await page.getByText("Show carbon filter", { exact: true }).click();
  await expect(page.getByLabel("Slide filter out in millimeters")).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(emptyView)).toBe(false);
  await page.getByLabel("Slide filter out in millimeters").fill("25");
  await expect.poll(() => new URL(page.url()).searchParams.get("filterWithdrawal")).toBe("25");
  await page.getByLabel("Filter width in millimeters").fill("80");
  await expect.poll(() => new URL(page.url()).searchParams.get("filterWidth")).toBe("80");
  await page.getByLabel("Front detent overlap per side in millimeters").fill("0.6");
  await page.getByLabel("Front detent length in millimeters").fill("4.4");
  await expect.poll(() => new URL(page.url()).searchParams.get("detentLength")).toBe("4.4");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Show carbon filter" })).toBeChecked();
  await expect(page.getByLabel("Slide filter out in millimeters")).toHaveValue(/^25(?:\.0+)?$/);
  await expect(page.getByLabel("Filter width in millimeters")).toHaveValue("80.00");
  await expect(page.getByLabel("Front detent overlap per side in millimeters")).toHaveValue("0.60");
  await expect(page.getByLabel("Front detent length in millimeters")).toHaveValue("4.40");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() =>
      page.getByRole("button", { name: "Export", exact: true }).click()),
  ]);
  expect(download.suggestedFilename()).toBe("carbon-filter-holder-80x76.2x6.35-clearance-0.5-lip-5-detent-0.6x4.4.stl");
  const bytes = fs.readFileSync((await download.path())!);
  const exported = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const expected = createCarbonFilterHolderGeometry({
    ...getDefaultParams(model), filterWidth: 80, showFilter: 1, filterWithdrawal: 25,
    detentOverlap: 0.6, detentLength: 4.4,
  }, model);
  expect(Array.from(exported.getAttribute("position").array)).toEqual(
    Array.from(expected.getAttribute("position").array),
  );
  exported.dispose();
  expected.dispose();
  await page.goto("/?model=carbon-filter-holder&unit=mm&showFilter=1&filterWithdrawal=25");
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, "desktop-filter.png") });
  expect(errors).toEqual([]);
});

test("couples retention limits and keeps a rectangular filter independently editable", async ({ page }) => {
  await page.goto("/?model=carbon-filter-holder&unit=mm&sideClearance=1.2&lipWidth=1.6&filterLength=50&showFilter=1&filterWithdrawal=100");
  await expect(page.getByLabel("Retaining lip width in millimeters")).toHaveValue("2.40");
  await expect(page.getByLabel("Slide filter out in millimeters")).toHaveValue("55.3");
  await page.getByLabel("Clearance per side in millimeters").fill("0.5");
  await page.getByLabel("Retaining lip width in millimeters").fill("1.7");
  await page.getByLabel("Clearance per side in millimeters").fill("1.2");
  await expect(page.getByLabel("Retaining lip width in millimeters")).toHaveValue("2.40");
  await page.getByLabel("Front detent length in millimeters").fill("3");
  await expect(page.getByLabel("Slide filter out in millimeters")).toHaveValue("54.3");
  await expect(page.getByLabel("Filter width in millimeters")).toHaveValue("76.20");
  await expect(page.getByLabel("Filter length in millimeters")).toHaveValue(/^50(?:\.0+)?$/);
});

test("keeps inch dimensions and controls contained at mobile and wide desktop widths", async ({ page }) => {
  for (const width of [393, 1920]) {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 1000 });
    await page.goto("/?model=carbon-filter-holder&unit=in");
    await expect(page.getByRole("heading", { name: "Carbon Filter Holder", exact: true })).toBeVisible();
    await expect(page.locator(".scene-panel canvas")).toBeVisible();
    await expect(page.getByLabel("Filter width in inches")).toHaveValue("3");
    await expect(page.getByLabel("Filter thickness in inches")).toHaveValue("1/4");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const groups = page.locator(".carbon-filter-parameter-groups");
    const boxes = await groups.locator("section").evaluateAll((sections) => sections.map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }));
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom + 1);
      expect(Math.abs(boxes[i].left - boxes[0].left)).toBeLessThan(2);
    }
    const scene = await page.getByLabel("Carbon Filter Holder model viewer").boundingBox();
    if (width === 393) {
      const inspector = await page.getByRole("heading", { name: "Inspector" }).boundingBox();
      expect(inspector!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
    }
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, `${width === 393 ? "mobile" : "wide"}.png`) });
    if (width === 393) {
      await groups.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshots, "mobile-controls.png") });
    }
  }
});
