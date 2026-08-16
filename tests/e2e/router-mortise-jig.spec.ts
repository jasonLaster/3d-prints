import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { createRouterMortiseJigPartGeometries, createRouterMortiseJigPreviewParts, getDefaultParams, getParameterLimits, getRouterMortiseJigSpec, type ModelDefinition } from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(fs.readFileSync(path.join(root, "public/models/router-mortise-jig/photo-model.json"), "utf8")) as Extract<ModelDefinition, { viewer: "router-mortise-jig-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position"); const edges = new Map<string, number>(); let degenerateTriangles = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const key = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map((value) => value.toFixed(4)).join(",");
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i); b.fromBufferAttribute(position, i + 1); c.fromBufferAttribute(position, i + 2);
    if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() <= 1e-10) degenerateTriangles += 1;
    for (const [start, end] of [[key(i), key(i + 1)], [key(i + 1), key(i + 2)], [key(i + 2), key(i)]]) { const edge = start < end ? `${start}|${end}` : `${end}|${start}`; edges.set(edge, (edges.get(edge) ?? 0) + 1); }
  }
  source.computeBoundingBox();
  const result = { bounds: source.boundingBox!.clone(), degenerateTriangles, finite: Array.from(position.array).every(Number.isFinite), nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length };
  source.dispose(); return result;
}
function inspectStl(input: Buffer) {
  const geometry = new STLLoader().parse(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  const result = analyzeGeometry(geometry); geometry.dispose(); return result;
}

test("builds the photo-matched ten-part system as printable manifold geometry", () => {
  const params = getDefaultParams(model); const spec = getRouterMortiseJigSpec(params, model);
  expect(spec.openingWidth).toBeCloseTo(18.25, 5); expect(spec.openingLength).toBeCloseTo(40.25, 5);
  expect(spec.railGap).toBeCloseTo(spec.openingWidth, 5); expect(spec.jawInnerGap).toBeCloseTo(30.5, 5);
  expect(spec.jawSlotMargin).toBeGreaterThan(0); expect(spec.insertSideWall).toBeCloseTo(16.4, 5);
  expect(spec.presetMarkerY).toHaveLength(6); expect(spec.presetMarkerY).toEqual([31.25, 34.25, 37.25, 41.25, 44.75, 47.25]);
  expect(spec.insertFloor).toBe(4); expect(spec.insertEngagement).toBe(8); expect(spec.routerSupportOverlap).toBe(60);
  expect(spec.screenDeflection).toBeLessThan(0.5); expect(spec.screenSafetyFactor).toBeGreaterThan(3);
  const parts = createRouterMortiseJigPartGeometries(params, model);
  expect(parts.map((part) => part.key)).toEqual(["left-deck-rail", "right-deck-rail", "front-stop", "rear-stop", "left-thickness-jaw", "right-thickness-jaw", "positioning-bridge", "centering-base", "centering-left-fence", "centering-right-fence"]);
  parts.forEach((part) => { const topology = analyzeGeometry(part.geometry); expect(topology.finite).toBe(true); expect(topology.degenerateTriangles).toBe(0); expect(topology.nonManifoldEdges).toBe(0); expect(topology.bounds.min.z).toBeCloseTo(0, 5); part.geometry.dispose(); });
});

test("keeps presets, coupled limits, and all three assemblies safe", () => {
  const defaults = getDefaultParams(model);
  for (const preset of model.presets) {
    const params = { ...defaults, mortiseWidth: preset.mortiseWidth, mortiseLength: preset.mortiseLength, routerBitDiameter: preset.routerBitDiameter };
    const spec = getRouterMortiseJigSpec(params, model);
    expect(spec.openingWidth).toBeCloseTo(preset.mortiseWidth + defaults.guideBushingDiameter - preset.routerBitDiameter + defaults.templateWiggle, 5);
    expect(spec.railGap).toBeCloseTo(spec.openingWidth, 5);
  }
  expect(getParameterLimits(model, { ...defaults, mortiseWidth: 6 }, "routerBitDiameter").max).toBe(6);
  expect(getParameterLimits(model, { ...defaults, routerBitDiameter: 10 }, "guideBushingDiameter").min).toBe(12);
  expect(getParameterLimits(model, defaults, "insertDepth").max).toBe(7);
  for (const stockThickness of [18, 30, 45, 60]) expect(getRouterMortiseJigSpec({ ...defaults, stockThickness }, model).jawSlotMargin).toBeGreaterThanOrEqual(0);
  const main = createRouterMortiseJigPreviewParts(defaults, model); expect(main.some((part) => part.key === "router-base")).toBe(true); expect(main.filter((part) => part.material === "knob")).toHaveLength(4);
  const workpiece = main.find((part) => part.key === "workpiece")!; const leftJaw = main.find((part) => part.key === "left-thickness-jaw")!; const rightJaw = main.find((part) => part.key === "right-thickness-jaw")!;
  workpiece.geometry.computeBoundingBox(); leftJaw.geometry.computeBoundingBox(); rightJaw.geometry.computeBoundingBox();
  expect(workpiece.geometry.boundingBox!.min.y - leftJaw.geometry.boundingBox!.max.y).toBeCloseTo(defaults.workpieceWiggle / 2, 5);
  expect(rightJaw.geometry.boundingBox!.min.y - workpiece.geometry.boundingBox!.max.y).toBeCloseTo(defaults.workpieceWiggle / 2, 5);
  expect(leftJaw.geometry.boundingBox!.max.z).toBeCloseTo(0, 5); expect(rightJaw.geometry.boundingBox!.max.z).toBeCloseTo(0, 5);
  main.forEach((part) => part.geometry.dispose());
  const positioning = createRouterMortiseJigPreviewParts({ ...defaults, assemblyView: 1 }, model); expect(positioning.some((part) => part.key === "positioning-bridge")).toBe(true); expect(positioning.some((part) => part.key === "router-base")).toBe(false); positioning.forEach((part) => part.geometry.dispose());
  const centering = createRouterMortiseJigPreviewParts({ ...defaults, assemblyView: 2 }, model); expect(centering.some((part) => part.key === "vertical-workpiece")).toBe(true); expect(centering.filter((part) => part.key.includes("centering-")).length).toBeGreaterThanOrEqual(2); centering.forEach((part) => part.geometry.dispose());
});

test("renders, switches setups, preserves URL state, audits, and exports ten STLs", async ({ page }) => {
  const pageErrors: string[] = []; page.on("pageerror", (error) => pageErrors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.goto("/?model=router-mortise-jig&unit=mm");
  await expect(page.getByRole("heading", { name: "Photo-Matched Handheld Router Mortise Jig" })).toBeVisible();
  await expect(page.getByLabel("Photo-Matched Handheld Router Mortise Jig model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByTestId("viewer-status")).toContainText("Router base stand-in 100.0 mm Ø · preview only");
  await expect(page.locator(".audit-row").filter({ hasText: "Calculated router travel" })).toContainText("18.3 mm × 40.3 mm");
  await expect(page.locator(".audit-row").filter({ hasText: "Heat-set inserts" })).toContainText("12 × M5");
  await expect(page.locator(".audit-row").filter({ hasText: "150 N strength screen" })).toContainText("stress margin");
  await expect(page.getByText("2 deck-rail STLs + 2 cross-stop STLs")).toBeVisible();
  await expect(page.getByText("2 under-deck L-shaped thickness-jaw STLs")).toBeVisible();
  const stockThickness = page.getByRole("textbox", { name: "Board thickness (lower jaw gap) in millimeters" }); await expect(stockThickness).toBeVisible(); await stockThickness.fill("45"); await stockThickness.press("Enter");
  await expect.poll(() => new URL(page.url()).searchParams.get("stockThickness")).toBe("45"); await expect(page.getByTestId("viewer-status")).toContainText("Lower jaws 45.0 mm board");
  const positioning = page.getByRole("button", { name: "Positioning", exact: true }); await positioning.click(); await expect(positioning).toHaveAttribute("aria-pressed", "true"); await expect(page.getByTestId("viewer-status")).toContainText("Positioning bridge");
  const centering = page.getByRole("button", { name: "Centering", exact: true }); await centering.click(); await expect(centering).toHaveAttribute("aria-pressed", "true"); await expect(page.getByTestId("viewer-status")).toContainText("Centering fixture");
  await expect.poll(() => new URL(page.url()).searchParams.get("assemblyView")).toBe("2"); await page.reload(); await expect(centering).toHaveAttribute("aria-pressed", "true");
  const preset = page.getByRole("button", { name: /10 × 40 mm.*8 mm cutter/ }); await preset.click(); await expect(preset).toHaveAttribute("aria-pressed", "true");
  const downloads: Array<import("@playwright/test").Download> = []; page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Workspace actions" }).click(); await page.getByRole("button", { name: "Export 10 individual STLs" }).click(); await expect.poll(() => downloads.length, { timeout: 10_000 }).toBe(10);
  expect(downloads.map((download) => download.suggestedFilename())).toEqual(expect.arrayContaining(model.parts.map((part) => expect.stringContaining(`-${part.key}.stl`))));
  for (const download of downloads) { const downloadPath = await download.path(); expect(downloadPath).not.toBeNull(); const topology = inspectStl(fs.readFileSync(downloadPath!)); expect(topology.finite).toBe(true); expect(topology.degenerateTriangles).toBe(0); expect(topology.nonManifoldEdges).toBe(0); expect(topology.bounds.min.z).toBeCloseTo(0, 4); }
  expect(pageErrors).toEqual([]);
});
