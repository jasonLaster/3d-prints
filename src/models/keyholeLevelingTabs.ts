import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  KeyholeTabsModelDefinition,
  LengthUnit,
  ModelParams,
} from "./types";

export const KEYHOLE_FRACTIONS = [
  "1/32",
  "1/16",
  "3/32",
  "1/8",
  "5/32",
  "3/16",
  "7/32",
  "1/4",
];
export const keyholeVariantName = (n: number) =>
  `tab_${String(n).padStart(2, "0")}_${KEYHOLE_FRACTIONS[n - 1].replace("/", "-")}.stl`;

export function getKeyholeTabsSpec(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  const variant = Math.max(1, Math.min(8, Math.round(p.variant)));
  const offset = variant * m.geometry.incrementMm;
  const padBottom = -offset - m.geometry.edgeMargin;
  const legWidth = p.legWidth;
  const tipWidth = legWidth - 2 * m.geometry.rootRadius;
  const slotRoofRadius = p.keyholeSlotWidth / 2;
  const halfWidth = legWidth / 2;
  const maximumCrownRise = offset - m.geometry.minimumLegEdgeHeight;
  // A very wide, shallow input needs a flatter arc to remain a valid solid.
  // The fit assertion exposes that mismatch with the actual slot roof.
  const minimumCrownRadius =
    maximumCrownRise >= halfWidth
      ? halfWidth
      : (halfWidth ** 2 + maximumCrownRise ** 2) / (2 * maximumCrownRise);
  const crownRadius = Math.max(
    slotRoofRadius,
    halfWidth + 1e-6,
    minimumCrownRadius,
  );
  const crownEdgeY =
    -crownRadius + Math.sqrt(crownRadius ** 2 - halfWidth ** 2);
  const edgeHeight = offset + crownEdgeY;
  const screwCenterY = -offset - p.screwShankDiameter / 2;
  const neckEndY =
    -p.openingCenterDrop +
    Math.sqrt(
      Math.max(
        0,
        (p.wideOpeningDiameter / 2) ** 2 - (p.keyholeSlotWidth / 2) ** 2,
      ),
    );
  return {
    variant,
    offset,
    bumpCount: variant,
    legContactOffset: -offset,
    padBottom,
    padTop: padBottom + p.padHeight,
    legWidth,
    tipWidth,
    slotRoofRadius,
    crownRadius,
    crownEdgeY,
    edgeHeight,
    legTop: 0,
    legBottom: -offset,
    legMinZ: -p.legDepth,
    padMinZ: p.tapeThickness,
    padMaxZ: p.tapeThickness + p.padThickness,
    screwCenterY,
    originalScrewCenterY: -p.screwShankDiameter / 2,
    lift: -p.screwShankDiameter / 2 - screwCenterY,
    slotClearance: p.keyholeSlotWidth - legWidth,
    shankClearance: p.keyholeSlotWidth - p.screwShankDiameter,
    headOpeningClearance: p.wideOpeningDiameter - p.screwHeadDiameter,
    headPadClearance:
      padBottom - (-p.openingCenterDrop + p.screwHeadDiameter / 2),
    headLegClearance:
      -offset - (-p.openingCenterDrop + p.screwHeadDiameter / 2),
    neckSeatClearance: screwCenterY - p.screwShankDiameter / 2 - neckEndY,
    legHeadClearance: p.rimThickness + p.clearance / 2 - p.legDepth,
    recessHeadClearance:
      p.keyholeDepth - p.rimThickness - p.clearance / 2 - p.screwHeadThickness,
    wallClearance:
      p.wallGap - (p.tapeThickness + p.padThickness + p.bumpHeight),
    bearingWidth: Math.min(tipWidth, p.screwShankDiameter),
    plateWidth: 4 * p.padWidth + 3 * m.geometry.plateGap,
    plateDepth:
      2 * (p.legDepth + p.tapeThickness + p.padThickness + p.bumpHeight) +
      m.geometry.plateGap,
  };
}

type P2 = THREE.Vector2;
function roundedRectangle(
  width: number,
  bottom: number,
  height: number,
  radius: number,
): P2[] {
  const r = Math.min(radius, width / 3, height / 3);
  const centers = [
    [width / 2 - r, bottom + r],
    [width / 2 - r, bottom + height - r],
    [-width / 2 + r, bottom + height - r],
    [-width / 2 + r, bottom + r],
  ];
  return centers.flatMap(([x, y], corner) =>
    Array.from({ length: 7 }, (_, i) => {
      const angle =
        -Math.PI / 2 + (corner * Math.PI) / 2 + ((i / 6) * Math.PI) / 2;
      return new THREE.Vector2(
        x + r * Math.cos(angle),
        y + r * Math.sin(angle),
      );
    }),
  );
}
function circle(x: number, y: number, r: number, count: number): P2[] {
  return Array.from(
    { length: count },
    (_, i) =>
      new THREE.Vector2(
        x + r * Math.cos((i / count) * Math.PI * 2),
        y + r * Math.sin((i / count) * Math.PI * 2),
      ),
  );
}

