import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createKeyholeTabPrintGeometry,
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
      name: `${fraction}″ ${i + 1} ${i === 0 ? "bump" : "bumps"}`,
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
    page.getByRole("button", { name: "1/4″ 8 bumps", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Dimensions & fit assumptions", { exact: true }).click();
  await expect(page.getByLabel("Pad width in millimeters")).toHaveValue("17");
  await page.getByLabel("Frame to wall gap in millimeters").fill("2");
  await expect(
    page.getByText(
      /−?0\.12 mm beyond bumps and tape|-0\.12 mm beyond bumps and tape/,
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
    name: "1/32″ 1 bump",
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
    page.getByRole("button", { name: "1/16″ 2 bumps", exact: true }),
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


test("catalog navigation clears tab parameters from the next model", async ({ page }) => {
  await page.goto(open("&variant=8&previewMode=2&legDepth=1.3"));
  await expect(page.getByTestId("keyhole-lift")).toHaveText("Frame lift: +6.35000 mm");
  await page.getByRole("button", { name: "Open Simple Box", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Simple Box", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("variant")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("previewMode")).toBeNull();
  await expect.poll(() => new URL(page.url()).searchParams.get("legDepth")).toBeNull();
  await page.getByRole("button", { name: "Open Keyhole Leveling Tabs", exact: true }).click();
  await expect(page.getByTestId("keyhole-lift")).toHaveText("Frame lift: +4.76250 mm");
});
