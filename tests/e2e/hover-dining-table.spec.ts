import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  getHoverDiningTableCutList,
  getHoverDiningTableSpec,
} from "../../src/models/hoverDiningTable";
import type {
  HoverDiningTableModelDefinition,
  ModelParams,
} from "../../src/models/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const model = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/models/hover-dining-table/model.json"),
    "utf8",
  ),
) as HoverDiningTableModelDefinition;
const defaultParams = Object.fromEntries(
  model.parameters.map((parameter) => [parameter.key, parameter.default]),
) as ModelParams;

function inspectGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute("position");
  let finite = true;
  let degenerateTriangles = 0;
  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const ab = [
      position.getX(index + 1) - ax,
      position.getY(index + 1) - ay,
      position.getZ(index + 1) - az,
    ];
    const ac = [
      position.getX(index + 2) - ax,
      position.getY(index + 2) - ay,
      position.getZ(index + 2) - az,
    ];
    finite &&= [ax, ay, az, ...ab, ...ac].every(Number.isFinite);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2 <= 1e-12) {
      degenerateTriangles += 1;
    }
  }
  return {
    finite,
    degenerateTriangles,
    position,
    min: bounds.min.clone(),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function inspectStl(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  const result = inspectGeometry(geometry);
  geometry.dispose();
  return result;
}

function inspectWoodUvs(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  let finite = Boolean(uv) && uv.count === position.count;
  let inUnitRange = finite;
  if (uv) {
    for (let index = 0; index < uv.count; index += 1) {
      const u = uv.getX(index);
      const v = uv.getY(index);
      finite &&= Number.isFinite(u) && Number.isFinite(v);
      inUnitRange &&= u >= -1e-6 && u <= 1 + 1e-6;
      inUnitRange &&= v >= -1e-6 && v <= 1 + 1e-6;
    }
  }
  return { finite, inUnitRange, count: uv?.count ?? 0 };
}

function inspectPlanarContactFace(
  geometry: THREE.BufferGeometry,
  planeX: number,
  tolerance = 1e-4,
) {
  const position = geometry.getAttribute("position");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let area = 0;
  let triangleCount = 0;
  let minimumAbsoluteNormalX = 1;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    if (
      Math.abs(a.x - planeX) > tolerance ||
      Math.abs(b.x - planeX) > tolerance ||
      Math.abs(c.x - planeX) > tolerance
    ) {
      continue;
    }
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const triangleArea = normal.length() / 2;
    if (triangleArea <= 1e-8) continue;
    area += triangleArea;
    triangleCount += 1;
    minimumAbsoluteNormalX = Math.min(
      minimumAbsoluteNormalX,
      Math.abs(normal.normalize().x),
    );
    for (const point of [a, b, c]) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
  }

  return {
    area,
    triangleCount,
    minimumAbsoluteNormalX,
    ySpan: maxY - minY,
    zSpan: maxZ - minZ,
  };
}

function centerlineZRange(
  geometry: THREE.BufferGeometry,
  tolerance = 1e-4,
) {
  const position = geometry.getAttribute("position");
  const zValues: number[] = [];
  for (let index = 0; index < position.count; index += 1) {
    if (
      Math.abs(position.getX(index)) <= tolerance &&
      Math.abs(position.getY(index)) <= tolerance
    ) {
      zValues.push(position.getZ(index));
    }
  }
  return {
    count: zValues.length,
    min: Math.min(...zValues),
    max: Math.max(...zValues),
  };
}

