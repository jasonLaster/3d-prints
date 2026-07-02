import { expect, type Page, test } from "@playwright/test";
import { PNG } from "pngjs";

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
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText(/Solid|X-Ray|Wire/);
  await expectCanvasHasRenderedModel(page);
}

async function chooseSelectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openDashboardModel(page: Page, modelName: string) {
  await page
    .locator(".dashboard-card")
    .filter({ hasText: modelName })
    .getByRole("button", { name: "Open" })
    .click();
}

test.describe("3D print app", () => {
  test("shows a dashboard of models and saved forks before opening a workspace", async ({
    page,
  }) => {
    await page.goto("/?theme=light");

    await expect(page.getByRole("heading", { name: "Model Library" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved Versions And Forks" })).toBeVisible();
    await expect(page.locator(".dashboard-card").filter({ hasText: "Paper Towel Holder" })).toBeVisible();
    await expect(page.locator(".dashboard-card").filter({ hasText: "Japandi Tray" })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);

    await openDashboardModel(page, "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expectCanvasHasRenderedModel(page);
  });

  test("dashboard model opening clears stale parameter query values", async ({ page }) => {
    await page.goto(
      "/?unit=mm&theme=dark&length=360&width=300&height=80&floorThickness=8&ribRelief=1.8",
    );

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Model Library" })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);

    await openDashboardModel(page, "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page).not.toHaveURL(/length=360/);
    await expect(page).not.toHaveURL(/floorThickness=8/);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("166.6");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("166.6");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
  });

  test("unknown model ids render a load error instead of a blank workspace", async ({
    page,
  }) => {
    await page.goto("/?model=missing-model&theme=light");

    await expect(page.getByText('Unknown model "missing-model"')).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("loads the default paper towel holder with audited controls and a rendered canvas", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=paper-towel-holder&theme=light");

      await expect(page.getByRole("heading", { name: "Paper Towel Holder" })).toBeVisible();
      await expect(page.getByLabel("Paper Towel Holder model viewer")).toBeVisible();
      await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
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
      await expect(page.getByText("Rounded top", { exact: true })).toBeVisible();
      await expect(page.getByText("Tube-to-holder clearance")).toBeVisible();
    });
  });

  test("edits center tube diameter independently and saves millimeter params in the URL", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm&theme=light");

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
    await openReady(page, "/?model=paper-towel-holder&unit=mm&theme=light");

    await chooseSelectOption(page, "Holder height units", "cm");

    await expect(page).toHaveURL(/unit=cm/);
    await expect(page.getByLabel("Holder height in centimeters")).toHaveValue("21.57");
    await expect(page.getByLabel("Holder diameter in centimeters")).toHaveValue("12.38");
    await expect(page.getByLabel("Center tube diameter in centimeters")).toHaveValue("3.60");

    const holderHeight = page.getByLabel("Holder height in centimeters");
    await holderHeight.fill("30");
    await holderHeight.blur();

    await expect(holderHeight).toHaveValue("30.00");
    await expect(page).toHaveURL(/height=300/);
    await expect(page.getByTestId("viewer-status")).toContainText("Holder height 30.00 cm");
  });

  test("clamps dependent holder diameter and tube diameter limits", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&unit=mm&theme=light");

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

  test("opens catalog models from the dashboard and exposes tray parameters", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&theme=light");

    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Model Library" })).toBeVisible();
    await openDashboardModel(page, "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveCount(0);
    await expect(page.getByLabel("Tray length in millimeters")).toHaveValue("166.6");
    await expect(page.getByLabel("Tray width in millimeters")).toHaveValue("166.6");
    await expect(page.getByLabel("Wall height in millimeters")).toHaveValue("20.0");
    await expect(page.getByLabel("Floor thickness in millimeters")).toHaveValue("2.6");
    await expect(page.getByLabel("Rib relief in millimeters")).toHaveValue("1.0");
    await expect(page.getByText("Weighted Center")).toHaveCount(0);
    await expectCanvasHasRenderedModel(page);
  });

  test("accepts contextual unit changes and fractional inch input", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray&theme=light");

    await chooseSelectOption(page, "Floor thickness units", "in");
    await expect(page).toHaveURL(/unit=in/);
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("1/8");

    const floorThickness = page.getByLabel("Floor thickness in inches");
    await floorThickness.fill("1/8th in");
    await floorThickness.blur();

    await expect(floorThickness).toHaveValue("1/8");
    await expect(page).toHaveURL(/floorThickness=3\.2/);
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");
  });

  test("clamps tray floor thickness below the selected wall height", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&unit=mm&theme=light");

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

  test("rehydrates model, unit, theme, and parameter values from the URL", async ({ page }) => {
    await openReady(
      page,
      "/?model=japandi-tray&unit=in&theme=dark&length=203.2&width=101.6&height=25.4&floorThickness=3.175&ribRelief=1.4",
    );

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toHaveValue("8");
    await expect(page.getByLabel("Tray width in inches")).toHaveValue("4");
    await expect(page.getByLabel("Wall height in inches")).toHaveValue("1");
    await expect(page.getByLabel("Floor thickness in inches")).toHaveValue("1/8");
    await expect(page.getByTestId("viewer-status")).toContainText("L 8 in");
    await expect(page.getByTestId("viewer-status")).toContainText("Floor 1/8 in");
    await expect(page).toHaveURL(/theme=dark/);
  });

  test("toggles dark theme and records the preference in the URL", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder&theme=light");

    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page).toHaveURL(/theme=dark/);

    await page.getByRole("button", { name: "Use light theme" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page).toHaveURL(/theme=light/);
  });

  test("supports rendering modes and original overlay toggles", async ({ page }) => {
    await openReady(page, "/?model=paper-towel-holder&theme=light");

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

  test("footer orientation, reset, frame, export, pan, and zoom keep the 3D canvas alive", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=japandi-tray&theme=light");

      const trayLength = page.getByLabel("Tray length in millimeters");
      await trayLength.fill("200");
      await trayLength.blur();
      await expect(trayLength).toHaveValue("200.0");
      await page.getByRole("button", { name: "Reset" }).click();
      await expect(trayLength).toHaveValue("166.6");
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible();

      for (const label of [
        "Zoom in",
        "Zoom out",
        "Pan up",
        "Pan left",
        "Pan right",
        "Pan down",
        "Frame",
        "Top view",
        "Align X edge to view",
        "Align Y edge to view",
        "Isometric view",
      ]) {
        await page.getByRole("button", { name: label }).first().click();
      }

      await expectCanvasHasRenderedModel(page);
    });
  });

  test("exports the active generated STL with a parameterized file name", async ({
    page,
  }) => {
    await openReady(page, "/?model=japandi-tray&theme=light&length=210&width=120&height=28");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^japandi-tray-length-210\.0-width-120\.0-height-28\.0-floorThickness-2\.6-ribRelief-1\.0\.stl$/,
    );
  });

  test("resizes the right sidebar by pointer and keyboard", async ({ page }) => {
    await openReady(page, "/?model=japandi-tray&theme=light");

    const inspector = page.getByRole("complementary", { name: "Parameters and audit" });
    const separator = page.getByRole("separator", { name: "Resize sidebar" });
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
  });

  test("renders the model viewer and inspector on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReady(page, "/?model=japandi-tray&unit=in&theme=dark");

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Tray length in inches")).toBeVisible();
    await expect(page.getByRole("separator", { name: "Resize sidebar" })).toBeHidden();
    await expectCanvasHasRenderedModel(page);
  });

  test("saves and forks through the Convex header, then lists them on the dashboard", async ({
    page,
  }) => {
    test.skip(
      !process.env.VITE_CONVEX_URL,
      "Set VITE_CONVEX_URL to run live Convex persistence coverage.",
    );

    await openReady(page, "/?model=japandi-tray&theme=light");

    const title = `Playwright ${Date.now()}`;
    await page.getByRole("button", { name: "Version actions" }).click();
    await page.getByLabel("Version name").fill(title);
    await page.getByRole("button", { name: "Save current version" }).click();
    await expect(page.getByRole("status")).toContainText("Version saved.");

    const forkTitle = `${title} fork`;
    await page.getByLabel("Version name").fill(forkTitle);
    await page.getByRole("button", { name: "Fork current version" }).click();
    await expect(page.getByRole("status")).toContainText("Fork saved.");

    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Saved Versions And Forks" })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByText(forkTitle, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Upload STL")).toHaveCount(0);

    await page
      .locator(".dashboard-row")
      .filter({ hasText: forkTitle })
      .getByRole("button", { name: "Open" })
      .click();
    await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();
    await expect(page.getByText("Japandi Tray", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/model=japandi-tray/);
    await page.getByRole("button", { name: "Version actions" }).click();
    await expect(page.getByLabel("Version name")).toBeVisible();
  });
});
