import { expect, type Page, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { PNG } from "pngjs";
import { api } from "../../convex/_generated/api";

const THEME_STORAGE_KEY = "3d-prints:theme";
const PLAYWRIGHT_TEST_VERSION_PREFIX = "Playwright ";

async function expectCanvasHasRenderedModel(page: Page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(350);

  const image = PNG.sync.read(await canvas.screenshot());
  const sampleStep = Math.max(1, Math.floor(Math.min(image.width, image.height) / 80));
  const colors = new Set<string>();
  let variedSamples = 0;

  for (let y = 0; y < image.height; y += sampleStep) {
    for (let x = 0; x < image.width; x += sampleStep) {
      const offset = (image.width * y + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const a = image.data[offset + 3];
      colors.add(`${r >> 4}:${g >> 4}:${b >> 4}:${a >> 4}`);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 8) {
        variedSamples += 1;
      }
    }
  }

  expect(colors.size).toBeGreaterThan(18);
  expect(variedSamples).toBeGreaterThan(120);
}

async function expectNoPageErrors(page: Page, run: () => Promise<void>) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await run();
  expect(errors).toEqual([]);
}

async function openReady(page: Page, path = "/") {
  await setStoredTheme(page, "light");
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
  await expectCanvasHasRenderedModel(page);
}

async function setStoredTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    ({ key, themeMode }) => {
      window.localStorage.setItem(key, themeMode);
    },
    { key: THEME_STORAGE_KEY, themeMode: theme },
  );
}

async function chooseSelectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openSidebarModel(page: Page, modelName: string) {
  await page.getByRole("button", { name: `Open ${modelName}` }).click();
}

async function openActions(page: Page) {
  await page.getByRole("button", { name: "Workspace actions" }).click();
}

async function cleanupPlaywrightVersions(titles: string[]) {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl || titles.length === 0) {
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  await client.mutation(api.library.deletePlaywrightTestVersions, { titles });
}

