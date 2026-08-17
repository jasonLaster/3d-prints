import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PNG } from "pngjs";
import {
  createCompactWallBracketGeometry,
  createCompactWallBracketTwoUpGeometries,
  getCompactWallBracketSpec,
  getDefaultParams,
  getParameterLimits,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/compact-wall-bracket/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "compact-wall-bracket-v1" }>;

function analyzeGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position");
  const edges = new Map<string, number>();
  const vertices = new Map<string, number[]>();
  const triangles = position.count / 3;
  const parent = Array.from({ length: triangles }, (_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const key = (index: number) =>
    [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4))
      .join(",");
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const triangleIndex = index / 3;
    const a = new THREE.Vector3().fromBufferAttribute(position, index);
    const b = new THREE.Vector3().fromBufferAttribute(position, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, index + 2);
    if (
      new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .lengthSq() <= 1e-10
    ) {
      degenerateTriangles += 1;
    }
    const keys = [key(index), key(index + 1), key(index + 2)];
    for (const vertexKey of keys) {
      const connected = vertices.get(vertexKey) ?? [];
      connected.forEach((other) => union(triangleIndex, other));
      connected.push(triangleIndex);
      vertices.set(vertexKey, connected);
    }
    for (const [start, end] of [
      [keys[0], keys[1]],
      [keys[1], keys[2]],
      [keys[2], keys[0]],
    ]) {
      const edge = start < end ? `${start}|${end}` : `${end}|${start}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  source.computeBoundingBox();
  const result = {
    bounds: source.boundingBox!.clone(),
    components: new Set(parent.map((_, index) => find(index))).size,
    degenerateTriangles,
    finite: Array.from(position.array).every(Number.isFinite),
    nonManifoldEdges: [...edges.values()].filter((count) => count !== 2).length,
    triangles,
  };
  source.dispose();
  return result;
}

function inspectStl(input: Buffer) {
  const geometry = new STLLoader().parse(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength),
  );
  const result = analyzeGeometry(geometry);
  geometry.dispose();
  return result;
}

test("locks the source proportion and separates base-body from diagonal-center depth", () => {
  const params = getDefaultParams(model);
  const spec = getCompactWallBracketSpec(params, model);
  expect(spec.span).toBe(200);
  expect(spec.rise).toBeCloseTo(104.6817, 3);
  expect(spec.span / spec.rise).toBeCloseTo(
    model.geometry.sourceSpan / model.geometry.sourceRise,
    6,
  );
  expect(spec.bodyDepth).toBe(19.05);
  expect(spec.braceDepth).toBe(12.7);
  expect(spec.baseThickness).toBe(10);
  expect(spec.diagonalThickness).toBe(6.4);
  expect(spec.centerWebThickness).toBe(6.4);
  expect(spec.scaleFactor).toBeCloseTo(1.04757, 4);
  expect(spec.pairAngleDegrees).toBeCloseTo(27.4508, 3);
  expect(spec.twoUpWidth).toBeCloseTo(232.3696, 3);
  expect(spec.twoUpDepth).toBeCloseTo(232.3696, 3);
  expect(spec.twoUpFits).toBe(true);
  expect(spec.sparePlateWidth).toBeCloseTo(7.6304, 3);

  const geometry = createCompactWallBracketGeometry(params, model);
  const topology = analyzeGeometry(geometry);
  expect(topology.finite).toBe(true);
  expect(topology.degenerateTriangles).toBe(0);
  expect(topology.nonManifoldEdges).toBe(0);
  expect(topology.components).toBe(1);
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(200, 3);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(104.6817, 3);
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(19.05, 3);
  expect(topology.bounds.min.z).toBeCloseTo(0, 5);
  geometry.dispose();
});

test("couples optimized pair geometry and both depth levels to editable limits", () => {
  const params = getDefaultParams(model);
  expect(getParameterLimits(model, params, "bodyDepth").min).toBe(12.7);
  expect(getParameterLimits(model, params, "braceDepth").min).toBe(8.96);
  expect(getParameterLimits(model, params, "braceDepth").max).toBe(19.05);
  expect(getParameterLimits(model, params, "baseThickness").min).toBe(10);
  expect(getParameterLimits(model, params, "diagonalThickness").min).toBe(6.4);
  expect(getParameterLimits(model, params, "centerWebThickness").min).toBe(6.4);
  expect(getParameterLimits(model, params, "span").max).toBeCloseTo(206.7987, 3);
  expect(getParameterLimits(model, params, "pairGap").max).toBeCloseTo(13.0428, 3);
  expect(getParameterLimits(model, params, "plateSize").min).toBe(243);
  expect(
    getParameterLimits(model, { ...params, plateSize: 220 }, "span").max,
  ).toBeCloseTo(180.0658, 3);
});

test("ships audited single and two-up STL bytes", () => {
  const single = inspectStl(
    fs.readFileSync(
      path.join(
        root,
        "public/models/compact-wall-bracket/compact-wall-bracket-single.stl",
      ),
    ),
  );
  expect(single.finite).toBe(true);
  expect(single.degenerateTriangles).toBe(0);
  expect(single.nonManifoldEdges).toBe(0);
  expect(single.components).toBe(1);
  expect(single.bounds.max.x - single.bounds.min.x).toBeCloseTo(200, 3);
  expect(single.bounds.max.y - single.bounds.min.y).toBeCloseTo(104.6817, 3);
  expect(single.bounds.max.z - single.bounds.min.z).toBeCloseTo(19.05, 3);

  const pair = inspectStl(
    fs.readFileSync(
      path.join(
        root,
        "public/models/compact-wall-bracket/compact-wall-bracket-two-up.stl",
      ),
    ),
  );
  expect(pair.finite).toBe(true);
  expect(pair.degenerateTriangles).toBe(0);
  expect(pair.nonManifoldEdges).toBe(0);
  expect(pair.components).toBe(2);
  expect(pair.bounds.max.x - pair.bounds.min.x).toBeCloseTo(232.3696, 3);
  expect(pair.bounds.max.y - pair.bounds.min.y).toBeCloseTo(232.3696, 3);
  expect(pair.bounds.max.z - pair.bounds.min.z).toBeCloseTo(19.05, 3);
  expect(pair.bounds.min.z).toBeCloseTo(0, 5);

  const generatedPair = createCompactWallBracketTwoUpGeometries(
    getDefaultParams(model),
    model,
  );
  expect(generatedPair).toHaveLength(2);
  generatedPair.forEach((geometry) => geometry.dispose());
});

test("renders grouped controls and exports current single and two-up meshes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("3d-prints:theme", "dark");
  });
  await page.goto("/?model=compact-wall-bracket&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Compact Wall Bracket" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bracket envelope" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strength sections" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Two-up layout" })).toBeVisible();
  for (const [label, value] of [
    ["Outer span in millimeters", "200.0"],
    ["Base body depth in millimeters", "19.1"],
    ["Diagonal + center depth in millimeters", "12.7"],
    ["Base rail thickness in millimeters", "10.0"],
    ["Diagonal rail thickness in millimeters", "6.4"],
    ["Center web thickness in millimeters", "6.4"],
    ["Square build plate size in millimeters", "250.0"],
    ["Plate edge margin in millimeters", "5.0"],
    ["Gap between brackets in millimeters", "5.0"],
  ]) {
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
  await expect(page.getByText("Source mesh has no bolt bores")).toBeVisible();
  await expect(page.locator(".audit-row").filter({ hasText: "Two-up footprint" })).toContainText(
    "232.4 mm × 232.4 mm at 27.5°",
  );
  const canvas = page.locator(".scene-panel canvas");
  await expect(canvas).toBeVisible();
  const canvasImage = PNG.sync.read(await canvas.screenshot());
  const sampleStep = 2;
  const sampleWidth = Math.ceil(canvasImage.width / sampleStep);
  const sampleHeight = Math.ceil(canvasImage.height / sampleStep);
  const bright = new Uint8Array(sampleWidth * sampleHeight);
  for (let sampleY = 0; sampleY < sampleHeight; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
      const x = Math.min(canvasImage.width - 1, sampleX * sampleStep);
      const y = Math.min(canvasImage.height - 1, sampleY * sampleStep);
      const offset = (y * canvasImage.width + x) * 4;
      if (
        canvasImage.data[offset] > 180 &&
        canvasImage.data[offset + 1] > 180 &&
        canvasImage.data[offset + 2] > 180 &&
        canvasImage.data[offset + 3] > 200
      ) {
        bright[sampleY * sampleWidth + sampleX] = 1;
      }
    }
  }
  const visited = new Uint8Array(bright.length);
  let largest = { count: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (let start = 0; start < bright.length; start += 1) {
    if (!bright[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    const component = {
      count: 0,
      minX: sampleWidth,
      maxX: 0,
      minY: sampleHeight,
      maxY: 0,
    };
    while (stack.length > 0) {
      const current = stack.pop()!;
      const x = current % sampleWidth;
      const y = Math.floor(current / sampleWidth);
      component.count += 1;
      component.minX = Math.min(component.minX, x);
      component.maxX = Math.max(component.maxX, x);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);
      for (const neighbor of [
        current - 1,
        current + 1,
        current - sampleWidth,
        current + sampleWidth,
      ]) {
        if (
          neighbor >= 0 &&
          neighbor < bright.length &&
          !visited[neighbor] &&
          bright[neighbor] &&
          Math.abs((neighbor % sampleWidth) - x) <= 1
        ) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    if (component.count > largest.count) largest = component;
  }
  expect(largest.count).toBeGreaterThan(500);
  expect(largest.minX).toBeGreaterThan(0);
  expect(largest.maxX).toBeLessThan(sampleWidth - 1);
  expect(largest.minY).toBeGreaterThan(0);
  expect(largest.maxY).toBeLessThan(sampleHeight - 1);
  expect((largest.minX + largest.maxX) / 2).toBeGreaterThan(
    sampleWidth * 0.25,
  );
  expect((largest.minX + largest.maxX) / 2).toBeLessThan(
    sampleWidth * 0.75,
  );

  const span = page.getByLabel("Outer span in millimeters");
  await span.fill("190");
  await span.blur();
  await expect(page).toHaveURL(/span=190/);
  await expect(page.locator(".audit-row").filter({ hasText: "Two-up footprint" })).toContainText(
    "221.1 mm × 221.1 mm at 27.5°",
  );

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const [singleDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export single STL" }).click(),
  ]);
  expect(singleDownload.suggestedFilename()).toBe(
    "compact-wall-bracket-190x99.4-body-19.1-brace-12.7.stl",
  );
  const singlePath = await singleDownload.path();
  const singleTopology = inspectStl(fs.readFileSync(singlePath!));
  expect(singleTopology.components).toBe(1);
  expect(singleTopology.nonManifoldEdges).toBe(0);
  expect(singleTopology.bounds.max.x - singleTopology.bounds.min.x).toBeCloseTo(
    190,
    3,
  );

  const [pairDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export two-up STL" }).click(),
  ]);
  expect(pairDownload.suggestedFilename()).toBe(
    "compact-wall-bracket-190x99.4-body-19.1-brace-12.7-two-up.stl",
  );
  const pairPath = await pairDownload.path();
  const pairTopology = inspectStl(fs.readFileSync(pairPath!));
  expect(pairTopology.components).toBe(2);
  expect(pairTopology.nonManifoldEdges).toBe(0);
  expect(pairTopology.bounds.max.x - pairTopology.bounds.min.x).toBeCloseTo(
    221.1473,
    3,
  );
  expect(pairTopology.bounds.max.y - pairTopology.bounds.min.y).toBeCloseTo(
    221.1473,
    3,
  );
  expect(errors).toEqual([]);
});

test("keeps the compact bracket workspace usable on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?model=compact-wall-bracket&unit=mm");
  await expect(
    page.getByRole("heading", { name: "Compact Wall Bracket" }),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Outer span in millimeters")).toBeVisible();
  await expect(page.getByLabel("Diagonal + center depth in millimeters")).toBeVisible();
  await expect(page.getByLabel("Gap between brackets in millimeters")).toBeVisible();
  await expect(page.getByText("Source mesh has no bolt bores")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
