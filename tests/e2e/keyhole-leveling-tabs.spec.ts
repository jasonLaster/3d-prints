import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createKeyholeTabPrintGeometry,
  getKeyholeLegProfile,
  getKeyholeTabsSpec,
  getKeyholeTabsParameterLimits,
  KEYHOLE_FRACTIONS,
} from "../../src/models/keyholeLevelingTabs";
import { getDefaultParams } from "../../src/models/shared";
import type { KeyholeTabsModelDefinition } from "../../src/models/types";

const model = JSON.parse(
  fs.readFileSync(
    path.resolve("public/models/keyhole-leveling-tabs/model.json"),
    "utf8",
  ),
) as KeyholeTabsModelDefinition;
const url = process.env.KEYHOLE_BASE_URL ?? "";
const open = (query = "") =>
  `${url}/?model=keyhole-leveling-tabs&unit=mm${query}`;

test("all fixed variants, previews, URL state, assumptions and selected export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(open());
  await expect(
    page.getByRole("heading", { name: "Keyhole Leveling Tabs", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByTestId("keyhole-lift")).toHaveText(
    "Frame lift: +4.76250 mm",
  );
  await expect(
    page.getByText("PLA Tough or PETG · 0.4 mm nozzle"),
  ).toBeVisible();
  await expect(
    page.getByText("Physical validation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Keyhole measurements, frame weight, tape retention and loaded fit test pending",
    ),
  ).toBeVisible();
  for (const [i, fraction] of KEYHOLE_FRACTIONS.entries()) {
    const button = page.getByRole("button", {
      name: `${fraction}″ ${(((i + 1) * 25.4) / 32).toFixed(3)} mm`,
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("keyhole-lift")).toHaveText(
      `Frame lift: +${(((i + 1) * 25.4) / 32).toFixed(5)} mm`,
    );
  }
  await page.getByRole("button", { name: "All eight", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("previewMode"))
    .toBe("1");
  await page
    .getByRole("button", { name: "Installed section", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Installed cross-section: 6.35000/ }),
  ).toBeVisible();
  await page.getByText("Dimensions & fit assumptions", { exact: true }).click();
  await page.getByLabel("Pad width in millimeters").fill("17");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("padWidth"))
    .toBe("17");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Installed section", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "1/4″ 6.350 mm", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Dimensions & fit assumptions", { exact: true }).click();
  await expect(page.getByLabel("Pad width in millimeters")).toHaveValue("17");
  await page.getByLabel("Pad thickness in millimeters").fill("2.4");
  await page.getByLabel("Frame to wall gap in millimeters").fill("2");
  await expect(
    page.getByText(
      /−?0\.60 mm beyond pad and tape|-0\.60 mm beyond pad and tape/,
    ),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Workspace actions" })
      .click()
      .then(() =>
        page.getByRole("button", { name: "Export", exact: true }).click(),
      ),
  ]);
  expect(download.suggestedFilename()).toBe("tab_08_1-4.stl");
  const file = await download.path();
  expect(file).toBeTruthy();
  const data = fs.readFileSync(file!);
  const exported = new STLLoader().parse(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  const expected = createKeyholeTabPrintGeometry(
    {
      ...getDefaultParams(model),
      variant: 8,
      previewMode: 2,
      padWidth: 17,
      wallGap: 2,
      padThickness: 2.4,
    },
    model,
  );
  expect(Array.from(exported.getAttribute("position").array)).toEqual(
    Array.from(expected.getAttribute("position").array),
  );
  exported.dispose();
  expected.dispose();
  expect(errors).toEqual([]);
});

test("scalar variants survive inch URLs and keyboard selection", async ({
  page,
}) => {
  await page.goto(
    `${url}/?model=keyhole-leveling-tabs&unit=in&variant=1&previewMode=1`,
  );
  const smallest = page.getByRole("button", {
    name: "1/32″ 0.794 mm",
    exact: true,
  });
  await expect(smallest).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "All eight", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await smallest.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "1/16″ 1.587 mm", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("keyhole-lift")).toHaveText(
    "Frame lift: +1.58750 mm",
  );
});

