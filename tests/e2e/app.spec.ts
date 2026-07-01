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

test.describe("3D print app", () => {
  test("loads the default paper towel holder with audited controls and a rendered canvas", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=paper-towel-holder&theme=light");

      await expect(page.getByRole("heading", { name: "Paper Towel Holder" })).toBeVisible();
      await expect(page.getByLabel("Paper Towel Holder model viewer")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
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

  test("switches catalog models through the shadcn select and exposes tray parameters", async ({
    page,
  }) => {
    await openReady(page, "/?model=paper-towel-holder&theme=light");

    await chooseSelectOption(page, "Model", "Japandi Tray");

    await expect(page).toHaveURL(/model=japandi-tray/);
    await expect(page.getByRole("heading", { name: "Japandi Tray" })).toBeVisible();
    await expect(page.getByLabel("Japandi Tray model viewer")).toBeVisible();
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

  test("camera orientation, pan, zoom, and frame controls keep the 3D canvas alive", async ({
    page,
  }) => {
    await expectNoPageErrors(page, async () => {
      await openReady(page, "/?model=japandi-tray&theme=light");

      for (const label of [
        "Zoom in",
        "Zoom out",
        "Pan up",
        "Pan left",
        "Pan right",
        "Pan down",
        "Frame model",
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

  test("saves, forks, and uploads through the Convex library", async ({ page }) => {
    test.skip(
      !process.env.VITE_CONVEX_URL,
      "Set VITE_CONVEX_URL to run live Convex persistence coverage.",
    );

    await openReady(page, "/?model=japandi-tray&theme=light");

    const title = `Playwright ${Date.now()}`;
    await page.getByLabel("Version name").fill(title);
    await page.getByRole("button", { name: "Save current version" }).click();
    await expect(page.getByRole("status")).toContainText("Version saved.");
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const forkTitle = `${title} fork`;
    await page.getByLabel("Version name").fill(forkTitle);
    await page.getByRole("button", { name: "Fork current version" }).click();
    await expect(page.getByRole("status")).toContainText("Fork saved.");
    await expect(page.getByText(forkTitle, { exact: true })).toBeVisible();

    await page.getByLabel("Upload STL").setInputFiles({
      name: `${title}.stl`,
      mimeType: "model/stl",
      buffer: Buffer.from("solid uploaded\nendsolid uploaded\n"),
    });
    await expect(page.getByRole("status")).toContainText("Uploaded STL saved to library.");
    await expect(page.getByText(`${title}.stl`, { exact: false })).toBeVisible();
  });
});
