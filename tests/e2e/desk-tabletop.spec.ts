import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  buildAuditItems,
  createDeskTabletopGeometry,
  createDeskTabletopSurfaceGeometries,
  getDefaultParams,
  getDeskTabletopSpec,
  getParameterLimits,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/desk-tabletop/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "dining-table-v1" }>;

function expectClosedTriangleSoup(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const edges = new Map<string, number>();
  const key = (index: number) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(5))
      .join(",");
  for (let index = 0; index < position.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index);
    const b = new THREE.Vector3().fromBufferAttribute(position, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, index + 2);
    expect(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()).toBeGreaterThan(
      1e-10,
    );
    for (const [start, end] of [
      [index, index + 1],
      [index + 1, index + 2],
      [index + 2, index],
    ]) {
      const aKey = key(start);
      const bKey = key(end);
      const edge = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every((count) => count === 2)).toBe(true);
}

test("desk top geometry preserves the layered envelope and changes surface layout", () => {
  const defaults = getDefaultParams(model);
  const spec = getDeskTabletopSpec(defaults);
  const geometry = createDeskTabletopGeometry(defaults, model);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());

  expect(size.x).toBeCloseTo(spec.length, 3);
  expect(size.y).toBeCloseTo(spec.width, 3);
  expect(size.z).toBeCloseTo(spec.totalThickness, 3);
  expectClosedTriangleSoup(geometry);
  const veneer = createDeskTabletopSurfaceGeometries(defaults, model);
  expect(veneer).toHaveLength(1);
  veneer.forEach((part) => part.dispose());
  geometry.dispose();

  const flooringParams = { ...defaults, finishSystem: 1 };
  const flooringSpec = getDeskTabletopSpec(flooringParams);
  const strips = createDeskTabletopSurfaceGeometries(flooringParams, model);
  expect(strips.length).toBeGreaterThan(20);
  const lengths = new Set<number>();
  for (const strip of strips) {
    strip.computeBoundingBox();
    const stripSize = strip.boundingBox!.getSize(new THREE.Vector3());
    lengths.add(Number(stripSize.x.toFixed(2)));
    expect(strip.boundingBox!.min.x).toBeGreaterThanOrEqual(
      -flooringSpec.innerLength / 2 - 1e-4,
    );
    expect(strip.boundingBox!.max.x).toBeLessThanOrEqual(
      flooringSpec.innerLength / 2 + 1e-4,
    );
    expect(strip.boundingBox!.min.y).toBeGreaterThanOrEqual(
      -flooringSpec.innerWidth / 2 - 1e-4,
    );
    expect(strip.boundingBox!.max.y).toBeLessThanOrEqual(
      flooringSpec.innerWidth / 2 + 1e-4,
    );
    strip.dispose();
  }
  expect(lengths.size).toBeGreaterThan(4);
  const flooringGeometry = createDeskTabletopGeometry(flooringParams, model);
  expectClosedTriangleSoup(flooringGeometry);
  flooringGeometry.dispose();
});

test("desk top limits keep routed profiles in solid edge stock", () => {
  const params = getDefaultParams(model);
  expect(getParameterLimits(model, params, "edgeBandWidth")).toEqual({
    min: 25.4,
    max: 50.8,
    step: 3.175,
  });
  expect(getParameterLimits(model, params, "tabletopCornerRadius").max).toBe(
    params.edgeBandWidth,
  );
  expect(getParameterLimits(model, params, "undersideBevelInset").max).toBe(
    params.edgeBandWidth - params.bottomRoundoverRadius - 6.35,
  );
  expect(getParameterLimits(model, params, "stripLengthMin").max).toBe(
    params.stripLengthMax,
  );
  expect(getParameterLimits(model, params, "stripLengthMax").min).toBe(
    params.stripLengthMin,
  );

  expect(buildAuditItems(params, "in", model).map((item) => item.label)).toEqual([
    "Desk top envelope",
    "Layered construction",
    "Solid-oak edge band",
    "Routed edge profile",
    "Corner radius support",
    "Surface field layout",
    "Core and field coverage",
    "Model envelope",
    "Smallest modeled feature",
  ]);
});

test("desk top surface choice, strip controls, URL state, audit, and export stay connected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/?model=desk-tabletop&unit=in");
  await expect(page).toHaveTitle("3D Prints");
  await expect(page.getByLabel("White Oak Desk Top model viewer").locator("canvas")).toBeVisible();
  await expect(page.getByLabel("White-oak surface system")).toBeVisible();
  await expect(page.getByRole("button", { name: "Plywood veneer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("White-oak surface thickness in inches")).toHaveValue(
    "1/8",
  );
  await expect(page.getByLabel("Solid-oak edge band width in inches")).toHaveValue(
    "1 1/2",
  );
  await expect(page.getByLabel("Flooring strip face width in inches")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Structure" })).toHaveCount(0);

  await page.getByRole("button", { name: "Flooring strips" }).click();
  await expect(page).toHaveURL(/finishSystem=1/);
  await expect(page.getByLabel("Flooring strip face width in inches")).toHaveValue("3");
  const maximumLength = page.getByLabel("Longest flooring strip in inches");
  await maximumLength.fill("36");
  await maximumLength.press("Enter");
  await expect(page).toHaveURL(/stripLengthMax=36/);

  await page.reload();
  await expect(page.getByRole("button", { name: "Flooring strips" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Longest flooring strip in inches")).toHaveValue("36");

  const auditButton = page.getByRole("button", { name: "Audit" }).first();
  if ((await auditButton.getAttribute("aria-expanded")) !== "true") {
    await auditButton.click();
  }
  const audit = page.locator("#sidebar-design-checks-audit-content");
  await expect(audit.getByText("Layered construction")).toBeVisible();
  await expect(
    audit.getByText("Unfinished white-oak flooring strips", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "desk-tabletop-scale-1-8-length-1828.8-width-762.0.stl",
  );
  expect(errors).toEqual([]);
});
