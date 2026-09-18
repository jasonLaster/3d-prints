import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { getDefaultParams, getMetricNutKnobSpec, type ModelDefinition } from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const loadModel = (id: string) => JSON.parse(fs.readFileSync(path.join(root, `public/models/${id}/model.json`), "utf8")) as Extract<ModelDefinition, { viewer: "metric-nut-knob-v1" }>;
const original = loadModel("metric-nut-knob");
const large = loadModel("metric-nut-knob-large-grip");
const readStl = (file: string) => {
  const bytes = fs.readFileSync(file);
  return new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

// Compare the actual exported bore, hex pocket and pocket roof triangles.
function matingSurfaces(file: string) {
  const geometry = readStl(file);
  const positions = geometry.getAttribute("position");
  const triangles: string[] = [];
  for (let i = 0; i < positions.count; i += 3) {
    const points = [i, i + 1, i + 2].map((j) => [positions.getX(j), positions.getY(j), positions.getZ(j)]);
    if (points.every(([x, y]) => Math.hypot(x, y) < 7.57)) {
      triangles.push(points.map((point) => point.map((value) => value.toFixed(4)).join(",")).sort().join("|"));
    }
  }
  geometry.dispose();
  return triangles.sort();
}
const originalStl = path.join(root, "public", original.stl.url);
const largeStl = path.join(root, "public", large.stl.url);

test("enlarges only the hand grip and preserves the original STL mating surfaces", () => {
  const defaults = getDefaultParams(large);
  const spec = getMetricNutKnobSpec(defaults);
  expect(spec.knobDiameter).toBe(40);
  expect(spec.overallHeight).toBe(17);
  for (const parameter of original.parameters.filter((entry) => entry.group !== "Handle" || ["handleHeight", "lobeCount"].includes(entry.key))) {
    expect(defaults[parameter.key], parameter.key).toBe(parameter.default);
  }
  const originalSurfaces = matingSurfaces(originalStl);
  expect(originalSurfaces.length).toBeGreaterThan(100);
  expect(matingSurfaces(largeStl)).toEqual(originalSurfaces);
  const geometry = readStl(largeStl);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(40, 4);
  expect(geometry.boundingBox!.min.z).toBe(0);
  geometry.dispose();
});

test("opens as a separate model, preserves fit while resizing, and exports the larger grip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?model=metric-nut-knob-large-grip&unit=mm");
  await expect(page.getByRole("heading", { name: large.name, exact: true })).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Handle tip diameter in millimeters")).toHaveValue("40.0");
  await page.getByLabel("Handle tip diameter in millimeters").fill("45");
  await expect.poll(() => new URL(page.url()).searchParams.get("knobDiameter")).toBe("45");
  await page.reload();
  await expect(page.getByLabel("Handle tip diameter in millimeters")).toHaveValue("45.0");
  await expect(page.getByLabel("Nut across flats in millimeters", { exact: true })).toHaveValue("13.0");
  await expect(page.getByLabel("Bolt nominal diameter in millimeters")).toHaveValue("8.0");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Workspace actions" }).click().then(() => page.getByRole("button", { name: "Export", exact: true }).click()),
  ]);
  expect(download.suggestedFilename()).toContain("metric-nut-knob-large-grip-bolt-8-nut-af-13-handle-45x9.38");
  expect(matingSurfaces((await download.path())!)).toEqual(matingSurfaces(originalStl));
  await page.goto("/?model=metric-nut-knob&unit=mm");
  await expect(page.getByRole("heading", { name: original.name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Handle tip diameter in millimeters")).toHaveValue("25.0");
  expect(errors).toEqual([]);
});