// Circular crown follows the rounded slot roof, with a flat screw-contact edge.
// Every fillet section shares this circle; the apex remains Y=0.
export function getKeyholeLegProfile(
  width: number,
  offset: number,
  crownRadius: number,
): P2[] {
  const halfWidth = width / 2;
  const bottomRadius = Math.min(0.12, offset / 5);
  const bottom = -offset;
  const rightCorner = Array.from({ length: 7 }, (_, i) => {
    const angle = -Math.PI / 2 + ((i / 6) * Math.PI) / 2;
    return new THREE.Vector2(
      halfWidth - bottomRadius + bottomRadius * Math.cos(angle),
      bottom + bottomRadius + bottomRadius * Math.sin(angle),
    );
  });
  const startAngle = Math.acos(halfWidth / crownRadius);
  const crown = Array.from({ length: 33 }, (_, i) => {
    const angle = startAngle + (i / 32) * (Math.PI - 2 * startAngle);
    return new THREE.Vector2(
      crownRadius * Math.cos(angle),
      -crownRadius + crownRadius * Math.sin(angle),
    );
  });
  const leftCorner = Array.from({ length: 7 }, (_, i) => {
    const angle = Math.PI + ((i / 6) * Math.PI) / 2;
    return new THREE.Vector2(
      -halfWidth + bottomRadius + bottomRadius * Math.cos(angle),
      bottom + bottomRadius + bottomRadius * Math.sin(angle),
    );
  });
  return [...rightCorner, ...crown, ...leftCorner];
}