test.describe("3D print app", () => {
  test("opens the default workspace with model navigation in the sidebar", async ({
    page,
  }) => {
    await setStoredTheme(page, "light");
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Paper Towel Holder" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expectCanvasHasRenderedModel(page);
  });

  test("root model opening clears stale parameter query values", async ({ page }) => {
    await setStoredTheme(page, "dark");
    await page.goto(
      "/?unit=mm&length=360&width=300&height=80&floorThickness=8&ribRelief=1.8",
    );

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page).not.toHaveURL(/length=360/);
    await expect(page).not.toHaveURL(/floorThickness=8/);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("190.1");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("110.1");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
  });

  test("unknown model ids render a load error instead of a blank workspace", async ({
    page,
  }) => {
    await setStoredTheme(page, "light");
    await page.goto("/?model=missing-model");

    await expect(page.getByText('Unknown model "missing-model"')).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("loads the default paper towel holder with audited controls and a rendered canvas", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=paper-towel-holder");

      await expect(page.getByRole("heading", { name: "Paper Towel Holder" })).toBeVisible();
      await expect(page.getByLabel("Paper Towel Holder model viewer")).toBeVisible();
      await expect(page.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Workspace actions" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Library" })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(0);
      await expect(page.locator("select")).toHaveCount(0);

      await expect(page.locator("#holder-height")).toHaveAttribute("max", "450");
      await expect(page.locator("#holder-diameter")).toHaveAttribute("max", "260");
      await expect(page.getByLabel("Holder height in millimeters")).toHaveValue("215.7");
      await expect(page.getByLabel("Holder diameter in millimeters")).toHaveValue("123.8");
      await expect(page.getByLabel("Center tube diameter in millimeters")).toHaveValue("36.0");

      await expect(page.getByText("Sand chamber")).toBeVisible();
      await expect(page.getByText("Estimated sand mass")).toBeVisible();
      await expect(page.getByText("Flush sand floor")).toBeVisible();
      await expect(page.getByText("Rounded top", { exact: true })).toBeVisible();
      await expect(page.getByText("Tube-to-holder clearance")).toBeVisible();
    });
  });

  test("edits center tube diameter independently and saves millimeter params in the URL", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    const holderDiameter = page.getByLabel("Holder diameter in millimeters");
    const tubeDiameter = page.getByLabel("Center tube diameter in millimeters");
    await expect(holderDiameter).toHaveValue("123.8");

    await tubeDiameter.fill("50");
    await tubeDiameter.blur();

    await expect(tubeDiameter).toHaveValue("50.0");
    await expect(holderDiameter).toHaveValue("123.8");
    await expect(page).toHaveURL(/tubeDiameter=50/);
    await expect(page.getByTestId("viewer-status")).toContainText("Center tube diameter 50.0 mm");
    await expect(page.getByText("Center tube outer diameter")).toBeVisible();
    await expect(page.getByText("50.0 mm").first()).toBeVisible();
  });

  test("uses one contextual unit dropdown to switch all parameter rows", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    await chooseSelectOption(page, "Holder height units", "cm");

    await expect(page).toHaveURL(/unit=cm/);
    await expect(page.getByLabel("Holder height in centimeters")).toHaveValue("21.57");
    await expect(page.getByLabel("Holder diameter in centimeters")).toHaveValue("12.38");
    await expect(page.getByLabel("Center tube diameter in centimeters")).toHaveValue("3.60");

    const holderHeight = page.getByLabel("Holder height in centimeters");
    await holderHeight.fill("30");
    await holderHeight.blur();

    await expect(holderHeight).toHaveValue("30.00");
    await expect(page).toHaveURL(/height=30/);
    await expect(page.getByTestId("viewer-status")).toContainText("Holder height 30.00 cm");
  });

  test("clamps dependent holder diameter and tube diameter limits", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm");

    const holderDiameter = page.getByLabel("Holder diameter in millimeters");
    const tubeDiameter = page.getByLabel("Center tube diameter in millimeters");

    await tubeDiameter.fill("120");
    await tubeDiameter.blur();
    await expect(tubeDiameter).toHaveValue("95.8");

    await holderDiameter.fill("100");
    await holderDiameter.blur();
    await expect(holderDiameter).toHaveValue("123.8");
    await expect(page.getByText("Tube-to-holder clearance")).toBeVisible();
  });

  test("opens catalog models from the sidebar and exposes tray parameters", async ({
    page,
  }) => {
    await setStoredTheme(page, "dark");
    await page.goto("/?model=paper-towel-holder");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);
    await expect(page.locator("html")).toHaveClass(/dark/);

    await openSidebarModel(page, "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(0);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("190.1");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("110.1");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
    await expect(page.getByLabel("Rib relief in millimeters")).toHaveValue("1.0");
    await expect(page.getByRole("heading", { name: "Orientation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Align tray to X axis" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use tray source angle" })).toHaveCount(0);
    await expect(page).toHaveURL(/rotation=0/);
    await expect(page.getByText("Weighted Center")).toHaveCount(0);
    await expectCanvasHasRenderedModel(page);
  });

  test("keeps tray orientation controls flagged off by default", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=in&rotation=30");

    await expect(page).toHaveURL(/rotation=30/);
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expect(page.getByRole("button", { name: "Align tray to X axis" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use tray source angle" })).toHaveCount(0);
    await chooseSelectOption(page, "Tray length units", "cm");
    await expect(page).toHaveURL(/unit=cm/);
    await expect(page).toHaveURL(/rotation=30/);
  });

  test("accepts contextual unit changes and fractional inch input", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray");

    await chooseSelectOption(page, "Floor thickness units", "in");
    await expect(page).toHaveURL(/unit=in/);
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("1/8");

    const floorThickness = page.getByLabel("Floor thickness in inches");
    await floorThickness.fill("1/8th in");
    await floorThickness.blur();

    await expect(floorThickness).toHaveValue("1/8");
    await expect(page).toHaveURL(/floorThickness=0\.126/);
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");
  });

  test("clamps tray floor thickness below the selected wall height", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=mm");

    const wallHeight = page.getByLabel("Wall height in millimeters");
    const floorThickness = page.getByLabel("Floor thickness in millimeters");

    await wallHeight.fill("10");
    await wallHeight.blur();
    await expect(wallHeight).toHaveValue("10.0");

    await floorThickness.fill("20");
    await floorThickness.blur();
    await expect(floorThickness).toHaveValue("8.0");
    await expect(page).toHaveURL(/height=10/);
    await expect(page).toHaveURL(/floorThickness=8/);
  });

  test("rehydrates model, unit, parameters, and stored theme separately", async ({ page }) => {
    await setStoredTheme(page, "dark");
    await page.goto(
      "/?model=japandi-tray&unit=in&length=203.2&width=101.6&height=25.4&floorThickness=3.175&ribRelief=1.4",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toHaveValue("8");
    await expect(page.getByLabel("Tray width in inches")).toHaveValue("4");
    await expect(page.getByLabel("Wall height in inches")).toHaveValue("1");
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("1/8");
    await expect(page.getByTestId("viewer-status")).toContainText("L 8 in");
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page).toHaveURL(/length=8/);
    await expect(page).toHaveURL(/width=4/);
    await expect(page).toHaveURL(/floorThickness=0\.125/);
  });

  test("normalizes legacy millimeter tray links when centimeters are selected", async ({
    page,
  }) => {
    await openReady(
      page,
      "/?model=japandi-tray&unit=cm&length=141&width=300&height=44&floorThickness=4.9&ribRelief=1",
    );

    await expect(page.getByLabel("Tray length in centimeters")).toHaveValue("14.10");
    await expect(page.getByLabel("Tray width in centimeters")).toHaveValue("30.00");
    await expect(page.getByLabel("Wall height in centimeters")).toHaveValue("4.40");
    await expect(page.getByLabel("Floor thickness in centimeters")).toHaveValue("0.49");
    await expect(page.getByLabel("Rib relief in centimeters")).toHaveValue("0.10");
    await expect(page.getByTestId("viewer-status")).toContainText("L 14.10 cm");
    await expect(page.getByTestId("viewer-status")).toContainText("W 30.00 cm");
    await expect(page).toHaveURL(/length=14\.1/);
    await expect(page).toHaveURL(/width=30/);
    await expect(page).toHaveURL(/height=4\.4/);
    await expect(page).toHaveURL(/floorThickness=0\.49/);
    await expect(page).toHaveURL(/ribRelief=0\.1/);
  });

  test("toggles dark theme and records the preference in localStorage", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder");

    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await openActions(page);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe("dark");

    await page.getByRole("button", { name: "Use light theme" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), THEME_STORAGE_KEY))
      .toBe("light");
  });

  test("supports rendering modes and original overlay toggles", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder");

    await page.getByRole("button", { name: "Fill" }).click();
    await expect(page.getByRole("button", { name: "Fill" })).toHaveClass(/active/);
    await page.getByRole("button", { name: "Section" }).click();
    await expect(page.getByRole("button", { name: "Section" })).toHaveClass(/active/);

    await page.getByRole("button", { name: "X-Ray" }).click();
    await expect(page.getByRole("button", { name: "X-Ray" })).toHaveClass(/active/);
    await expect(page.getByTestId("viewer-status")).toContainText("X-Ray");
    await page.getByRole("button", { name: "Wire" }).click();
    await expect(page.getByRole("button", { name: "Wire" })).toHaveClass(/active/);
    await expect(page.getByTestId("viewer-status")).toContainText("Wire");

    const overlay = page.getByLabel("Original inlay");
    await page.getByText("Original inlay", { exact: true }).click();
    await expect(overlay).toBeChecked();
    await expectCanvasHasRenderedModel(page);
  });

  test("cube orientation, workspace actions, and zoom keep the 3D canvas alive", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=japandi-tray");

      const trayLength = page.getByLabel("Tray length in millimeters");
      await trayLength.fill("200");
      await trayLength.blur();
      await expect(trayLength).toHaveValue("200.0");
      await page.getByRole("button", { name: "Reset parameters" }).click();
      await expect(trayLength).toHaveValue("190.1");

      await openActions(page);
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Workspace actions" })).toBeVisible();
      await page.mouse.click(24, 24);
      await expect(page.getByRole("dialog", { name: "Workspace actions" })).toBeHidden();

      for (const label of [
        "Zoom in",
        "Zoom out",
        "Center view",
        "Top view",
        "Align X edge to view",
        "Align Y edge to view",
        "Isometric view",
      ]) {
        await page.getByRole("button", { name: label }).first().click();
      }

      await expect(page.locator(".orientation-cube-face")).toHaveText([
        "Top",
        "Front",
        "Right",
        "Bottom",
        "Back",
        "Left",
      ]);

      const topView = page.getByRole("button", { name: "Top view" });
      await topView.click();
      await expect(topView).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".orientation-cube")).toHaveAttribute(
        "style",
        /rotateX\(-82(?:\.0)?deg\) rotateY\(0(?:\.0)?deg\)/,
      );

      const canvasBox = await page.locator("canvas").first().boundingBox();
      expect(canvasBox).not.toBeNull();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2,
        canvasBox!.y + canvasBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox!.x + canvasBox!.width / 2 + 90,
        canvasBox!.y + canvasBox!.height / 2 + 35,
        { steps: 6 },
      );
      await page.mouse.up();
      await expect(topView).toHaveAttribute("aria-pressed", "false");

      await expectCanvasHasRenderedModel(page);
    });
  });

  test("exports the active generated STL with a parameterized file name", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&length=210&width=120&height=28");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      openActions(page).then(() =>
        page.getByRole("button", { name: "Export" }).click(),
      ),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^japandi-tray-length-210\.0-width-120\.0-height-28\.0-floorThickness-2\.6-ribRelief-1\.0-rotation-0\.0\.stl$/,
    );
  });

  test("resizes and collapses the model library and inspector sidebars", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray");

    const library = page.getByRole("complementary", { name: "Workspace model library" });
    const scene = page.getByLabel("Japandi Tray model viewer");
    const librarySeparator = page.getByRole("separator", { name: "Resize model library" });
    const libraryBefore = (await library.boundingBox())?.width ?? 0;
    const sceneBeforeLibraryCollapse = (await scene.boundingBox())?.width ?? 0;
    const librarySeparatorBox = await librarySeparator.boundingBox();
    expect(librarySeparatorBox).not.toBeNull();

    await page.mouse.move(librarySeparatorBox!.x + 2, librarySeparatorBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(librarySeparatorBox!.x + 80, librarySeparatorBox!.y + 80, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await library.boundingBox())?.width ?? 0)
      .toBeGreaterThan(libraryBefore + 40);
    await expect
      .poll(async () =>
        Number(await page.evaluate(() => window.localStorage.getItem("3d-prints:library-sidebar-width"))),
      )
      .toBeGreaterThan(libraryBefore + 40);

    await librarySeparator.focus();
    await page.keyboard.press("Home");
    await expect(librarySeparator).toHaveAttribute("aria-valuenow", "240");
    await page.keyboard.press("End");
    await expect(librarySeparator).toHaveAttribute("aria-valuenow", "460");

    await page.getByRole("button", { name: "Collapse model library" }).click();
    await expect(page.getByRole("button", { name: "Expand model library" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize model library" })).toBeHidden();
    await expect
      .poll(async () => (await scene.boundingBox())?.width ?? 0)
      .toBeGreaterThan(sceneBeforeLibraryCollapse);
    await expectCanvasHasRenderedModel(page);
    await page.getByRole("button", { name: "Expand model library" }).click();
    await expect(page.getByRole("button", { name: "Collapse model library" })).toBeVisible();

    const inspector = page.getByRole("complementary", { name: "Parameters and audit" });
    const separator = page.getByRole("separator", { name: "Resize inspector" });
    const before = (await inspector.boundingBox())?.width ?? 0;
    const separatorBox = await separator.boundingBox();
    expect(separatorBox).not.toBeNull();

    await page.mouse.move(separatorBox!.x + 4, separatorBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(separatorBox!.x - 120, separatorBox!.y + 80, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await inspector.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before + 70);
    await expect
      .poll(async () =>
        Number(await page.evaluate(() => window.localStorage.getItem("3d-prints:sidebar-width"))),
      )
      .toBeGreaterThan(before + 70);

    await separator.focus();
    await page.keyboard.press("End");
    await expect(separator).toHaveAttribute("aria-valuenow", "320");
    await page.keyboard.press("Home");
    await expect(separator).toHaveAttribute("aria-valuenow", "620");

    const sceneBeforeInspectorCollapse = (await scene.boundingBox())?.width ?? 0;
    await page.getByRole("button", { name: "Collapse inspector" }).click();
    await expect(page.getByRole("button", { name: "Expand inspector" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize inspector" })).toBeHidden();
    await expect
      .poll(async () => (await scene.boundingBox())?.width ?? 0)
      .toBeGreaterThan(sceneBeforeInspectorCollapse);
    await expectCanvasHasRenderedModel(page);
    await page.getByRole("button", { name: "Expand inspector" }).click();
    await expect(page.getByRole("button", { name: "Collapse inspector" })).toBeVisible();
  });

  test("renders the model viewer and inspector on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setStoredTheme(page, "dark");
    await page.goto("/?model=japandi-tray&unit=in");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
    await expectCanvasHasRenderedModel(page);

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page).not.toHaveURL(/theme=/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize model library" })).toBeHidden();
    await expect(page.getByRole("separator", { name: "Resize inspector" })).toBeHidden();
    await expectCanvasHasRenderedModel(page);
  });

  test("saves and forks through the actions menu, then lists selected-model versions", async ({
    page,
  }) => {
    test.skip(
      !process.env.VITE_CONVEX_URL,
      "Set VITE_CONVEX_URL to run live Convex persistence coverage.",
    );

    await openReady(page, "/?model=japandi-tray");

    const title = `${PLAYWRIGHT_TEST_VERSION_PREFIX}${Date.now()}`;
    const forkTitle = `${title} fork`;
    try {
      await openActions(page);
      await expect(
        page.getByRole("button", { name: "Save current version" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Fork current version" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Fork current version" }).click();
      await page.getByLabel("Version name").fill(forkTitle);
      await page.getByRole("button", { name: "Fork version" }).click();
      await expect(page.getByRole("status")).toContainText("Fork saved.");
      await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();

      await expect(
        page.getByRole("button", { name: "Save current version" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Fork current version" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Save current version" }).click();
      await page.getByLabel("Version name").fill(title);
      await page.getByRole("button", { name: "Save version" }).click();
      await expect(page.getByRole("status")).toContainText("Version saved.");

      await page.getByRole("button", { name: "Saved Versions" }).click();
      await expect(page.getByRole("button", { name: `Open ${title}` })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Open ${forkTitle}` })).toHaveCount(0);
      await expect(page.getByLabel("Upload STL")).toHaveCount(0);

      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.locator(".workspace-title-context")).toHaveCount(0);
      await expect(page).toHaveURL(/model=japandi-tray/);
      if (
        !(await page
          .getByRole("button", { name: "Save current version" })
          .isVisible())
      ) {
        await openActions(page);
      }
      await expect(page.getByRole("button", { name: "Save current version" })).toBeVisible();
    } finally {
      await cleanupPlaywrightVersions([title, forkTitle]);
    }
  });
});