test("derives two centered half-lapped Xs with direct tabletop and floor contact", () => {
  const { fullSize, scaled } = getHoverDiningTableSpec(defaultParams);
  for (const brace of [fullSize.upperBrace, fullSize.lowerBrace]) {
    expect(brace.endpointOuterY + brace.endpointInset).toBeCloseTo(
      brace.cornerTangentY,
      6,
    );
    expect(brace.miterHalfWidth).toBeCloseTo(
      brace.width / (2 * Math.cos(brace.angleRadians)),
      6,
    );
    expect(brace.edgeRadius).toBeLessThan(
      brace.halfLapDepth - fullSize.halfLapClearance / 2,
    );
  }
  const largerRadius = getHoverDiningTableSpec({
    ...defaultParams,
    frameInnerCornerRadius: defaultParams.frameInnerCornerRadius + 12.7,
  }).fullSize;
  expect(largerRadius.upperBrace.endpointY).toBeLessThan(
    fullSize.upperBrace.endpointY,
  );
  expect(largerRadius.lowerBrace.endpointY).toBeLessThan(
    fullSize.lowerBrace.endpointY,
  );
  expect(largerRadius.upperBrace.endpointOuterY).toBeCloseTo(
    largerRadius.upperBrace.cornerTangentY,
    6,
  );
  expect(largerRadius.lowerBrace.endpointOuterY).toBeCloseTo(
    largerRadius.lowerBrace.cornerTangentY,
    6,
  );
  expect(fullSize.frameHeight).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.upperBrace.zTop).toBeCloseTo(fullSize.topBottom, 6);
  expect(fullSize.lowerBrace.zBottom).toBeCloseTo(0, 6);
  expect(fullSize.upperBrace.halfLapDepth).toBeCloseTo(
    fullSize.upperBrace.thickness / 2,
    6,
  );
  expect(fullSize.lowerBrace.halfLapDepth).toBeCloseTo(
    fullSize.lowerBrace.thickness / 2,
    6,
  );
  expect(fullSize.upperBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.upperBrace.spanX, fullSize.upperBrace.spanY),
    6,
  );
  expect(fullSize.lowerBrace.diagonalLength).toBeCloseTo(
    Math.hypot(fullSize.lowerBrace.spanX, fullSize.lowerBrace.spanY),
    6,
  );
  expect(fullSize.upperBrace.angleRadians).toBeGreaterThan(0);
  expect(fullSize.lowerBrace.angleRadians).toBeGreaterThan(0);

  const geometry = createHoverDiningTableGeometry(defaultParams, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
  expect(inspected.min.z).toBeCloseTo(0, 5);
  expect(inspected.size.x).toBeCloseTo(scaled.length, 4);
  expect(inspected.size.y).toBeCloseTo(scaled.width, 4);
  expect(inspected.size.z).toBeCloseTo(scaled.height, 4);
  const woodUvs = inspectWoodUvs(geometry);
  expect(woodUvs.finite).toBe(true);
  expect(woodUvs.inUnitRange).toBe(true);
  expect(woodUvs.count).toBe(inspected.position.count);

  let centralFloorVertices = 0;
  let centralUpperContactVertices = 0;
  for (let index = 0; index < inspected.position.count; index += 1) {
    const x = inspected.position.getX(index);
    const z = inspected.position.getZ(index);
    if (Math.abs(x) > scaled.length / 8) continue;
    if (Math.abs(z) < 1e-4) centralFloorVertices += 1;
    if (Math.abs(z - scaled.topBottom) < 1e-4) {
      centralUpperContactVertices += 1;
    }
  }
  expect(centralFloorVertices).toBeGreaterThan(0);
  expect(centralUpperContactVertices).toBeGreaterThan(0);
  geometry.dispose();
});

