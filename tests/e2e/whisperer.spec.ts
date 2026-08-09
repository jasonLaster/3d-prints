import { expect, test, type Download } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDiningTableStructuralAssessment,
} from "../../src/models/diningTable";
import { getDefaultParams } from "../../src/models/shared";
import type { DiningTableModelDefinition } from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/whisperer/model.json"), "utf8"),
) as DiningTableModelDefinition;

test("builds the plan-derived Whisperer geometry without separate hardware", () => {
  const params = getDefaultParams(model);
  const geometry = createDiningTableWoodGeometry(params, model);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");

  expect(bounds.max.x - bounds.min.x).toBeCloseTo(182.88, 2);
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(101.6, 2);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(76.2, 2);
  expect(bounds.min.z).toBeCloseTo(0, 4);
  expect(
    Array.from({ length: position.count }, (_, index) => [
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ]).flat().every(Number.isFinite),
  ).toBe(true);

  const hardware = createDiningTableHardwareGeometries(params);
  expect(hardware.plates).toEqual([]);
  expect(hardware.channels).toEqual([]);
  geometry.dispose();
});

test("screens the Whisperer apron frame and responds to structural dimensions", () => {
  const params = getDefaultParams(model);
  const baseline = getDiningTableStructuralAssessment(params);
  const score = (
    assessment: ReturnType<typeof getDiningTableStructuralAssessment>,
    key: ReturnType<
      typeof getDiningTableStructuralAssessment
    >["metrics"][number]["key"],
  ) => assessment.metrics.find((metric) => metric.key === key)!.score;

  expect(baseline.metrics.map((metric) => metric.key)).toEqual([
    "longitudinal-racking",
    "end-box-racking",
    "torsion",
    "tipping",
    "floor-rocking",
    "member-stiffness",
  ]);
  expect(baseline.metrics.every((metric) =>
    Number.isFinite(metric.score) && metric.score >= 0 && metric.score <= 100,
  )).toBe(true);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(1, 10);
  expect(
    baseline.metrics.reduce(
      (total, metric) => total + metric.score * metric.calculation.weight,
      0,
    ),
  ).toBeCloseTo(baseline.overallScore, 1);
  expect(baseline.overallCalculation.formula).toContain(
    "24% × Long-apron racking",
  );
  expect(baseline.heightSensitivity.lower?.delta).toBeGreaterThan(0);
  expect(baseline.heightSensitivity.higher?.delta).toBeLessThan(0);

  for (const metric of baseline.metrics) {
    expect(metric.calculation.rationale.length, metric.key).toBeGreaterThan(40);
    expect(metric.calculation.formula.length, metric.key).toBeGreaterThan(20);
    expect(metric.calculation.inputs.length, metric.key).toBeGreaterThanOrEqual(5);
    expect(
      new Set(metric.calculation.inputs.map((input) => input.key)).size,
      metric.key,
    ).toBe(metric.calculation.inputs.length);
  }

  const taller = getDiningTableStructuralAssessment({
    ...params,
    overallHeight: params.overallHeight + 25.4,
  });
  expect(taller.overallScore).toBeLessThan(baseline.overallScore);
  for (const key of [
    "longitudinal-racking",
    "end-box-racking",
    "tipping",
    "member-stiffness",
  ] as const) {
    expect(score(taller, key), key).toBeLessThan(score(baseline, key));
  }

  const deeperLongAprons = getDiningTableStructuralAssessment({
    ...params,
    longApronHeight: params.longApronHeight + 25.4,
  });
  expect(score(deeperLongAprons, "longitudinal-racking")).toBeGreaterThan(
    score(baseline, "longitudinal-racking"),
  );
  expect(score(deeperLongAprons, "torsion")).toBeGreaterThan(
    score(baseline, "torsion"),
  );

  const deeperSideAprons = getDiningTableStructuralAssessment({
    ...params,
    sideApronHeight: params.sideApronHeight + 25.4,
  });
  expect(score(deeperSideAprons, "end-box-racking")).toBeGreaterThan(
    score(baseline, "end-box-racking"),
  );

  const thickerTop = getDiningTableStructuralAssessment({
    ...params,
    topThickness: params.topThickness + 12.7,
  });
  expect(score(thickerTop, "torsion")).toBeGreaterThan(
    score(baseline, "torsion"),
  );
  expect(score(thickerTop, "member-stiffness")).toBeGreaterThan(
    score(baseline, "member-stiffness"),
  );

  const widerChamfers = getDiningTableStructuralAssessment({
    ...params,
    legFootChamfer: params.legFootChamfer + 3.175,
  });
  expect(score(widerChamfers, "floor-rocking")).toBeLessThan(
    score(baseline, "floor-rocking"),
  );
});

