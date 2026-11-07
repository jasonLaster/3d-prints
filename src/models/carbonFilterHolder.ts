import * as THREE from "three";
import { formatLength } from "../units";
import { getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  CarbonFilterHolderModelDefinition,
  LengthUnit,
  ModelParams,
} from "./types";

const DETENT_FRONT_INSET = 0.8;
const DETENT_SEAT_GAP = 0.5;
const DETENT_SEGMENTS = 8;

export function getCarbonFilterHolderSpec(p: ModelParams) {
  const channelWidth = p.filterWidth + 2 * p.sideClearance;
  const frontPocketLength = DETENT_FRONT_INSET + p.detentLength + DETENT_SEAT_GAP;
  const channelLength = p.filterLength + p.sideClearance + frontPocketLength;
  const channelHeight = p.filterThickness + p.thicknessClearance;
  const width = channelWidth + 2 * p.wallThickness;
  const length = channelLength + p.wallThickness;
  const roofZ = p.baseThickness + channelHeight;
  // The lip grows inward at 45 degrees above the nominal filter channel.
  const lipTopZ = roofZ + p.lipWidth;
  const height = lipTopZ + p.lipThickness;
  const overlap = p.lipWidth - p.sideClearance;
  const exposedWidth = p.filterWidth - 2 * overlap;
  const exposedLength = p.filterLength - overlap;
  const frontY = -length / 2;
  const filterFrontY = frontY + frontPocketLength;
  const detentDepth = p.sideClearance + p.detentOverlap;
  return {
    width, length, height, channelWidth, channelLength, channelHeight,
    roofZ, lipTopZ, overlap, exposedWidth, exposedLength,
    exposedPercent: (100 * exposedWidth * exposedLength) / (p.filterWidth * p.filterLength),
    frontY, frontPocketLength, filterFrontY,
    filterRearY: filterFrontY + p.filterLength,
    detentStartY: frontY + DETENT_FRONT_INSET,
    detentEndY: frontY + DETENT_FRONT_INSET + p.detentLength,
    detentDepth,
    detentThroatWidth: channelWidth - 2 * detentDepth,
    detentOverlap: p.detentOverlap,
    detentSeatGap: DETENT_SEAT_GAP,
    backY: length / 2,
    innerBackY: length / 2 - p.wallThickness,
    glueAreaMm2: width * length,
  };
}

type P2 = THREE.Vector2;

// Rounded plan-profile bumps, integral with the two side walls. The filter
// must compress at its edges to pass them; these are not flexible latch arms.
export function getCarbonFilterDetentProfile(p: ModelParams) {
  const s = getCarbonFilterHolderSpec(p);
  return Array.from({ length: DETENT_SEGMENTS + 1 }, (_, i) => ({
    y: s.detentStartY + (i / DETENT_SEGMENTS) * p.detentLength,
    depth: i === 0 || i === DETENT_SEGMENTS
      ? 0
      : s.detentDepth * Math.sin((Math.PI * i) / DETENT_SEGMENTS) ** 2,
  }));
}

