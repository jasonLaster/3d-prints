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

export function getCarbonFilterHolderSpec(p: ModelParams) {
  const channelWidth = p.filterWidth + 2 * p.sideClearance;
  const channelLength = p.filterLength + p.sideClearance;
  const channelHeight = p.filterThickness + p.thicknessClearance;
  const width = channelWidth + 2 * p.wallThickness;
  const length = channelLength + p.wallThickness;
  const roofZ = p.baseThickness + channelHeight;
  // The lip grows inward at 45 degrees, above the unobstructed slide envelope.
  const lipTopZ = roofZ + p.lipWidth;
  const height = lipTopZ + p.lipThickness;
  const overlap = p.lipWidth - p.sideClearance;
  const exposedWidth = p.filterWidth - 2 * overlap;
  return {
    width, length, height, channelWidth, channelLength, channelHeight,
    roofZ, lipTopZ, overlap, exposedWidth,
    exposedPercent: (100 * exposedWidth) / p.filterWidth,
    frontY: -length / 2,
    backY: length / 2,
    innerBackY: length / 2 - p.wallThickness,
    glueAreaMm2: width * length,
  };
}

type P2 = THREE.Vector2;

export function createCarbonFilterHolderGeometry(
  p: ModelParams,
  _model?: CarbonFilterHolderModelDefinition,
) {
  const s = getCarbonFilterHolderSpec(p);
  const outer = s.width / 2;
  const inner = s.channelWidth / 2;
  const point = (x: number, y: number) => new THREE.Vector2(x, y);
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
    point(-inner + inset, s.innerBackY), point(inner - inset, s.innerBackY),
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
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
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
    point(inner, s.innerBackY), point(-inner, s.innerBackY),
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
  // A nominal stand-in, slightly lifted off the backing. Withdrawal is along
  // the fully open front edge; neither this filter nor its position is exported.
  geometry.translate(
    0,
    s.frontY + p.filterLength / 2 - p.filterWithdrawal,
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
    new THREE.Vector3(-s.width / 2, s.frontY - (p.showFilter >= 0.5 ? p.filterWithdrawal : 0), 0),
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
  if (key === "filterWithdrawal") limits.max = p.filterLength;
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
      return item(`${s.exposedPercent.toFixed(1)}% exposed · two narrow side lips`, s.exposedPercent >= 75);
    case "retention":
      return item(`${f(s.overlap)} overlap per side · rear stop`, s.overlap >= m.geometry.minimumOverlap - 1e-6);
    case "openEntry":
      return item(`${f(s.channelWidth)} × ${f(s.channelHeight)} clear slide opening · no front bar`);
    case "glueFace":
      return item(`${f(s.width)} × ${f(s.length)} flat bonding face`);
    case "printOrientation":
      return item("Glue face on bed · 45° lip undersides · no supports",
        p.baseThickness >= 1.2 && p.wallThickness >= 1.6 && p.lipThickness >= 1.2);
    default:
      return item("Test the actual filter fit and lid adhesive; aim the opening away from gravity when the lid opens", false);
  }
}