test("documents each Whisperer structural formula", () => {
  const structuralSpec = fs.readFileSync(
    path.join(root, "docs/whisperer-table-audit-specifications.md"),
    "utf8",
  );
  for (const heading of [
    "Long-apron racking",
    "Side-frame racking",
    "Apron-frame torsion",
    "Splayed-foot tipping margin",
    "Floor rocking tolerance",
    "Member stiffness",
    "Overall weighting and grades",
  ]) {
    expect(structuralSpec).toContain(`### ${heading}`);
  }
  expect(structuralSpec).toContain("geometry-only comparison");
  expect(structuralSpec).toContain("full-size corner mock");
  expect(structuralSpec).toContain("physical result overrides this screen");
});

test("renders, persists a plan parameter, and exports one Whisperer STL", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=whisperer&unit=in");
  await expect(page.getByRole("heading", { name: "Whisperer" })).toBeVisible();
  await expect(page.getByLabel("Whisperer model viewer")).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Table length in inches")).toHaveValue("72");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("40");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 3/4");
  const bevelInset = page.getByLabel("Underside bevel inset in inches");
  await expect(bevelInset).toHaveValue("5");
  await bevelInset.fill("4 1/2");
  await bevelInset.press("Enter");
  await expect(page).toHaveURL(/undersideBevelInset=4\.5/);
  await page.reload();
  await expect(bevelInset).toHaveValue("4 1/2");
  await expect(page.getByText(/15° splay/)).toBeVisible();
  await expect(page.getByText(/1 top · 4 legs/)).toBeVisible();

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download: Download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "whisperer-scale-1-10-length-1828.8-width-1016.0.stl",
  );
  const downloadPath = await download.path();
  const buffer = fs.readFileSync(downloadPath!);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const exported = new STLLoader().parse(arrayBuffer);
  exported.computeBoundingBox();
  expect(exported.boundingBox!.min.z).toBeCloseTo(0, 3);
  expect(
    exported.boundingBox!.max.z - exported.boundingBox!.min.z,
  ).toBeCloseTo(76.2, 1);
  const exportedPosition = exported.getAttribute("position");
  let bedMinX = Infinity;
  let bedMaxX = -Infinity;
  let bedMinY = Infinity;
  let bedMaxY = -Infinity;
  for (let index = 0; index < exportedPosition.count; index += 1) {
    if (
      Math.abs(
        exportedPosition.getZ(index) - exported.boundingBox!.min.z,
      ) > 1e-4
    ) {
      continue;
    }
    bedMinX = Math.min(bedMinX, exportedPosition.getX(index));
    bedMaxX = Math.max(bedMaxX, exportedPosition.getX(index));
    bedMinY = Math.min(bedMinY, exportedPosition.getY(index));
    bedMaxY = Math.max(bedMaxY, exportedPosition.getY(index));
  }
  expect(bedMaxX - bedMinX).toBeGreaterThan(180);
  expect(bedMaxY - bedMinY).toBeGreaterThan(100);
  exported.dispose();
  expect(pageErrors).toEqual([]);
});

test("shows Whisperer structural checks with its own formulas and sources", async ({
  page,
}) => {
  await page.goto("/?model=whisperer&unit=in");
  const designChecks = page.getByLabel("Workspace model library");
  await expect(
    designChecks.getByRole("button", { name: "Design checks", exact: true }),
  ).toHaveClass(/active/);
  const structuralAssessment = designChecks.getByLabel(
    "Structural wobble assessment",
  );
  await expect(structuralAssessment).toBeVisible();
  await expect(structuralAssessment.getByRole("listitem")).toHaveCount(6);
  await expect(
    structuralAssessment
      .locator('[data-metric="longitudinal-racking"]')
      .getByText("Long-apron racking", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment
      .locator('[data-metric="end-box-racking"]')
      .getByText("Side-frame racking", { exact: true }),
  ).toBeVisible();
  await expect(
    structuralAssessment
      .locator('[data-metric="torsion"]')
      .getByText("Apron-frame torsion", { exact: true }),
  ).toBeVisible();

  await structuralAssessment
    .getByRole("button", { name: "Explain Long-apron racking calculation" })
    .click();
  const calculation = structuralAssessment.getByLabel(
    "Long-apron racking calculation details",
  );
  await expect(calculation).toContainText("Long apron depth");
  await expect(calculation).toContainText("mortise-and-tenon dimensions");
  await expect(
    calculation.getByRole("link", {
      name: "Long-apron racking detailed specification",
    }),
  ).toHaveAttribute(
    "href",
    /whisperer-table-audit-specifications\.md#long-apron-racking$/,
  );
  await expect(
    calculation.getByRole("link", {
      name: "Long-apron racking formula source code",
    }),
  ).toHaveAttribute("href", /whispererTable\.ts#L449-L539$/);

  const baselineScore = Number(
    await structuralAssessment.getAttribute("data-overall-score"),
  );
  await page.getByLabel("Overall height in inches").fill("31");
  await expect.poll(async () =>
    Number(await structuralAssessment.getAttribute("data-overall-score")),
  ).toBeLessThan(baselineScore);
});