test("explodes the glue-up into one top, eight box bars, and four X bars", () => {
  const parts = createHoverDiningTableExplodedParts(defaultParams, model);
  const { scaled: spec } = getHoverDiningTableSpec(defaultParams);
  expect(parts).toHaveLength(13);
  expect(new Set(parts.map((part) => part.name)).size).toBe(13);
  expect(
    Object.fromEntries(
      [...new Set(parts.map((part) => part.category))].map((category) => [
        category,
        parts.filter((part) => part.category === category).length,
      ]),
    ),
  ).toEqual({
    tabletop: 1,
    "end-box-horizontal": 4,
    "end-box-vertical": 4,
    "upper-x": 2,
    "floor-x": 2,
  });

  for (const [category, brace] of [
    ["upper-x", spec.upperBrace],
    ["floor-x", spec.lowerBrace],
  ] as const) {
    const members = parts.filter((part) => part.category === category);
    expect(members, category).toHaveLength(2);
    members.forEach((member, memberIndex) => {
      member.geometry.computeBoundingBox();
      const bounds = member.geometry.boundingBox!;
      expect(bounds.min.x, member.name).toBeCloseTo(-brace.spanX / 2, 4);
      expect(bounds.max.x, member.name).toBeCloseTo(brace.spanX / 2, 4);

      for (const endSign of [-1, 1] as const) {
        const contact = inspectPlanarContactFace(
          member.geometry,
          endSign * brace.spanX / 2,
        );
        expect(contact.triangleCount, `${member.name} contact ${endSign}`).toBeGreaterThan(0);
        expect(contact.minimumAbsoluteNormalX, `${member.name} contact normal`).toBeCloseTo(1, 5);
        expect(contact.ySpan, `${member.name} full-width contact`).toBeCloseTo(
          brace.miterHalfWidth * 2,
          4,
        );
        expect(contact.zSpan, `${member.name} full-depth contact`).toBeCloseTo(
          brace.thickness,
          4,
        );
        expect(contact.area, `${member.name} useful contact area`).toBeGreaterThan(
          brace.width * brace.thickness * 0.7,
        );
      }

      const center = centerlineZRange(member.geometry);
      expect(center.count, `${member.name} centered pocket`).toBeGreaterThan(0);
      if (memberIndex === 0) {
        expect(center.min, `${member.name} lower envelope`).toBeCloseTo(
          brace.zBottom,
          4,
        );
        expect(center.max, `${member.name} top-pocket depth`).toBeCloseTo(
          (brace.zBottom + brace.zTop - spec.halfLapClearance) / 2,
          4,
        );
      } else {
        expect(center.min, `${member.name} bottom-pocket depth`).toBeCloseTo(
          (brace.zBottom + brace.zTop + spec.halfLapClearance) / 2,
          4,
        );
        expect(center.max, `${member.name} upper envelope`).toBeCloseTo(
          brace.zTop,
          4,
        );
      }
    });
  }

  for (const part of parts) {
    const inspected = inspectGeometry(part.geometry);
    expect(inspected.finite, part.name).toBe(true);
    expect(inspected.degenerateTriangles, part.name).toBe(0);
    expect(inspected.size.x, part.name).toBeGreaterThan(0);
    expect(inspected.size.y, part.name).toBeGreaterThan(0);
    expect(inspected.size.z, part.name).toBeGreaterThan(0);
    const woodUvs = inspectWoodUvs(part.geometry);
    expect(woodUvs.finite, part.name).toBe(true);
    expect(woodUvs.inUnitRange, part.name).toBe(true);
    expect(woodUvs.count, part.name).toBe(inspected.position.count);
    expect(part.offset.toArray().every(Number.isFinite), part.name).toBe(true);
    part.geometry.dispose();
  }
});

test("derives a full-size finished cut schedule for all 13 pieces", () => {
  const cutList = getHoverDiningTableCutList(defaultParams);
  expect(cutList.material).toBe("Oak");
  expect(cutList.dimensionBasis).toBe("full-size finished dimensions");
  expect(cutList.totalPieces).toBe(13);
  expect(cutList.parts).toHaveLength(8);
  expect(cutList.parts.reduce((sum, part) => sum + part.quantity, 0)).toBe(13);
  expect(cutList.parts.map((part) => part.id)).toEqual([
    "T1",
    "B1",
    "B2",
    "B3",
    "U1",
    "U2",
    "F1",
    "F2",
  ]);

  const tabletop = cutList.parts.find((part) => part.id === "T1")!;
  expect(tabletop.length).toBeCloseTo(defaultParams.tableLength, 6);
  expect(tabletop.width).toBeCloseTo(defaultParams.tableWidth, 6);
  const upperMembers = cutList.parts.filter((part) => part.assembly === "upper X");
  expect(upperMembers).toHaveLength(2);
  expect(upperMembers.map((part) => part.lap?.face)).toEqual(["top", "bottom"]);
  for (const part of cutList.parts) {
    expect(part.quantity, part.id).toBeGreaterThan(0);
    expect(part.length, part.id).toBeGreaterThan(0);
    expect(part.width, part.id).toBeGreaterThan(0);
    expect(part.thickness, part.id).toBeGreaterThan(0);
    if (part.lap) {
      expect(part.lap.centerFromEnd, part.id).toBeCloseTo(part.length / 2, 6);
      expect(part.lap.length, part.id).toBeGreaterThan(part.width);
      expect(part.lap.depth, part.id).toBeLessThan(part.thickness);
      expect(part.lap.shoulderAngleDegrees, part.id).toBeGreaterThan(0);
      expect(part.lap.shoulderAngleDegrees, part.id).toBeLessThan(90);
    }
  }

  const changedScale = getHoverDiningTableCutList({
    ...defaultParams,
    mockScale: defaultParams.mockScale * 2,
  });
  expect(changedScale.parts).toEqual(cutList.parts);
});