for (const width of [393, 1440, 1920])
  test(`usable geometry workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 1000 });
    await page.goto(open());
    await expect(page.getByTestId("keyhole-lift")).toHaveText(
      "Frame lift: +4.76250 mm",
    );
    await expect(page.locator(".scene-panel canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const group = page.getByRole("group", { name: "Fixed offset variants" });
    const boxes = await group.getByRole("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(boxes).toHaveLength(8);
    for (const b of boxes) {
      expect(b.w).toBeGreaterThanOrEqual(44);
      expect(b.h).toBeGreaterThanOrEqual(44);
    }
    expect(boxes[4].y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].h + 5);
    const offset = await group.boundingBox();
    const views = await page
      .getByRole("group", { name: "Tab preview" })
      .boundingBox();
    expect(views!.y).toBeGreaterThan(offset!.y + offset!.height);
    if (width === 393) {
      const scene = await page
        .getByLabel("Keyhole Leveling Tabs model viewer")
        .boundingBox();
      const inspector = await page
        .getByRole("heading", { name: "Inspector" })
        .boundingBox();
      expect(inspector!.y).toBeGreaterThanOrEqual(scene!.y + scene!.height);
    }
    await page
      .locator(".scene-panel canvas")
      .screenshot({ path: `.playwright/keyhole-tab-${width}.png` });
    await page.screenshot({
      path: `.playwright/keyhole-workspace-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "All eight", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "All eight", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: `.playwright/keyhole-plate-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Installed section", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Installed cross-section/ }),
    ).toBeVisible();
    await page.screenshot({
      path: `.playwright/keyhole-installed-${width}.png`,
      fullPage: true,
    });
  });

test("catalog navigation clears tab parameters from the next model", async ({
  page,
}) => {
  await page.goto(open("&variant=8&previewMode=2&legDepth=1.3"));
  await expect(page.getByTestId("keyhole-lift")).toHaveText(
    "Frame lift: +6.35000 mm",
  );
  await page
    .getByRole("button", { name: "Open Simple Box", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Simple Box", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("variant"))
    .toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("previewMode"))
    .toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("legDepth"))
    .toBeNull();
  await page
    .getByRole("button", { name: "Open Keyhole Leveling Tabs", exact: true })
    .click();
  await expect(page.getByTestId("keyhole-lift")).toHaveText(
    "Frame lift: +4.76250 mm",
  );
});

test("circular crown follows the roof without changing the eight offsets", () => {
  const defaults = getDefaultParams(model);
  expect(defaults.legWidth).toBe(3);
  for (let variant = 1; variant <= 8; variant++) {
    const p = { ...defaults, variant };
    const spec = getKeyholeTabsSpec(p, model);
    expect(spec.crownRadius).toBeCloseTo(p.keyholeSlotWidth / 2, 8);
    expect(spec.lift).toBeCloseTo((variant * 25.4) / 32, 8);
    const profile = getKeyholeLegProfile(
      spec.tipWidth,
      spec.offset,
      spec.crownRadius,
    );
    for (const point of profile.slice(7, 40))
      expect(point.x ** 2 + (point.y + spec.crownRadius) ** 2).toBeCloseTo(
        spec.crownRadius ** 2,
        8,
      );
    expect(Math.max(...profile.map((point) => point.y))).toBeCloseTo(0, 8);
    expect(Math.min(...profile.map((point) => point.y))).toBeCloseTo(
      -spec.offset,
      8,
    );
    expect(spec.edgeHeight).toBeGreaterThanOrEqual(
      model.geometry.minimumLegEdgeHeight,
    );
  }
});

test("circular crown width limits prevent a shallow tab from flattening the roof", () => {
  const p = { ...getDefaultParams(model), variant: 1, legWidth: 4.1 };
  const limits = getKeyholeTabsParameterLimits(model, p, "legWidth");
  expect(limits.max).toBeLessThan(4.1);
  expect(limits.max).toBeGreaterThan(3);
  const spec = getKeyholeTabsSpec({ ...p, legWidth: limits.max }, model);
  expect(spec.crownRadius).toBeCloseTo(p.keyholeSlotWidth / 2, 8);
});

test("flat pad rests on bed with the inward leg up for all eight variants", () => {
  const defaults = getDefaultParams(model);
  expect(model.parameters.some((p) => p.key.startsWith("bump"))).toBe(false);
  for (let variant = 1; variant <= 8; variant++) {
    const p = { ...defaults, variant };
    const geometry = createKeyholeTabPrintGeometry(p, model);
    const position = geometry.getAttribute("position");
    let padArea = 0;
    for (let i = 0; i < position.count; i += 3) {
      if ([0, 1, 2].some((j) => Math.abs(position.getZ(i + j)) > 1e-7))
        continue;
      const [ax, ay, bx, by, cx, cy] = [
        position.getX(i),
        position.getY(i),
        position.getX(i + 1),
        position.getY(i + 1),
        position.getX(i + 2),
        position.getY(i + 2),
      ];
      padArea += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    }
    const expected =
      p.padWidth * p.padHeight -
      (4 - Math.PI) * model.geometry.padCornerRadius ** 2;
    expect(Math.abs(padArea - expected)).toBeLessThan(0.05);
    const bounds = geometry.boundingBox!;
    expect(bounds.min.z).toBe(0);
    expect(bounds.max.z).toBeCloseTo(
      p.padThickness + p.tapeThickness + p.legDepth,
      5,
    );
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(p.padHeight, 5);
    const legacy = createKeyholeTabPrintGeometry(
      { ...p, bumpHeight: 0.4, bumpDiameter: 0.9 },
      model,
    );
    expect(Array.from(legacy.getAttribute("position").array)).toEqual(
      Array.from(position.array),
    );
    legacy.dispose();
    geometry.dispose();
  }
});