// Stitch the pad, root, leg and bump surfaces into ONE shell. No overlapping solids.
export function createKeyholeTabCanonicalGeometry(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  const s = getKeyholeTabsSpec(p, m);
  const positions: number[] = [];
  const v = (a: P2, z: number) => new THREE.Vector3(a.x, a.y, z);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  function face(outline: P2[], holes: P2[][], z: number, up: boolean) {
    const points = [...outline, ...holes.flat()];
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outline, holes)) {
      const aa = v(points[a], z),
        bb = v(points[b], z),
        cc = v(points[c], z);
      const normal = bb.clone().sub(aa).cross(cc.clone().sub(aa)).z;
      if (normal > 0 === up) tri(aa, bb, cc);
      else tri(aa, cc, bb);
    }
  }
  function ring(lower: P2[], upper: P2[], lowZ: number, highZ: number) {
    lower.forEach((point, i) => {
      const j = (i + 1) % lower.length;
      tri(v(point, lowZ), v(lower[j], lowZ), v(upper[j], highZ));
      tri(v(point, lowZ), v(upper[j], highZ), v(upper[i], highZ));
    });
  }
  const pad = roundedRectangle(
    p.padWidth,
    s.padBottom,
    p.padHeight,
    m.geometry.padCornerRadius,
  );
  const leg = (width: number) =>
    getKeyholeLegProfile(width, s.offset, s.crownRadius);
  const root = leg(s.legWidth);
  const centers = Array.from({ length: s.bumpCount }, (_, i) => ({
    x: ((i % 4) - 1.5) * 1.6,
    y: s.padBottom + p.padHeight / 2 + (Math.floor(i / 4) - 0.5) * 1.6,
  }));
  const bumps = centers.map(({ x, y }) =>
    circle(x, y, p.bumpDiameter / 2, m.geometry.radialSegments),
  );
  face(pad, [root], s.padMinZ, false);
  ring(pad, pad, s.padMinZ, s.padMaxZ);
  face(pad, bumps, s.padMaxZ, true);
  // A concave 0.35 mm root fillet spreads the neck into the pad within the slot width.
  let previous = leg(s.tipWidth),
    previousZ = -p.legDepth;
  face(previous, [], previousZ, false);
  const radius = Math.min(m.geometry.rootRadius, (p.legDepth + s.padMinZ) / 2);
  const shoulderZ = s.padMinZ - radius;
  ring(previous, previous, previousZ, shoulderZ);
  previousZ = shoulderZ;
  for (let i = 1; i <= 8; i++) {
    const angle = ((i / 8) * Math.PI) / 2;
    const currentZ = shoulderZ + radius * Math.sin(angle);
    const width =
      s.tipWidth + (s.legWidth - s.tipWidth) * (1 - Math.cos(angle));
    const current = i === 8 ? root : leg(width);
    ring(previous, current, previousZ, currentZ);
    previous = current;
    previousZ = currentZ;
  }
  centers.forEach(({ x, y }, index) => {
    let lower = bumps[index],
      z = s.padMaxZ;
    for (let i = 1; i <= 5; i++) {
      const angle = ((i / 6) * Math.PI) / 2;
      const upper = circle(
        x,
        y,
        (p.bumpDiameter / 2) * Math.cos(angle),
        m.geometry.radialSegments,
      );
      const nextZ = s.padMaxZ + p.bumpHeight * Math.sin(angle);
      ring(lower, upper, z, nextZ);
      lower = upper;
      z = nextZ;
    }
    lower.forEach((point, i) =>
      tri(
        v(point, z),
        v(lower[(i + 1) % lower.length], z),
        new THREE.Vector3(x, y, s.padMaxZ + p.bumpHeight),
      ),
    );
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Model coordinates: XY = frame back, +Z = wall. Viewer/print: +Z = up.
export function keyholeFrameToPrint(
  g: THREE.BufferGeometry,
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -getKeyholeTabsSpec(p, m).padBottom);
  return g;
}
export function createKeyholeTabPrintGeometry(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  return keyholeFrameToPrint(createKeyholeTabCanonicalGeometry(p, m), p, m);
}
export function createKeyholeTabsGeometry(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  if (Math.round(p.previewMode) !== 1)
    return createKeyholeTabPrintGeometry(p, m);
  const parts = Array.from({ length: 8 }, (_, i) => {
    const g = createKeyholeTabPrintGeometry({ ...p, variant: i + 1 }, m);
    g.translate(
      ((i % 4) - 1.5) * (p.padWidth + m.geometry.plateGap),
      (Math.floor(i / 4) - 0.5) *
        (p.legDepth +
          p.tapeThickness +
          p.padThickness +
          p.bumpHeight +
          m.geometry.plateGap),
      0,
    );
    return g;
  });
  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createKeyholeTabsPreviewParts(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  if (Math.round(p.previewMode) !== 2) return [];
  const s = getKeyholeTabsSpec(p, m);
  // Section at X = 0: left half of retaining rim, actual slot and entry opening.
  const radius = p.wideOpeningDiameter / 2,
    halfSlot = p.keyholeSlotWidth / 2;
  const joinY =
    -p.openingCenterDrop + Math.sqrt(radius * radius - halfSlot * halfSlot);
  const shape = new THREE.Shape();
  shape.moveTo(-12, -p.openingCenterDrop - radius - 3);
  shape.lineTo(0, -p.openingCenterDrop - radius - 3);
  shape.lineTo(0, -p.openingCenterDrop - radius);
  const start = (3 * Math.PI) / 2;
  const end = Math.acos(-halfSlot / radius);
  for (let i = 1; i <= 48; i++) {
    const a = start + ((end - start) * i) / 48;
    shape.lineTo(
      radius * Math.cos(a),
      -p.openingCenterDrop + radius * Math.sin(a),
    );
  }
  shape.lineTo(-halfSlot, -halfSlot);
  for (let i = 1; i <= 24; i++) {
    const angle = Math.PI - ((i / 24) * Math.PI) / 2;
    shape.lineTo(
      halfSlot * Math.cos(angle),
      -halfSlot + halfSlot * Math.sin(angle),
    );
  }
  shape.lineTo(0, 9);
  shape.lineTo(-12, 9);
  shape.closePath();
  const frame = new THREE.ExtrudeGeometry(shape, {
    depth: p.rimThickness,
    bevelEnabled: false,
    steps: 1,
  });
  frame.translate(0, 0, -p.rimThickness);
  const shaftLength = p.wallGap + p.rimThickness + p.clearance / 2;
  const shaft = new THREE.CylinderGeometry(
    p.screwShankDiameter / 2,
    p.screwShankDiameter / 2,
    shaftLength,
    32,
  );
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, s.screwCenterY, p.wallGap - shaftLength / 2);
  const head = new THREE.CylinderGeometry(
    p.screwHeadDiameter / 2,
    p.screwHeadDiameter / 2,
    p.screwHeadThickness,
    48,
  );
  head.rotateX(Math.PI / 2);
  head.translate(
    0,
    s.screwCenterY,
    -p.rimThickness - p.clearance / 2 - p.screwHeadThickness / 2,
  );
  return [
    {
      key: "sectioned-frame",
      material: "frame",
      geometry: keyholeFrameToPrint(frame, p, m),
    },
    {
      key: "screw-shank",
      material: "screw",
      geometry: keyholeFrameToPrint(shaft, p, m),
    },
    {
      key: "screw-head",
      material: "screw",
      geometry: keyholeFrameToPrint(head, p, m),
    },
  ];
}
export function getKeyholeTabsDimensions(
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  const s = getKeyholeTabsSpec(p, m);
  if (Math.round(p.previewMode) === 2)
    return {
      length: 24,
      width: p.wallGap + p.keyholeDepth,
      height: 12 + p.openingCenterDrop + p.wideOpeningDiameter / 2,
    };
  return {
    length: Math.round(p.previewMode) === 1 ? s.plateWidth : p.padWidth,
    width:
      Math.round(p.previewMode) === 1
        ? s.plateDepth
        : p.legDepth + s.padMaxZ + p.bumpHeight,
    height: p.padHeight,
  };
}
export function updateKeyholeTabsGuide(
  mesh: THREE.Mesh,
  p: ModelParams,
  m: KeyholeTabsModelDefinition,
) {
  const g = createKeyholeTabsGeometry(p, m);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  mesh.position.copy(box.getCenter(new THREE.Vector3()));
  g.dispose();
}
export function getKeyholeTabsParameterLimits(
  m: KeyholeTabsModelDefinition,
  p: ModelParams,
  key: string,
) {
  const limits = { ...getParameter(m, key).limits };
  if (key === "legWidth") {
    const spec = getKeyholeTabsSpec(p, m);
    const rise = spec.offset - m.geometry.minimumLegEdgeHeight;
    const maximumCrownWidth =
      rise >= spec.slotRoofRadius
        ? p.keyholeSlotWidth
        : 2 *
          Math.sqrt(Math.max(0, 2 * spec.slotRoofRadius * rise - rise ** 2));
    limits.max = Math.min(
      limits.max,
      p.keyholeSlotWidth - p.clearance,
      maximumCrownWidth,
    );
  }
  if (key === "legDepth")
    limits.max = Math.min(limits.max, p.rimThickness - 0.1);
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}
export function getKeyholeTabsAuditValue(
  check: AuditCheckDefinition,
  p: ModelParams,
  _unit: LengthUnit,
  m: KeyholeTabsModelDefinition,
): AuditItem {
  const s = getKeyholeTabsSpec(p, m);
  const item = (value: string, ok: boolean): AuditItem => ({
    label: check.label,
    value,
    status: ok ? "pass" : "warn",
  });
  switch (check.key) {
    case "contactShift":
      return item(
        `+${s.lift.toFixed(5)} mm lift · contact Y = ${s.legContactOffset.toFixed(5)} mm`,
        Math.abs(s.lift - s.offset) < 1e-8,
      );
    case "series":
      return item(
        `${KEYHOLE_FRACTIONS[s.variant - 1]} in · ${s.bumpCount} bumps · fixed geometry`,
        s.bumpCount === s.variant,
      );
    case "inward":
      return item(`Z = −${p.legDepth.toFixed(2)} mm into frame`, s.legMinZ < 0);
    case "roundedCrown":
      return item(
        `R ${s.crownRadius.toFixed(2)} mm circular crown · ${s.legWidth.toFixed(2)} mm root · assumed roof`,
        Math.abs(s.crownRadius - s.slotRoofRadius) < 1e-6 &&
          s.edgeHeight >= m.geometry.minimumLegEdgeHeight - 1e-8,
      );
    case "slotFit":
      return item(
        `${s.slotClearance.toFixed(2)} mm leg / ${s.shankClearance.toFixed(2)} mm shank clearance · assumed slot`,
        s.slotClearance >= p.clearance - 1e-8 &&
          s.shankClearance >= p.clearance - 1e-8,
      );
    case "depthFit":
      return item(
        `${s.legHeadClearance.toFixed(2)} mm leg–head · ${s.recessHeadClearance.toFixed(2)} mm head–recess`,
        s.legHeadClearance >= p.clearance / 2 &&
          s.recessHeadClearance >= p.clearance / 2,
      );
    case "headEntry":
      return item(
        `${s.headOpeningClearance.toFixed(2)} mm opening · ${s.headPadClearance.toFixed(2)} mm pad clearance`,
        s.headOpeningClearance >= p.clearance &&
          s.headPadClearance >= p.clearance / 2 &&
          s.headLegClearance >= p.clearance / 2,
      );
    case "neckSeat":
      return item(
        `${s.neckSeatClearance.toFixed(2)} mm above wide opening transition`,
        s.neckSeatClearance >= p.clearance / 2,
      );
    case "wallClearance":
      return item(
        `${s.wallClearance.toFixed(2)} mm beyond bumps and tape`,
        s.wallClearance >= p.clearance / 2,
      );
    case "loadPath":
      return item(
        "Slot roof → leg top → leg underside → screw shank; seating unconfirmed",
        m.geometry.dimensionsConfirmed,
      );
    default:
      return item(
        "Keyhole measurements, frame weight, tape retention and loaded fit test pending",
        m.geometry.dimensionsConfirmed && m.geometry.physicalLoadTestPassed,
      );
  }
}