test("renders, manipulates, and exports the oak X-Hover table", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(
    page.getByRole("heading", { name: "X-Hover Dining Table" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("X-Hover Dining Table model viewer"),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByLabel("Mock scale denominator")).toHaveValue("10");
  await expect(page.getByLabel("Table length in inches")).toHaveValue("75");
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("Overall height in inches")).toHaveValue("29 1/2");
  await expect(page.getByLabel("Tabletop thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Long-edge roll depth in inches")).toHaveValue("5/8");
  await expect(page.getByLabel("End-box inner corner radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Upper-X brace width in inches")).toHaveValue("1 3/4");
  await expect(page.getByLabel("Upper-X brace thickness in inches")).toHaveValue("1");
  await expect(page.getByLabel("Upper-X top/bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Floor-X brace thickness in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Floor-X top/bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(page.getByLabel("Tabletop hover gap in inches")).toHaveCount(0);
  await expect(page.getByLabel("Lengthwise stretcher height in inches")).toHaveCount(0);
  await expect(page.getByLabel("Bézier curve editor")).toBeVisible();
  await expect(
    page.getByLabel("Tabletop edge curve tension Bézier tension"),
  ).toHaveValue("0.552");
  await expect(
    page.getByLabel("Inner corner curve tension Bézier tension"),
  ).toHaveValue("0.580");
  await expect(page.getByLabel("X-Hover assembly view")).toBeVisible();
  const assembledButton = page.getByRole("button", { name: "Assembled" });
  const explodedButton = page.getByRole("button", { name: "Exploded" });
  const cutListButton = page.getByRole("button", { name: "Cut list" });
  await expect(assembledButton).toHaveAttribute("aria-pressed", "true");
  await expect(explodedButton).toHaveAttribute("aria-pressed", "false");
  await expect(cutListButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "assembled",
  );
  await expect(
    page.getByText(
      "Explode all 13 pieces or open the full-size dimensioned fabrication sheet.",
    ),
  ).toBeVisible();

  const orientationBeforeExplosion = await page
    .locator(".orientation-cube")
    .getAttribute("style");
  await explodedButton.click();
  await expect(explodedButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await expect(page.getByText("Exploded · 13 pieces")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );

  await expect(page.getByText("75 in × 35 1/2 in × 29 1/2 in")).toBeVisible();
  await expect(page.getByText("2 × 32 in wide closed boxes")).toBeVisible();
  await expect(page.getByText("0 in bottom spread")).toBeVisible();
  await expect(page.getByText(/2 × .* at ±\d+\.\d°/).first()).toBeVisible();
  await expect(
    page.getByText(
      "2 centered · full width · complementary 50% depth · 0 in fit clearance",
    ),
  ).toBeVisible();
  await expect(page.getByText(/upper Z 28 1\/4 in · lower Z 0 in · zero gaps/)).toBeVisible();
  await expect(page.getByText(/8 box-parallel bearing faces · 4 per X/)).toBeVisible();
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(14);

  await page.getByLabel("Table width in inches").fill("36");
  await expect(page.getByText("2 × 32 1/2 in wide closed boxes")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("1");
  await expect(page.getByText("+1 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("-1/2");
  await expect(page.getByText("-1/2 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box inner corner radius in inches").fill("3");
  await expect(page).toHaveURL(/frameInnerCornerRadius=3/);
  await expect(page.getByText(/8 box-parallel bearing faces · 4 per X/)).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );
  await page.getByLabel("Floor-X brace width in inches").fill("2 1/8");
  await expect(page).toHaveURL(/lowerBraceWidth=2\.126/);
  await page.getByLabel("Half-lap fit clearance in inches").fill("1/32");
  await expect(page).toHaveURL(/halfLapClearance=0\.0315/);
  await page
    .getByLabel("Inner corner curve tension Bézier tension")
    .fill("0.65");
  await expect(page).toHaveURL(/frameInnerCurveTension=0\.65/);
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(14);

  await page.getByRole("button", { name: "Reset parameters" }).click();
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(
    page.getByLabel("Inner corner curve tension Bézier tension"),
  ).toHaveValue("0.580");
  await cutListButton.click();
  await expect(cutListButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "cut-list",
  );
  await expect(page.getByText("Cut list · full-size · 13 pieces")).toBeVisible();
  await expect(page.getByLabel("X-Hover full-size cut list")).toBeVisible();
  await expect(page.locator(".hover-cut-table tbody tr")).toHaveCount(8);
  await expect(page.locator(".hover-cut-card")).toHaveCount(8);
  await expect(
    page.getByRole("img", { name: /dimensioned cut diagram/ }),
  ).toHaveCount(8);
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "L 75 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U1"]')).toContainText(
    "top half-lap",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U2"]')).toContainText(
    "bottom half-lap",
  );
  await page.getByLabel("Table width in inches").fill("36");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "W 36 in",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="B1"]')).toContainText(
    "L 32 1/2 in",
  );
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "cut-list",
  );
  await page.getByLabel("Table width in inches").fill("35 1/2");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "W 35 1/2 in",
  );
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );

  await page.getByRole("button", { name: "Workspace actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "hover-dining-table-scale-1-10-length-1905.0-width-901.7.stl",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const stl = inspectStl(fs.readFileSync(downloadPath!));
  expect(stl.finite).toBe(true);
  expect(stl.degenerateTriangles).toBe(0);
  expect(stl.min.z).toBeCloseTo(0, 3);
  expect(stl.size.x).toBeCloseTo(190.5, 1);
  expect(stl.size.y).toBeCloseTo(90.17, 1);
  expect(stl.size.z).toBeCloseTo(74.93, 1);

  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Workspace actions" }),
  ).toBeHidden();
  await assembledButton.click();
  await expect(assembledButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "assembled",
  );
  await expect(page.getByText("Exploded · 13 pieces")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("keeps the fabrication sheet usable in narrow center panes and on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 981, height: 1000 });
  await page.goto("/?model=hover-dining-table&unit=in");
  await page.getByRole("button", { name: "Cut list" }).click();

  const desktopContainment = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".hover-cut-sheet")!;
    const header = document
      .querySelector<HTMLElement>(".hover-cut-sheet-header")!
      .getBoundingClientRect();
    const metrics = document
      .querySelector<HTMLElement>(".hover-cut-sheet-header dl")!
      .getBoundingClientRect();
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(".hover-cut-card"),
    )
      .slice(0, 2)
      .map((card) => card.getBoundingClientRect());

    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      metricsRight: metrics.right,
      headerRight: header.right,
      firstCardX: cards[0].x,
      firstCardBottom: cards[0].bottom,
      secondCardX: cards[1].x,
      secondCardTop: cards[1].top,
    };
  });

  expect(desktopContainment.documentOverflow).toBeLessThanOrEqual(0);
  expect(desktopContainment.sheetOverflow).toBeLessThanOrEqual(0);
  expect(desktopContainment.metricsRight).toBeLessThanOrEqual(
    desktopContainment.headerRight + 1,
  );
  expect(desktopContainment.secondCardX).toBeCloseTo(
    desktopContainment.firstCardX,
    0,
  );
  expect(desktopContainment.secondCardTop).toBeGreaterThan(
    desktopContainment.firstCardBottom,
  );

  await page.setViewportSize({ width: 393, height: 852 });
  const mobileMeasurements = await page.evaluate(() => {
    const viewer = document
      .querySelector<HTMLElement>('.viewer[data-assembly-mode="cut-list"]')!
      .getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>(".hover-cut-sheet")!;
    const buttons = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[aria-label="X-Hover assembly view"] button',
      ),
    ).map((button) => button.getBoundingClientRect().height);
    const auditRows = Array.from(
      document.querySelectorAll<HTMLElement>(".audit-row"),
    ).map((row) => {
      const rowBounds = row.getBoundingClientRect();
      const valueBounds = row
        .querySelector<HTMLElement>("strong")!
        .getBoundingClientRect();
      return valueBounds.right - rowBounds.right;
    });

    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      viewerHeight: viewer.height,
      buttonHeights: buttons,
      auditOverflow: Math.max(...auditRows),
    };
  });

  expect(mobileMeasurements.documentOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.sheetOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.viewerHeight).toBeGreaterThanOrEqual(700);
  expect(Math.min(...mobileMeasurements.buttonHeights)).toBeGreaterThanOrEqual(
    44,
  );
  expect(mobileMeasurements.auditOverflow).toBeLessThanOrEqual(0);
});
