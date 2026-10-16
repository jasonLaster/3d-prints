import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "public/models/keyhole-leveling-tabs/renders");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const ready = page.waitForResponse(response => response.url().endsWith("/models/keyhole-leveling-tabs/keyhole-leveling-tabs.stl") && response.ok());
  await page.goto(`${process.env.PRINTS_PREVIEW_URL ?? "http://127.0.0.1:5187"}/?model=keyhole-leveling-tabs&unit=mm`);
  await ready;
  await expect(page.getByTestId("keyhole-lift")).toHaveText("Frame lift: +4.76250 mm");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settle();
  await page.locator(".scene-panel canvas").screenshot({ path: path.join(out, "selected.png") });
  await page.getByRole("button", { name: "All eight", exact: true }).click(); await settle();
  await page.locator(".scene-panel canvas").screenshot({ path: path.join(out, "variants.png") });
  await page.getByRole("button", { name: "Installed section", exact: true }).click(); await settle();
  await page.locator(".scene-panel canvas").screenshot({ path: path.join(out, "installed.png") });
  await page.getByRole("img", { name: /Installed cross-section/ }).screenshot({ path: path.join(out, "cross_section.png") });
  console.log("Saved selected tab, eight variants, installed section and contact diagram from the actual app.");
} finally { await browser.close(); }
