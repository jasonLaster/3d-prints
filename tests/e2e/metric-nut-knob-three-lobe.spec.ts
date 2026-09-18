import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { getDefaultParams, getParameterLimits, type ModelDefinition } from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const loadModel = (id: string) => JSON.parse(fs.readFileSync(path.join(root, `public/models/${id}/model.json`), "utf8")) as Extract<ModelDefinition, { viewer: "metric-nut-knob-v1" }>;
const previous = loadModel("metric-nut-knob-large-grip");
const model = loadModel("metric-nut-knob-three-lobe");
const stlPath = (definition: typeof model) => path.join(root, "public", definition.stl.url);

function measure(file: string) {
  const bytes = fs.readFileSync(file);
  const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const positions = geometry.getAttribute("position");
  const preserved: string[] = [];
  const pocket: number[][] = [];
  const ring = new Map<string, number[]>();
  for (let i = 0; i < positions.count; i += 3) {
    const points = [i, i + 1, i + 2].map((j) => [positions.getX(j), positions.getY(j), positions.getZ(j)]);
    if (points.every(([x, y]) => Math.abs(Math.hypot(x, y) - 4.051) < 0.0001) || points.every(([x, y, z]) => z >= 9.375 && Math.hypot(x, y) <= 7.5001)) {
      preserved.push(points.map((point) => point.map((value) => value.toFixed(4)).join(",")).sort().join("|"));
    }
    if (points.every(([x, y, z]) => Math.hypot(x, y) < 8 && (Math.abs(z) < 0.0001 || Math.abs(z - 5.705) < 0.0001)) && points.some(([, , z]) => z < 0.0001) && points.some(([, , z]) => z > 5)) pocket.push(...points);
    for (const [x, y, z] of points) {
      if (Math.abs(z - 2) < 0.0001) ring.set(`${x},${y}`, [Math.atan2(y, x), Math.hypot(x, y)]);
    }
  }
  const radii = [...ring.values()].sort((a, b) => a[0] - b[0]).map((point) => point[1]);
  const peaks = radii.filter((radius, i) => radius > radii[(i + radii.length - 1) % radii.length] + 0.0001 && radius > radii[(i + 1) % radii.length] + 0.0001).length;
  geometry.computeBoundingBox();
  const result = {
    preserved: preserved.sort(),
    pocketWidth: Math.max(...pocket.map((p) => p[0])) - Math.min(...pocket.map((p) => p[0])),
    pocketDepth: Math.max(...pocket.map((p) => p[2])),
    tipCircle: Math.max(...radii) * 2,
    scallopDepth: Math.max(...radii) - Math.min(...radii),
    peaks,
    minZ: geometry.boundingBox!.min.z,
    height: geometry.boundingBox!.max.z,
  };
  geometry.dispose();
  return result;
}

test("keeps the shaft unchanged, narrows only the hex fit, and produces three deep lobes", () => {
  const before = measure(stlPath(previous));
  const after = measure(stlPath(model));
  expect(after.preserved.length).toBeGreaterThan(100);
  expect(after.preserved).toEqual(before.preserved);
  expect(before.pocketWidth - after.pocketWidth).toBeCloseTo(0.2, 4);
  expect(after.pocketWidth).toBeCloseTo(12.906, 4);
  expect(after.pocketDepth).toBeCloseTo(5.705, 4);
  expect(after.peaks).toBe(3);
  expect(after.tipCircle).toBeCloseTo(40, 4);
  expect(after.scallopDepth).toBeCloseTo(7.5, 4);
  expect(after.scallopDepth).toBeGreaterThan(before.scallopDepth);
  expect(after.minZ).toBe(0);
  expect(after.height).toBe(17);
  const defaults = getDefaultParams(model);
  for (const parameter of model.parameters) {
    const limits = getParameterLimits(model, defaults, parameter.key);
    expect(defaults[parameter.key]).toBeGreaterThanOrEqual(limits.min);
    expect(defaults[parameter.key]).toBeLessThanOrEqual(limits.max);
  }
});

test("renders the separate three-lobe model and exports the tighter pocket", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?model=metric-nut-knob-three-lobe&unit=mm");
  await expect(page.getByRole("heading", { name: model.name, exact: true })).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Handle tip diameter in millimeters")).toHaveValue("40.0");
  await expect(page.getByRole("spinbutton", { name: "Grip lobe count" })).toHaveValue("3");
  await expect(page.getByLabel("Nut across flats in millimeters", { exact: true })).toHaveValue("12.8");
  await page.waitForLoadState("networkidle");
  await page.reload();
  await page.waitForLoadState("networkidle");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() => page.getByRole("button", { name: "Export", exact: true }).click()),
  ]);
  expect(download.suggestedFilename()).toContain("metric-nut-knob-three-lobe-");
  expect(measure((await download.path())!)).toEqual(measure(stlPath(model)));
  await page.setViewportSize({ width: 393, height: 852 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
