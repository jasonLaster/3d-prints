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
  getHoverDiningTableParameterLimits,
  getHoverDiningTablePieceCount,
  getHoverDiningTableSpec,
} from "../../src/models/hoverDiningTable";
import {
  createHoverDiningTableTemplateSegments,
  getHoverDiningTableTemplateSummary,
} from "../../src/models/hoverDiningTableTemplates";
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

function uniqueAxisCoordinates(
  geometry: THREE.BufferGeometry,
  axis: "x" | "y" | "z",
  precision = 5,
) {
  const position = geometry.getAttribute("position");
  const getter = axis === "x"
    ? (index: number) => position.getX(index)
    : axis === "y"
      ? (index: number) => position.getY(index)
      : (index: number) => position.getZ(index);
  return new Set(
    Array.from({ length: position.count }, (_, index) =>
      getter(index).toFixed(precision),
    ),
  ).size;
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
  expect(fullSize.upperBrace.width).toBe(fullSize.lowerBrace.width);
  expect(fullSize.upperBrace.thickness).toBe(fullSize.lowerBrace.thickness);
  expect(fullSize.upperBrace.endpointInset).toBe(
    fullSize.lowerBrace.endpointInset,
  );
  expect(fullSize.upperBrace.edgeRadius).toBe(fullSize.lowerBrace.edgeRadius);

  const largerTopRadius = getHoverDiningTableSpec({
    ...defaultParams,
    frameInnerTopCornerRadius:
      defaultParams.frameInnerTopCornerRadius + 12.7,
  }).fullSize;
  expect(largerTopRadius.upperBrace.endpointY).toBeLessThan(
    fullSize.upperBrace.endpointY,
  );
  expect(largerTopRadius.lowerBrace.endpointY).toBeCloseTo(
    fullSize.lowerBrace.endpointY,
    6,
  );
  expect(largerTopRadius.upperBrace.endpointOuterY).toBeCloseTo(
    largerTopRadius.upperBrace.cornerTangentY,
    6,
  );
  const largerBottomRadius = getHoverDiningTableSpec({
    ...defaultParams,
    frameInnerBottomCornerRadius:
      defaultParams.frameInnerBottomCornerRadius + 12.7,
  }).fullSize;
  expect(largerBottomRadius.lowerBrace.endpointY).toBeLessThan(
    fullSize.lowerBrace.endpointY,
  );
  expect(largerBottomRadius.upperBrace.endpointY).toBeCloseTo(
    fullSize.upperBrace.endpointY,
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

test("keeps widened parameter ranges inside the shared geometric contract", () => {
  const definitions = Object.fromEntries(
    model.parameters.map((parameter) => [parameter.key, parameter]),
  );
  expect(definitions.sideOverhang.limits.max).toBeGreaterThan(4 * 25.4);
  expect(definitions.endOverhang.limits.max).toBeGreaterThan(12 * 25.4);
  expect(definitions.frameBottomSpread.limits.min).toBeLessThan(-2 * 25.4);
  expect(definitions.topSupportWidth.limits.max).toBeGreaterThan(2 * 25.4);
  expect(definitions.bottomSupportWidth.limits.max).toBeGreaterThan(2 * 25.4);
  expect(definitions.topSupportThickness.limits.max).toBeGreaterThan(1.5 * 25.4);
  expect(definitions.bottomSupportThickness.limits.max).toBeGreaterThan(1.5 * 25.4);

  const expandedMembers = {
    ...defaultParams,
    frameSideWidth: 127,
    frameTopRailHeight: 63.5,
    frameBottomRailHeight: 63.5,
  };
  expect(
    getHoverDiningTableParameterLimits(
      model,
      expandedMembers,
      "topSupportWidth",
    ).max,
  ).toBeGreaterThan(2 * 25.4);
  expect(
    getHoverDiningTableParameterLimits(
      model,
      expandedMembers,
      "topSupportThickness",
    ).max,
  ).toBeGreaterThan(1.5 * 25.4);
  const expanded = getHoverDiningTableSpec({
    ...expandedMembers,
    topSupportWidth: 63.5,
    bottomSupportWidth: 76.2,
    topSupportThickness: 50.8,
    bottomSupportThickness: 44.45,
  }).fullSize;
  expect(expanded.upperBrace.width).toBeCloseTo(2.5 * 25.4, 6);
  expect(expanded.lowerBrace.width).toBeCloseTo(3 * 25.4, 6);
  expect(expanded.upperBrace.thickness).toBeCloseTo(2 * 25.4, 6);
  expect(expanded.lowerBrace.thickness).toBeCloseTo(1.75 * 25.4, 6);
});

test("atomically settles transient support-member and mating-box dimensions", () => {
  const transientParams = {
    ...defaultParams,
    frameSideWidth: 4 * 25.4,
    frameTopRailHeight: 1 * 25.4,
    frameBottomRailHeight: 1 * 25.4,
    topSupportWidth: 4 * 25.4,
    bottomSupportWidth: 3 * 25.4,
    topSupportThickness: 2 * 25.4,
    bottomSupportThickness: 1.5 * 25.4,
  };

  const spec = getHoverDiningTableSpec(transientParams).fullSize;
  expect(spec.frameSideWidth).toBeCloseTo(transientParams.frameSideWidth, 6);
  expect(spec.frameTopRailHeight).toBeCloseTo(
    transientParams.topSupportThickness,
    6,
  );
  expect(spec.frameBottomRailHeight).toBeCloseTo(
    transientParams.bottomSupportThickness,
    6,
  );

  const geometry = createHoverDiningTableGeometry(transientParams, model);
  const inspected = inspectGeometry(geometry);
  expect(inspected.finite).toBe(true);
  expect(inspected.degenerateTriangles).toBe(0);
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

  const horizontalBoxParts = parts.filter(
    (part) => part.category === "end-box-horizontal",
  );
  const verticalBoxParts = parts.filter(
    (part) => part.category === "end-box-vertical",
  );
  for (const part of horizontalBoxParts) {
    const profile = part.fabricationProfile;
    expect(profile.family, part.name).toBe("frame-rail");
    expect(
      profile.outline.filter((command) => command.kind === "cubic"),
      `${part.name} four shared curve segments`,
    ).toHaveLength(4);
    expect(
      profile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${part.name} square tangent seams`,
    ).toHaveLength(2);
    const top = part.name.includes("top");
    expect(profile.bezier?.outerRadius, part.name).toBeCloseTo(
      top
        ? spec.frameOuterTopCornerRadius
        : spec.frameOuterBottomCornerRadius,
      6,
    );
    expect(profile.bezier?.innerRadius, part.name).toBeCloseTo(
      top
        ? spec.frameInnerTopCornerRadius
        : spec.frameInnerBottomCornerRadius,
      6,
    );
    expect(profile.section.radius, part.name).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
    expect(uniqueAxisCoordinates(part.geometry, "x"), part.name).toBeGreaterThan(
      model.geometry.bevelSegments * 2,
    );
  }
  for (const part of verticalBoxParts) {
    const profile = part.fabricationProfile;
    expect(profile.family, part.name).toBe("frame-stile");
    expect(
      profile.outline.filter((command) => command.kind === "cubic"),
      `${part.name} derives splay without fake corner curves`,
    ).toHaveLength(0);
    expect(
      profile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${part.name} square rail seams`,
    ).toHaveLength(2);
    expect(profile.section.radius, part.name).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
    expect(uniqueAxisCoordinates(part.geometry, "x"), part.name).toBeGreaterThan(
      model.geometry.bevelSegments * 2,
    );
  }

  const tabletopProfile = parts.find(
    (part) => part.category === "tabletop",
  )!.fabricationProfile;
  expect(tabletopProfile.family).toBe("tabletop");
  expect(
    tabletopProfile.section.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(2);

  for (const [category, brace] of [
    ["upper-x", spec.upperBrace],
    ["floor-x", spec.lowerBrace],
  ] as const) {
    const members = parts.filter((part) => part.category === category);
    expect(members, category).toHaveLength(2);
    members.forEach((member, memberIndex) => {
      expect(member.fabricationProfile.family, member.name).toBe("brace");
      expect(member.fabricationProfile.section.radius, member.name).toBeCloseTo(
        brace.edgeRadius,
        6,
      );
      expect(
        member.fabricationProfile.section.outline.filter(
          (command) => command.kind === "cubic",
        ),
        `${member.name} rounded section`,
      ).toHaveLength(4);
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

test("derives assembled, exploded, and cut-list geometry for all six support layouts", () => {
  const variants = [
    { top: 0, bottom: 0, pieces: 13, lines: 8, topCategory: "upper-x", bottomCategory: "floor-x" },
    { top: 0, bottom: 1, pieces: 12, lines: 7, topCategory: "upper-x", bottomCategory: "floor-center-board" },
    { top: 0, bottom: 2, pieces: 11, lines: 6, topCategory: "upper-x", bottomCategory: null },
    { top: 1, bottom: 0, pieces: 13, lines: 7, topCategory: "upper-stretcher", bottomCategory: "floor-x" },
    { top: 1, bottom: 1, pieces: 12, lines: 6, topCategory: "upper-stretcher", bottomCategory: "floor-center-board" },
    { top: 1, bottom: 2, pieces: 11, lines: 5, topCategory: "upper-stretcher", bottomCategory: null },
  ] as const;

  for (const variant of variants) {
    const params = {
      ...defaultParams,
      topSupportStyle: variant.top,
      bottomSupportStyle: variant.bottom,
    };
    const { scaled: spec } = getHoverDiningTableSpec(params);
    expect(spec.topSupportStyle).toBe(variant.top === 0 ? "x" : "stretchers");
    expect(spec.bottomSupportStyle).toBe(
      variant.bottom === 0
        ? "x"
        : variant.bottom === 1
          ? "center-board"
          : "none",
    );
    expect(getHoverDiningTablePieceCount(params)).toBe(variant.pieces);

    const geometry = createHoverDiningTableGeometry(params, model);
    const inspected = inspectGeometry(geometry);
    expect(inspected.finite, `${variant.top}/${variant.bottom} assembled`).toBe(true);
    expect(inspected.degenerateTriangles).toBe(0);
    expect(inspected.min.z).toBeCloseTo(0, 5);
    expect(inspected.size.x).toBeCloseTo(spec.length, 4);
    expect(inspected.size.y).toBeCloseTo(spec.width, 4);
    expect(inspected.size.z).toBeCloseTo(spec.height, 4);
    geometry.dispose();

    const exploded = createHoverDiningTableExplodedParts(params, model);
    expect(exploded).toHaveLength(variant.pieces);
    expect(exploded.filter((part) => part.category === variant.topCategory)).toHaveLength(2);
    expect(exploded.filter((part) => part.category === "upper-x")).toHaveLength(
      variant.top === 0 ? 2 : 0,
    );
    expect(exploded.filter((part) => part.category === "upper-stretcher")).toHaveLength(
      variant.top === 1 ? 2 : 0,
    );
    expect(exploded.filter((part) => part.category === "floor-x")).toHaveLength(
      variant.bottom === 0 ? 2 : 0,
    );
    expect(
      exploded.filter((part) => part.category === "floor-center-board"),
    ).toHaveLength(variant.bottom === 1 ? 1 : 0);
    if (variant.bottomCategory) {
      for (const part of exploded.filter(
        (candidate) => candidate.category === variant.bottomCategory,
      )) {
        part.geometry.computeBoundingBox();
        expect(part.geometry.boundingBox!.min.z).toBeCloseTo(0, 5);
      }
    }
    for (const part of exploded.filter(
      (candidate) => candidate.category === variant.topCategory,
    )) {
      part.geometry.computeBoundingBox();
      expect(part.geometry.boundingBox!.max.z).toBeCloseTo(spec.topBottom, 5);
    }

    const cutList = getHoverDiningTableCutList(params);
    expect(cutList.totalPieces).toBe(variant.pieces);
    expect(cutList.parts).toHaveLength(variant.lines);
    expect(cutList.parts.filter((part) => part.lap)).toHaveLength(
      (variant.top === 0 ? 2 : 0) + (variant.bottom === 0 ? 2 : 0),
    );
    expect(cutList.parts.filter((part) => part.kind === "support")).toHaveLength(
      (variant.top === 1 ? 1 : 0) + (variant.bottom === 1 ? 1 : 0),
    );
    exploded.forEach((part) => part.geometry.dispose());
  }

  const originalStretchers = getHoverDiningTableSpec({
    ...defaultParams,
    topSupportStyle: 1,
  }).fullSize.upperStretchers;
  expect(originalStretchers.centerYs[0]).toBeCloseTo(
    -originalStretchers.centerYs[1],
    6,
  );
  expect(
    Math.abs(originalStretchers.centerYs[0]) +
      originalStretchers.width / 2 +
      originalStretchers.endpointInset,
  ).toBeCloseTo(originalStretchers.placementBoundaryY!, 6);
});

test("derives a full-size finished cut schedule for all 13 pieces", () => {
  const cutList = getHoverDiningTableCutList(defaultParams);
  const { fullSize: spec } = getHoverDiningTableSpec(defaultParams);
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
  expect(tabletop.fabricationProfile.family).toBe("tabletop");
  expect(
    tabletop.fabricationProfile.section.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(2);
  expect(tabletop.fabricationProfile.section.radius).toBeCloseTo(
    spec.topEdgeRoll,
    6,
  );

  for (const id of ["B1", "B2"] as const) {
    const rail = cutList.parts.find((part) => part.id === id)!;
    expect(rail.fabricationProfile.family, id).toBe("frame-rail");
    expect(
      rail.fabricationProfile.outline.filter(
        (command) => command.kind === "cubic",
      ),
      `${id} exact routed returns`,
    ).toHaveLength(4);
    expect(
      rail.fabricationProfile.outline.filter(
        (command) =>
          command.kind !== "move" && command.edgeTreatment === "square",
      ),
      `${id} square glue seams`,
    ).toHaveLength(2);
    const top = id === "B1";
    expect(rail.fabricationProfile.bezier).toEqual({
      outerRadius: top
        ? spec.frameOuterTopCornerRadius
        : spec.frameOuterBottomCornerRadius,
      innerRadius: top
        ? spec.frameInnerTopCornerRadius
        : spec.frameInnerBottomCornerRadius,
      outerTension: spec.frameOuterCurveTension,
      innerTension: spec.frameInnerCurveTension,
    });
    expect(rail.fabricationProfile.section.radius).toBeCloseTo(
      spec.frameEdgeRoundover,
      6,
    );
  }
  const topRail = cutList.parts.find((part) => part.id === "B1")!;
  const bottomRail = cutList.parts.find((part) => part.id === "B2")!;
  expect(topRail.width).toBeGreaterThan(spec.frameTopRailHeight);
  expect(bottomRail.width).toBeGreaterThan(spec.frameBottomRailHeight);

  const stile = cutList.parts.find((part) => part.id === "B3")!;
  expect(stile.fabricationProfile.family).toBe("frame-stile");
  expect(
    stile.fabricationProfile.outline.filter(
      (command) => command.kind === "cubic",
    ),
  ).toHaveLength(0);
  expect(
    stile.fabricationProfile.outline.filter(
      (command) =>
        command.kind !== "move" && command.edgeTreatment === "square",
    ),
  ).toHaveLength(2);
  expect(stile.fabricationProfile.section.radius).toBeCloseTo(
    spec.frameEdgeRoundover,
    6,
  );
  const upperMembers = cutList.parts.filter((part) => part.assembly === "upper X");
  expect(upperMembers).toHaveLength(2);
  expect(upperMembers.map((part) => part.lap?.face)).toEqual(["top", "bottom"]);
  for (const part of cutList.parts) {
    expect(part.quantity, part.id).toBeGreaterThan(0);
    expect(part.length, part.id).toBeGreaterThan(0);
    expect(part.width, part.id).toBeGreaterThan(0);
    expect(part.thickness, part.id).toBeGreaterThan(0);
    expect(
      part.fabricationProfile.bounds.maxX -
        part.fabricationProfile.bounds.minX,
      `${part.id} profile width`,
    ).toBeGreaterThan(0);
    expect(
      part.fabricationProfile.bounds.maxY -
        part.fabricationProfile.bounds.minY,
      `${part.id} profile height`,
    ).toBeGreaterThan(0);
    expect(
      part.fabricationProfile.section.outline.some(
        (command) => command.kind === "cubic",
      ),
      `${part.id} edge-treatment section`,
    ).toBe(true);
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

  const changedCurves = getHoverDiningTableCutList({
    ...defaultParams,
    frameInnerTopCornerRadius:
      defaultParams.frameInnerTopCornerRadius + 12.7,
    frameInnerCurveTension: 0.64,
  });
  const changedTopRail = changedCurves.parts.find((part) => part.id === "B1")!;
  expect(changedTopRail.width).toBeGreaterThan(topRail.width);
  expect(changedTopRail.fabricationProfile.outline).not.toEqual(
    topRail.fabricationProfile.outline,
  );
  expect(changedTopRail.fabricationProfile.bezier?.innerRadius).toBeCloseTo(
    spec.frameInnerTopCornerRadius + 12.7,
    6,
  );
  expect(changedTopRail.fabricationProfile.bezier?.innerTension).toBe(0.64);

  const changedBottomRadii = getHoverDiningTableCutList({
    ...defaultParams,
    frameOuterBottomCornerRadius:
      defaultParams.frameOuterBottomCornerRadius + 6.35,
    frameInnerBottomCornerRadius:
      defaultParams.frameInnerBottomCornerRadius + 6.35,
  });
  const radiusChangedTop = changedBottomRadii.parts.find(
    (part) => part.id === "B1",
  )!;
  const radiusChangedBottom = changedBottomRadii.parts.find(
    (part) => part.id === "B2",
  )!;
  expect(radiusChangedTop.fabricationProfile.outline).toEqual(
    topRail.fabricationProfile.outline,
  );
  expect(radiusChangedBottom.fabricationProfile.outline).not.toEqual(
    bottomRail.fabricationProfile.outline,
  );
});

test("builds two full-size routing templates as plate-safe dovetailed STLs", () => {
  const summary = getHoverDiningTableTemplateSummary(defaultParams, model);
  expect(summary.thickness).toBeCloseTo(3.175, 6);
  expect(summary.plateLength).toBeCloseTo(228.6, 6);
  expect(summary.dovetailDepth).toBeCloseTo(12.7, 6);
  expect(summary.jointClearance).toBeCloseTo(0.2, 6);
  expect(summary.templates.map((template) => template.kind)).toEqual([
    "top-rail",
    "vertical-stile",
  ]);
  expect(summary.templates.every((template) => template.segmentCount >= 2)).toBe(true);

  const segments = createHoverDiningTableTemplateSegments(
    defaultParams,
    model,
  );
  expect(segments).toHaveLength(summary.totalSegments);
  expect(new Set(segments.map((segment) => segment.fileName)).size).toBe(
    segments.length,
  );
  for (const kind of ["top-rail", "vertical-stile"] as const) {
    const family = segments.filter((segment) => segment.template === kind);
    expect(family).toHaveLength(
      summary.templates.find((template) => template.kind === kind)!.segmentCount,
    );
    family.forEach((segment, index) => {
      expect(segment.index).toBe(index);
      expect(segment.count).toBe(family.length);
      expect(segment.jointStart).toBe(index === 0 ? "none" : "female");
      expect(segment.jointEnd).toBe(
        index === family.length - 1 ? "none" : "male",
      );
      expect(segment.fileName).toContain(`${kind}-template-part-`);
      const inspected = inspectGeometry(segment.geometry);
      expect(inspected.finite, segment.fileName).toBe(true);
      expect(inspected.degenerateTriangles, segment.fileName).toBe(0);
      expect(inspected.min.x, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.min.y, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.min.z, segment.fileName).toBeCloseTo(0, 5);
      expect(inspected.size.x, segment.fileName).toBeLessThanOrEqual(
        summary.plateLength + 1e-4,
      );
      expect(inspected.size.y, segment.fileName).toBeLessThanOrEqual(
        summary.plateLength + 1e-4,
      );
      expect(inspected.size.z, segment.fileName).toBeCloseTo(
        summary.thickness,
        5,
      );
      expect(segment.assemblyOffset.toArray().every(Number.isFinite)).toBe(true);
      segment.geometry.dispose();
    });
  }

  const preview = createHoverDiningTableTemplateSegments(
    defaultParams,
    model,
    defaultParams.mockScale,
  );
  expect(preview).toHaveLength(summary.totalSegments);
  preview.forEach((segment) => {
    const inspected = inspectGeometry(segment.geometry);
    expect(inspected.size.z).toBeCloseTo(
      summary.thickness / defaultParams.mockScale,
      5,
    );
    segment.geometry.dispose();
  });

  const smallerPlate = getHoverDiningTableTemplateSummary(
    { ...defaultParams, templatePlateLength: 177.8 },
    model,
  );
  expect(smallerPlate.totalSegments).toBeGreaterThan(summary.totalSegments);

  const splayedSegments = createHoverDiningTableTemplateSegments(
    {
      ...defaultParams,
      tableWidth: 40 * 25.4,
      overallHeight: 30 * 25.4,
      topThickness: 1.5 * 25.4,
      sideOverhang: 3 * 25.4,
      frameDepth: 2 * 25.4,
      frameSideWidth: 2.5 * 25.4,
      frameBottomRailHeight: 1.5 * 25.4,
      frameTopRailHeight: 1.5 * 25.4,
      frameBottomSpread: -2 * 25.4,
    },
    model,
  );
  expect(splayedSegments.length).toBeGreaterThanOrEqual(4);
  splayedSegments.forEach((segment) => {
    const inspected = inspectGeometry(segment.geometry);
    expect(inspected.finite, segment.fileName).toBe(true);
    expect(inspected.degenerateTriangles, segment.fileName).toBe(0);
    expect(inspected.size.x, segment.fileName).toBeLessThanOrEqual(
      summary.plateLength + 1e-4,
    );
    expect(inspected.size.y, segment.fileName).toBeLessThanOrEqual(
      summary.plateLength + 1e-4,
    );
    segment.geometry.dispose();
  });
});

test("renders, manipulates, and exports the oak X-Hover table", async ({
  page,
}) => {
  test.setTimeout(90_000);
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
  await expect(page.getByLabel("End-box inner top radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box inner bottom radius in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Top support thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Bottom support thickness in inches")).toHaveValue("1 1/4");
  await expect(page.getByLabel("Top support top/bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Bottom support top/bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(page.getByLabel("Top support style")).toContainText("Cross bars (X)");
  await expect(page.getByLabel("Bottom support style")).toContainText("Cross bars (X)");
  await expect(page.getByLabel("Routing-template thickness in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Usable square print-plate span in inches")).toHaveValue("9");
  await expect(page.getByLabel("Template dovetail depth in inches")).toHaveValue("1/2");
  await expect(page.getByLabel("Template dovetail fit clearance in inches")).toHaveValue("0.008");
  await expect(page.getByLabel("Tabletop hover gap in inches")).toHaveCount(0);
  await expect(page.getByLabel("Lengthwise stretcher height in inches")).toHaveCount(0);
  const parameterGroups = page.locator(".parameter-group h3");
  await expect(parameterGroups).toHaveText([
    "Overall",
    "Tabletop",
    "End boxes",
    "Support layout",
    "Top support members",
    "Bottom support members",
    "Support joinery",
    "Routing templates",
  ]);
  await expect(
    page.getByText("Dimensions for the selected top X or stretcher members."),
  ).toBeVisible();
  const xGroupHeading = await page
    .getByRole("region", { name: "Top support members" })
    .getByRole("heading", { name: "Top support members" })
    .boundingBox();
  const xGroupNote = await page
    .getByText("Dimensions for the selected top X or stretcher members.")
    .boundingBox();
  expect(xGroupHeading).not.toBeNull();
  expect(xGroupNote).not.toBeNull();
  expect(xGroupNote!.y).toBeGreaterThanOrEqual(
    xGroupHeading!.y + xGroupHeading!.height + 3,
  );
  expect(xGroupNote!.x).toBeCloseTo(xGroupHeading!.x, 0);
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
  const templatesButton = page.getByRole("button", { name: "Templates" });
  await expect(assembledButton).toHaveAttribute("aria-pressed", "true");
  await expect(explodedButton).toHaveAttribute("aria-pressed", "false");
  await expect(cutListButton).toHaveAttribute("aria-pressed", "false");
  await expect(templatesButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "assembled",
  );
  await expect(
    page.getByText(/inspect the plate-split rail and stile routing templates/),
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
  await expect(
    page.getByText(/top supports Z 28 1\/4 in · floor supports Z 0 in · zero support gaps/),
  ).toBeVisible();
  await expect(page.getByText(/8 box-parallel bearing faces/)).toBeVisible();
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(15);

  await page.getByLabel("Table width in inches").fill("36");
  await expect(page.getByText("2 × 32 1/2 in wide closed boxes")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("1");
  await expect(page.getByText("+1 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box bottom spread in inches").fill("-1/2");
  await expect(page.getByText("-1/2 in bottom spread")).toBeVisible();
  await page.getByLabel("End-box inner top radius in inches").fill("3");
  await expect(page).toHaveURL(/frameInnerTopCornerRadius=3/);
  await page.getByLabel("End-box inner bottom radius in inches").fill("2 3/4");
  await expect(page).toHaveURL(/frameInnerBottomCornerRadius=2\.748/);
  await expect(page.getByText(/8 box-parallel bearing faces/)).toBeVisible();
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "exploded",
  );
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBeforeExplosion!,
  );
  await page.getByLabel("End-box side width in inches").fill("3 1/2");
  await expect(page).toHaveURL(/frameSideWidth=3.5/);
  await page.getByLabel("Top support width in inches").fill("3");
  await expect(page).toHaveURL(/topSupportWidth=3/);
  await expect(page.getByLabel("End-box side width in inches")).toHaveValue(
    "3 1/2",
  );
  await page.getByLabel("Bottom support width in inches").fill("2 1/2");
  await expect(page).toHaveURL(/bottomSupportWidth=2\.5/);
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("3");
  await page.getByLabel("Top support width in inches").fill("2 1/8");
  await expect(page).toHaveURL(/topSupportWidth=2\.126/);
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2 1/2");
  await expect(page.getByLabel("Upper-X brace width in inches")).toHaveCount(0);
  await expect(page.getByLabel("Floor-X brace width in inches")).toHaveCount(0);
  await page.getByLabel("Top support thickness in inches").fill("2");
  await expect(page).toHaveURL(/topSupportThickness=2/);
  await expect(page.getByLabel("End-box top rail height in inches")).toHaveValue("2");
  await expect(page.getByLabel("End-box bottom rail height in inches")).toHaveValue("1 3/4");
  await page.getByLabel("Half-lap fit clearance in inches").fill("1/32");
  await expect(page).toHaveURL(/halfLapClearance=0\.0315/);
  await page
    .getByLabel("Inner corner curve tension Bézier tension")
    .fill("0.65");
  await expect(page).toHaveURL(/frameInnerCurveTension=0\.65/);
  await expect(page.locator(".audit-row .status-dot.pass")).toHaveCount(15);

  await page.getByRole("button", { name: "Reset parameters" }).click();
  await expect(page.getByLabel("Table width in inches")).toHaveValue("35 1/2");
  await expect(page.getByLabel("End-box bottom spread in inches")).toHaveValue("0");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("2");
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveValue("0");
  await expect(
    page.getByLabel("Inner corner curve tension Bézier tension"),
  ).toHaveValue("0.580");
  await templatesButton.click();
  await expect(templatesButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer")).toHaveAttribute(
    "data-assembly-mode",
    "templates",
  );
  await expect(
    page.getByText("Routing templates · 2 profiles · segmented STLs"),
  ).toBeVisible();
  const templateDownloads: string[] = [];
  page.on("download", (download) => {
    if (download.suggestedFilename().includes("-template-part-")) {
      templateDownloads.push(download.suggestedFilename());
    }
  });
  await page.getByRole("button", { name: "Workspace actions" }).click();
  await page
    .getByRole("button", { name: "Export routing-template STL set" })
    .click();
  const defaultTemplateSummary = getHoverDiningTableTemplateSummary(
    defaultParams,
    model,
  );
  await expect.poll(() => templateDownloads.length).toBe(
    defaultTemplateSummary.totalSegments,
  );
  expect(new Set(templateDownloads).size).toBe(templateDownloads.length);
  expect(templateDownloads.some((name) => name.includes("top-rail"))).toBe(true);
  expect(templateDownloads.some((name) => name.includes("vertical-stile"))).toBe(true);
  await page.keyboard.press("Escape");
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
  await expect(page.locator(".cut-part-section > path")).toHaveCount(8);
  await expect(
    page.locator('.cut-part-section[data-section-kind="half-lap"]'),
  ).toHaveCount(4);
  await expect(page.locator(".cut-part-section-pocket")).toHaveCount(4);
  await expect(
    page.locator('[data-profile-family="frame-rail"]'),
  ).toHaveCount(2);
  await expect(
    page.locator('[data-profile-family="frame-stile"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-profile-family="brace"]'),
  ).toHaveCount(4);
  await expect(
    page.locator('.hover-cut-card[data-part-id="B1"] [data-profile-family="frame-rail"]'),
  ).toHaveAttribute("d", /C/);
  await expect(
    page.locator('.hover-cut-card[data-part-id="B2"] [data-profile-family="frame-rail"]'),
  ).toHaveAttribute("d", /C/);
  await expect(page.locator('.hover-cut-card[data-part-id="B1"]')).toContainText(
    "true routed rail profile",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="B3"]')).toContainText(
    "true splayed stile profile",
  );
  await expect(
    page.locator('.hover-cut-card[data-part-id="B3"]'),
  ).toHaveAttribute("data-grain-axis", "vertical");
  await expect(
    page.locator('.hover-cut-card[data-part-id="B3"]'),
  ).toHaveAttribute("data-length-axis", "vertical");
  await expect(
    page.locator('.hover-cut-card[data-part-id="B1"]'),
  ).toHaveAttribute("data-grain-axis", "horizontal");
  await expect(page.locator('.hover-cut-card[data-part-id="T1"]')).toContainText(
    "Bézier long-edge roll",
  );
  await expect(page.locator('.hover-cut-card[data-part-id="U1"]')).toContainText(
    "top/bottom long-edge round-over",
  );
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

test("switches support layouts associatively across viewer, exploded mode, cut list, URL, and reload", async ({
  page,
}) => {
  await page.goto("/?model=hover-dining-table&unit=in");
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const orientationBefore = await page
    .locator(".orientation-cube")
    .getAttribute("style");

  await page.getByLabel("Top support style").click();
  await page.getByRole("option", { name: "Original stretchers" }).click();
  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: "Single center board" }).click();
  await expect(page).toHaveURL(/topSupportStyle=1/);
  await expect(page).toHaveURL(/bottomSupportStyle=1/);
  await expect(page.getByLabel("Half-lap fit clearance in inches")).toHaveCount(0);
  await expect(page.getByText(/2 original lengthwise stretchers/)).toBeVisible();
  await expect(page.getByText(/1 centered lengthwise board/)).toBeVisible();
  await expect(page.getByText(/6 box-parallel bearing faces/)).toBeVisible();
  await expect(page.getByText("Not required by the selected straight-support layouts")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByText("Exploded · 12 pieces")).toBeVisible();
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Cut list" }).click();
  await expect(page.getByText("Cut list · full-size · 12 pieces")).toBeVisible();
  await expect(page.locator(".hover-cut-table tbody tr")).toHaveCount(6);
  await expect(page.locator('[data-profile-family="support"]')).toHaveCount(2);
  await expect(
    page.locator('.cut-part-section[data-section-kind="half-lap"]'),
  ).toHaveCount(0);
  await expect(page.getByText("Upper lengthwise stretcher").first()).toBeVisible();
  await expect(page.getByText("Floor center board").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Top support style")).toContainText(
    "Original stretchers",
  );
  await expect(page.getByLabel("Bottom support style")).toContainText(
    "Single center board",
  );

  await page.getByLabel("Bottom support style").click();
  await page.getByRole("option", { name: "None" }).click();
  await page.getByRole("button", { name: "Exploded" }).click();
  await expect(page.getByText("Exploded · 11 pieces")).toBeVisible();
  await expect(page.getByText(/None · end boxes remain unconnected/)).toBeVisible();
});

test("migrates legacy split-brace and shared-radius links to canonical parameters", async ({
  page,
}) => {
  await page.goto(
    "/?model=hover-dining-table&unit=in&frameTopRailHeight=1.5&frameBottomRailHeight=1.5&frameSideWidth=2.5&frameInnerCornerRadius=3&frameOuterCornerRadius=1&upperBraceWidth=1.75&lowerBraceWidth=2.25&upperBraceThickness=1&lowerBraceThickness=1.5&upperBraceEdgeRadius=0.125&lowerBraceEdgeRadius=0.25",
  );
  await expect(page.getByLabel("End-box inner top radius in inches")).toHaveValue("3");
  await expect(page.getByLabel("End-box inner bottom radius in inches")).toHaveValue("3");
  await expect(page.getByLabel("End-box outer top radius in inches")).toHaveValue("1");
  await expect(page.getByLabel("End-box outer bottom radius in inches")).toHaveValue("1");
  await expect(page.getByLabel("Top support width in inches")).toHaveValue("1 3/4");
  await expect(page.getByLabel("Bottom support width in inches")).toHaveValue("2 1/4");
  await expect(page.getByLabel("Top support thickness in inches")).toHaveValue("1");
  await expect(page.getByLabel("Bottom support thickness in inches")).toHaveValue("1 1/2");
  await expect(page.getByLabel("Top support top/bottom round-over in inches")).toHaveValue("1/8");
  await expect(page.getByLabel("Bottom support top/bottom round-over in inches")).toHaveValue("1/4");
  await expect(page).toHaveURL(/topSupportWidth=1\.75/);
  await expect(page).toHaveURL(/bottomSupportWidth=2\.25/);
  await expect(page).toHaveURL(/topSupportThickness=1/);
  await expect(page).toHaveURL(/bottomSupportThickness=1\.5/);
  await expect(page).toHaveURL(/frameInnerTopCornerRadius=3/);
  await expect(page).not.toHaveURL(/lowerBraceWidth=/);
  await expect(page).not.toHaveURL(/frameInnerCornerRadius=/);
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
  const mobileViewer = page.locator('.viewer[data-assembly-mode="cut-list"]');
  await expect(mobileViewer).toBeVisible();
  await expect(page.locator('.hover-cut-sheet')).toBeVisible();
  const mobileMeasurements = await mobileViewer.evaluate((viewerElement) => {
    const viewer = viewerElement.getBoundingClientRect();
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
    const xGroup = document.querySelector<HTMLElement>(
      '.parameter-group[aria-labelledby="parameter-group-top-support-members"]',
    )!;
    const xHeading = xGroup.querySelector("h3")!.getBoundingClientRect();
    const xNote = xGroup.querySelector("p")!.getBoundingClientRect();

    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
      viewerHeight: viewer.height,
      buttonHeights: buttons,
      auditOverflow: Math.max(...auditRows),
      xHeadingLeft: xHeading.left,
      xHeadingBottom: xHeading.bottom,
      xNoteLeft: xNote.left,
      xNoteTop: xNote.top,
    };
  });

  expect(mobileMeasurements.documentOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.sheetOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.viewerHeight).toBeGreaterThanOrEqual(700);
  expect(Math.min(...mobileMeasurements.buttonHeights)).toBeGreaterThanOrEqual(
    44,
  );
  expect(mobileMeasurements.auditOverflow).toBeLessThanOrEqual(0);
  expect(mobileMeasurements.xNoteTop).toBeGreaterThanOrEqual(
    mobileMeasurements.xHeadingBottom + 3,
  );
  expect(mobileMeasurements.xNoteLeft).toBeCloseTo(
    mobileMeasurements.xHeadingLeft,
    0,
  );
});
