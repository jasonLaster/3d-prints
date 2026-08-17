import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createPipeWallMountGeometry,
  createPipeWallMountPipePreviews,
  getDefaultParams,
  getParameterLimits,
  getPipeWallMountSpec,
  type ModelDefinition,
} from "../../src/models";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/pipe-wall-mount/model.json"),
    "utf8",
  ),
) as Extract<ModelDefinition, { viewer: "pipe-wall-mount-v1" }>;

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
    keys.forEach((vertexKey) => {
      const connected = vertices.get(vertexKey) ?? [];
      connected.forEach((other) => union(triangleIndex, other));
      connected.push(triangleIndex);
      vertices.set(vertexKey, connected);
    });
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

test("derives one fitted hook, pipe preview, and clean shell per pipe", () => {
  const params = getDefaultParams(model);
  const spec = getPipeWallMountSpec(params, model);
  expect(spec.pipeDiameters).toEqual([25.4, 25.4, 25.4]);
  expect(spec.hooks).toHaveLength(3);
  expect(spec.hooks.map((hook) => hook.cradleDiameter)).toEqual([
    26.9,
    26.9,
    26.9,
  ]);
  [37.85, 95, 152.15].forEach((expected, index) => {
    expect(spec.hooks[index].centerZ).toBeCloseTo(expected, 5);
  });
  expect(spec.minimumBracketHeight).toBeCloseTo(179.1, 5);
  expect(spec.minimumHookReach).toBeCloseTo(51.7, 5);
  expect(spec.drillLocations).toEqual([
    { x: -6.5, z: 16 },
    { x: 6.5, z: 16 },
    { x: -6.5, z: 174 },
    { x: 6.5, z: 174 },
  ]);
  expect(spec.drillColumnSpacing).toBe(13);
  expect(spec.drillRowSpacing).toBe(158);
  expect(getParameterLimits(model, params, "bracketHeight").min).toBeCloseTo(
    179.1,
    5,
  );
  expect(getParameterLimits(model, params, "hookReach").min).toBeCloseTo(
    51.7,
    5,
  );
  expect(getParameterLimits(model, params, "hookWidth").min).toBeCloseTo(
    26.5,
    5,
  );
  expect(getParameterLimits(model, params, "mountingHoleDiameter").max).toBe(
    7,
  );

  const previews = createPipeWallMountPipePreviews(params, model);
  expect(previews).toHaveLength(3);
  previews.forEach((geometry) => {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(52, 3);
    expect(size.y).toBeCloseTo(25.4, 3);
    expect(size.z).toBeCloseTo(25.4, 3);
    geometry.dispose();
  });

  const geometry = createPipeWallMountGeometry(params, model);
  const topology = analyzeGeometry(geometry);
  expect(topology.finite).toBe(true);
  expect(topology.degenerateTriangles).toBe(0);
  expect(topology.nonManifoldEdges).toBe(0);
  expect(topology.components).toBe(1);
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(28, 3);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(75, 3);
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(190, 3);
  geometry.dispose();

  const mixed = getPipeWallMountSpec(
    {
      ...params,
      pipeCount: 4,
      pipeDiameter1: 19.05,
      pipeDiameter2: 25.4,
      pipeDiameter3: 31.75,
      pipeDiameter4: 38.1,
      bracketHeight: 243.5,
    },
    model,
  );
  expect(mixed.pipeDiameters).toEqual([19.05, 25.4, 31.75, 38.1]);
  expect(mixed.minimumBracketHeight).toBeCloseTo(243.5, 5);
  expect(mixed.hooks.map((hook) => hook.cradleDiameter)).toEqual([
    20.55,
    26.9,
    33.25,
    39.6,
  ]);
});

test("edits the pipe set, reports drill locations, and exports only the mount", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/?model=pipe-wall-mount&unit=in");
  await expect(
    page.getByRole("heading", { name: "Variable Pipe Wall Mount" }),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipe set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hook shape" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Backplate & drilling" }),
  ).toBeVisible();
  const pipeList = page.getByLabel("Pipe outside diameters (in)");
  await expect(pipeList).toHaveValue("1, 1, 1");
  await expect(page.getByLabel("Pipe 1 diameter in inches")).toHaveCount(0);
  await expect(page.getByText("3 pipe hooks · 1 in · 1 in · 1 in")).toBeVisible();
  await expect(
    page.locator(".audit-row").filter({ hasText: "Cradle fit" }),
  ).toContainText("1/16 in total wiggle room · 0.03 in per side");
  await expect(
    page.locator(".audit-row").filter({ hasText: "Drill pattern" }),
  ).toContainText("4 × Ø7/32 in · columns 1/2 in apart · rows 6 1/4 in apart");
  await expect(page.getByText("Blue cylinders show the configured outside diameters")).toBeVisible();

  await pipeList.fill("3/4, 1, 1 1/4, 1 1/2");
  await pipeList.press("Enter");
  await expect(pipeList).toHaveValue("3/4, 1, 1 1/4, 1 1/2");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("pipes"))
    .toBe("0.75,1,1.25,1.5");
  await expect(
    page.getByText("4 pipe hooks · 3/4 in · 1 in · 1 1/4 in · 1 1/2 in"),
  ).toBeVisible();
  await expect
    .poll(() => Number(new URL(page.url()).searchParams.get("bracketHeight")))
    .toBeGreaterThan(9.58);

  const reach = page.getByLabel("Hook reach from wall in inches");
  await reach.fill("2");
  await reach.blur();
  await expect
    .poll(() => Number(new URL(page.url()).searchParams.get("hookReach")))
    .toBeCloseTo(2.5354, 3);

  await page.reload();
  await expect(page.getByLabel("Pipe outside diameters (in)")).toHaveValue(
    "3/4, 1, 1 1/4, 1 1/2",
  );
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await expect(page.getByText("Reference single hook")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export wall mount STL" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^pipe-wall-mount-pipes-19\.05_25\.4_31\.75_38\.1-wiggle-1\.5-reach-64\.4-height-243\.51\.stl$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const topology = inspectStl(fs.readFileSync(downloadPath!));
  expect(topology.finite).toBe(true);
  expect(topology.degenerateTriangles).toBe(0);
  expect(topology.nonManifoldEdges).toBe(0);
  expect(topology.components).toBe(1);
  expect(topology.bounds.min.z).toBeCloseTo(0, 4);
  expect(topology.bounds.max.x - topology.bounds.min.x).toBeCloseTo(243.51, 2);
  expect(topology.bounds.max.y - topology.bounds.min.y).toBeCloseTo(64.4, 2);
  expect(topology.bounds.max.z - topology.bounds.min.z).toBeCloseTo(28, 2);
  expect(errors).toEqual([]);
});

test("keeps the pipe mount usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?model=pipe-wall-mount&unit=in");
  await expect(
    page.getByRole("heading", { name: "Variable Pipe Wall Mount" }),
  ).toBeVisible();
  await expect(page.locator(".scene-panel canvas")).toBeVisible();
  await expect(page.getByLabel("Pipe outside diameters (in)")).toBeVisible();
  await expect(page.getByLabel("Overall bracket height in inches")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