export function createCarbonFilterHolderGeometry(
  p: ModelParams,
  _model?: CarbonFilterHolderModelDefinition,
) {
  const s = getCarbonFilterHolderSpec(p);
  const outer = s.width / 2;
  const inner = s.channelWidth / 2;
  const point = (x: number, y: number) => new THREE.Vector2(x, y);
  const detent = getCarbonFilterDetentProfile(p);
  const leftDetent = (inset: number) => detent.map(({ y, depth }) =>
    point(-inner + inset + depth, y));
  const rightDetent = (inset: number) => detent.map(({ y, depth }) =>
    point(inner - inset - depth, y));
  // Shared collinear vertices keep the plate, floor and U-rail seam conforming.
  const plate = [
    point(-outer, s.frontY), point(-inner, s.frontY),
    point(inner, s.frontY), point(outer, s.frontY),
    point(outer, s.innerBackY), point(outer, s.backY),
    point(inner, s.backY), point(-inner, s.backY),
    point(-outer, s.backY), point(-outer, s.innerBackY),
  ];
  const rail = (inset: number) => [
    point(-outer, s.frontY), point(-inner + inset, s.frontY),
    ...leftDetent(inset),
    point(-inner + inset, s.innerBackY - inset), point(inner - inset, s.innerBackY - inset),
    ...rightDetent(inset).reverse(),
    point(inner - inset, s.frontY), point(outer, s.frontY),
    point(outer, s.innerBackY), point(outer, s.backY),
    point(inner, s.backY), point(-inner, s.backY),
    point(-outer, s.backY), point(-outer, s.innerBackY),
  ];
  const positions: number[] = [];
  const v = (p2: P2, z: number) => new THREE.Vector3(p2.x, p2.y, z);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());

  function face(contour: P2[], z: number, up: boolean) {
    // Earcut may discard collinear contour vertices. Split its boundary
    // triangles at those vertices instead of leaving mesh T-junctions.
    const emit = (a: P2, b: P2, c: P2) => {
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      // Symmetric bump samples can form an exactly straight edge. Ignore
      // zero-area ears before restoring the boundary vertices on real faces.
      if (Math.abs(normal) < 1e-8) return;
      const edges = [[a, b, c], [b, c, a], [c, a, b]];
      for (const [start, end, opposite] of edges) {
        const delta = end.clone().sub(start);
        const split = contour.find((candidate) => {
          const offset = candidate.clone().sub(start);
          const t = offset.dot(delta) / delta.lengthSq();
          return t > 1e-7 && t < 1 - 1e-7 &&
            Math.abs(delta.cross(offset)) < 1e-7;
        });
        if (split) {
          emit(start, split, opposite);
          emit(split, end, opposite);
          return;
        }
      }
      if ((normal > 0) === up) tri(v(a, z), v(b, z), v(c, z));
      else tri(v(a, z), v(c, z), v(b, z));
    };
    THREE.ShapeUtils.triangulateShape(contour, []).forEach(([a, b, c]) =>
      emit(contour[a], contour[b], contour[c]),
    );
  }
  function sides(lower: P2[], upper: P2[], lowZ: number, highZ: number) {
    lower.forEach((a, i) => {
      const j = (i + 1) % lower.length;
      tri(v(a, lowZ), v(lower[j], lowZ), v(upper[j], highZ));
      tri(v(a, lowZ), v(upper[j], highZ), v(upper[i], highZ));
    });
  }
  face(plate, 0, false);
  sides(plate, plate, 0, p.baseThickness);
  face([
    point(-inner, s.frontY), point(inner, s.frontY),
    ...rightDetent(0),
    point(inner, s.innerBackY), point(-inner, s.innerBackY),
    ...leftDetent(0).reverse(),
  ], p.baseThickness, true);
  sides(rail(0), rail(0), p.baseThickness, s.roofZ);
  sides(rail(0), rail(p.lipWidth), s.roofZ, s.lipTopZ);
  sides(rail(p.lipWidth), rail(p.lipWidth), s.lipTopZ, s.height);
  face(rail(p.lipWidth), s.height, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCarbonFilterPreviewGeometry(p: ModelParams) {
  if (p.showFilter < 0.5) return null;
  const s = getCarbonFilterHolderSpec(p);
  const geometry = new THREE.BoxGeometry(p.filterWidth, p.filterLength, p.filterThickness);
  // The nominal pad rests behind the detents. Withdrawal shows its undeformed
  // envelope, not the edge compression needed to pass the front bumps.
  geometry.translate(
    0,
    s.filterFrontY + p.filterLength / 2 - p.filterWithdrawal,
    p.baseThickness + p.thicknessClearance / 2 + p.filterThickness / 2,
  );
  geometry.computeBoundingBox();
  return geometry;
}

export function getCarbonFilterHolderDimensions(p: ModelParams) {
  const s = getCarbonFilterHolderSpec(p);
  return { length: s.width, width: s.length, height: s.height };
}

export function getCarbonFilterHolderViewBounds(p: ModelParams) {
  const s = getCarbonFilterHolderSpec(p);
  return new THREE.Box3(
    new THREE.Vector3(-s.width / 2, Math.min(s.frontY,
      s.filterFrontY - (p.showFilter >= 0.5 ? p.filterWithdrawal : 0)), 0),
    new THREE.Vector3(s.width / 2, s.backY, s.height),
  );
}

export function updateCarbonFilterHolderGuide(mesh: THREE.Mesh, p: ModelParams) {
  const s = getCarbonFilterHolderSpec(p);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(s.width, s.length, s.height);
  mesh.position.set(0, 0, s.height / 2);
}

export function getCarbonFilterHolderParameterLimits(
  m: CarbonFilterHolderModelDefinition,
  p: ModelParams,
  key: string,
) {
  const limits = { ...getParameter(m, key).limits };
  if (key === "lipWidth") {
    limits.min = Math.max(limits.min, p.sideClearance + m.geometry.minimumOverlap);
    limits.max = Math.min(limits.max, p.filterWidth * 0.12 + p.sideClearance);
  }
  if (key === "filterWithdrawal")
    limits.max = p.filterLength + getCarbonFilterHolderSpec(p).frontPocketLength;
  return limits;
}

export function getCarbonFilterHolderAuditValue(
  check: AuditCheckDefinition,
  p: ModelParams,
  unit: LengthUnit,
  m: CarbonFilterHolderModelDefinition,
): AuditItem {
  const s = getCarbonFilterHolderSpec(p);
  const f = (n: number) => formatLength(n, unit, 2);
  const item = (value: string, ok = true): AuditItem => ({
    label: check.label, value, status: ok ? "pass" : "warn",
  });
  switch (check.key) {
    case "filterFit":
      return item(`${f(p.filterWidth)} × ${f(p.filterLength)} × ${f(p.filterThickness)}`);
    case "slideClearance":
      return item(`${f(p.sideClearance)} per side · ${f(p.thicknessClearance)} thickness allowance`,
        p.sideClearance >= 0.2 && p.thicknessClearance >= 0.3);
    case "exposure":
      return item(`${s.exposedPercent.toFixed(1)}% exposed · side and rear lips`, s.exposedPercent >= 65);
    case "retention":
      return item(`${f(s.overlap)} overlap on both sides and rear`, s.overlap >= m.geometry.minimumOverlap - 1e-6);
    case "frontDetents":
      return item(`${f(s.detentOverlap)} edge engagement per side · ${f(s.detentSeatGap)} seated gap`,
        s.detentOverlap > 0 && s.detentThroatWidth > 0);
    case "openEntry":
      return item(`${f(s.detentThroatWidth)} between bumps · squeeze flexible pad edges past detents`);
    case "glueFace":
      return item(`${f(s.width)} × ${f(s.length)} flat bonding face`);
    case "printOrientation":
      return item("Glue face on bed · 45° lip undersides · no supports",
        p.baseThickness >= 1.2 && p.wallThickness >= 1.6 && p.lipThickness >= 1.2);
    default:
      return item("Test a flexible pad through the detents and check lid adhesion; preview does not simulate compression", false);
  }
}
