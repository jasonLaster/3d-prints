import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTrayDividerGeometries,
  getSimpleBoxDividerTop,
} from "../../src/models/japandiTray";
import type {
  ModelParams,
  SimpleBoxModelDefinition,
} from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(path.join(root, "public/models/simple-box/model.json"), "utf8"),
) as SimpleBoxModelDefinition;
const defaults = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
) as ModelParams;

function dividerTop(params: ModelParams) {
  const geometries = createTrayDividerGeometries(params, model);
  expect(geometries).toHaveLength(Math.round(params.dividerCount));
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
  }
  const tops = geometries.map((geometry) => geometry.boundingBox!.max.z);
  geometries.forEach((geometry) => geometry.dispose());
  return Math.max(...tops);
}

test("simple-box dividers clear the fitted lid skirt", () => {
  const params = { ...defaults, lidSkirtHeight: 6 };
  const skirtBottom =
    params.height -
    params.lidSkirtHeight +
    model.geometry.stackingLipFloorOverlap;

  expect(dividerTop(params)).toBeCloseTo(
    skirtBottom - model.geometry.dividerTopClearance,
    5,
  );
  expect(getSimpleBoxDividerTop(params, model)).toBeLessThan(skirtBottom);
});

test("simple-box dividers clear a deeper stacking foot", () => {
  const params = { ...defaults, lipHeight: 7 };
  const footBottom =
    params.height - params.lipHeight + model.geometry.stackingLipFloorOverlap;

  expect(dividerTop(params)).toBeCloseTo(
    footBottom - model.geometry.dividerTopClearance,
    5,
  );
});

test("simple-box dividers clear the Gridfinity stacking-rim support", () => {
  const params = {
    ...defaults,
    gridfinityCompatible: 1,
    lidSkirtHeight: 1,
  };
  const rimBottom =
    params.height -
    model.geometry.gridfinityLipSupportHeight -
    model.geometry.gridfinityLipInnerChamfer -
    model.geometry.gridfinityLipOuterChamfer;

  expect(dividerTop(params)).toBeCloseTo(
    rimBottom - model.geometry.dividerTopClearance,
    5,
  );
});
