import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  DoorLockAdapterModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

const EPSILON = 1e-6;

function polygonArea(points: THREE.Vector2[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function circleRing(radius: number, segments: number) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function squareRing(width: number) {
  const half = width / 2;
  return [
    new THREE.Vector2(-half, -half),
    new THREE.Vector2(half, -half),
    new THREE.Vector2(half, half),
    new THREE.Vector2(-half, half),
  ];
}

function notchedCollarRing(
  width: number,
  notchWidth: number,
  notchHeight: number,
) {
  const half = width / 2;
  const halfNotch = Math.min(notchWidth, width) / 2;
  return [
    new THREE.Vector2(-half, -half),
    new THREE.Vector2(-halfNotch, -half),
    new THREE.Vector2(0, -half - notchHeight),
    new THREE.Vector2(halfNotch, -half),
    new THREE.Vector2(half, -half),
    new THREE.Vector2(half, half),
    new THREE.Vector2(-half, half),
  ];
}

function rectangularHoleRing(
  width: number,
  length: number,
  rotationDegrees: number,
) {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const rotation = THREE.MathUtils.degToRad(rotationDegrees);
  const rotationCos = Math.cos(rotation);
  const rotationSin = Math.sin(rotation);
  return [
    new THREE.Vector2(-halfLength, -halfWidth),
    new THREE.Vector2(-halfLength, halfWidth),
    new THREE.Vector2(halfLength, halfWidth),
    new THREE.Vector2(halfLength, -halfWidth),
  ].map(
    (point) =>
      new THREE.Vector2(
        point.x * rotationCos - point.y * rotationSin,
        point.x * rotationSin + point.y * rotationCos,
      ),
  );
}

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addRingSide(
  positions: number[],
  ring: THREE.Vector2[],
  bottom: number,
  top: number,
) {
  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    const a = new THREE.Vector3(ring[index].x, ring[index].y, bottom);
    const b = new THREE.Vector3(ring[next].x, ring[next].y, bottom);
    const c = new THREE.Vector3(ring[next].x, ring[next].y, top);
    const d = new THREE.Vector3(ring[index].x, ring[index].y, top);
    addTriangle(positions, a, b, c);
    addTriangle(positions, a, c, d);
  }
}

function addHorizontalFace(
  positions: number[],
  contour: THREE.Vector2[],
  holes: THREE.Vector2[][],
  z: number,
  upward: boolean,
) {
  const triangles = THREE.ShapeUtils.triangulateShape(
    contour.map((point) => point.clone()),
    holes.map((hole) => hole.map((point) => point.clone())),
  );
  const points = [...contour, ...holes.flat()];

  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a2 = points[aIndex];
    const b2 = points[bIndex];
    const c2 = points[cIndex];
    const cross =
      (b2.x - a2.x) * (c2.y - a2.y) -
      (b2.y - a2.y) * (c2.x - a2.x);
    const a = new THREE.Vector3(a2.x, a2.y, z);
    const b = new THREE.Vector3(b2.x, b2.y, z);
    const c = new THREE.Vector3(c2.x, c2.y, z);
    if ((cross > 0) === upward) {
      addTriangle(positions, a, b, c);
    } else {
      addTriangle(positions, a, c, b);
    }
  }
}

type AdapterSection = {
  bottom: number;
  top: number;
  ring: THREE.Vector2[];
};

export function createDoorLockAdapterGeometry(
  params: ModelParams,
  model: DoorLockAdapterModelDefinition,
) {
  const tubeDiameter = getParam(params, "tubeDiameter");
  const tubeLength = getParam(params, "tubeLength");
  const boxWidth = Math.max(getParam(params, "boxWidth"), tubeDiameter);
  const boxLength = Math.min(getParam(params, "boxLength"), tubeLength);
  const notchHeight = getParam(params, "notchHeight");
  const notchWidth = Math.min(getParam(params, "notchWidth"), boxWidth);
  const notchLength = Math.min(getParam(params, "notchLength"), boxLength);
  const cutoutWidth = getParam(params, "cutoutWidth");
  const cutoutLength = getParam(params, "cutoutLength");
  const cutoutRotation = getParam(params, "cutoutRotation");
  const circle = circleRing(tubeDiameter / 2, model.geometry.radialSegments);
  const square = squareRing(boxWidth);
  const notched = notchedCollarRing(boxWidth, notchWidth, notchHeight);
  const hole = rectangularHoleRing(
    cutoutWidth,
    cutoutLength,
    cutoutRotation,
  );
  const boxBottom = (tubeLength - boxLength) / 2;
  const boxTop = boxBottom + boxLength;
  const notchBottom = (tubeLength - notchLength) / 2;
  const notchTop = notchBottom + notchLength;
  const sections: AdapterSection[] = [
    { bottom: 0, top: boxBottom, ring: circle },
    { bottom: boxBottom, top: notchBottom, ring: square },
    { bottom: notchBottom, top: notchTop, ring: notched },
    { bottom: notchTop, top: boxTop, ring: square },
    { bottom: boxTop, top: tubeLength, ring: circle },
  ].filter((section) => section.top - section.bottom > EPSILON);
  const positions: number[] = [];

  sections.forEach((section) => {
    addRingSide(positions, section.ring, section.bottom, section.top);
  });

  for (let index = 0; index < sections.length - 1; index += 1) {
    const lower = sections[index];
    const upper = sections[index + 1];
    if (lower.top < upper.bottom - EPSILON) continue;
    const lowerArea = Math.abs(polygonArea(lower.ring));
    const upperArea = Math.abs(polygonArea(upper.ring));
    if (Math.abs(lowerArea - upperArea) <= EPSILON) continue;
    const larger = lowerArea > upperArea ? lower.ring : upper.ring;
    const smaller = lowerArea > upperArea ? upper.ring : lower.ring;
    addHorizontalFace(
      positions,
      larger,
      [smaller.slice().reverse()],
      lower.top,
      lowerArea > upperArea,
    );
  }

  addRingSide(positions, hole, 0, tubeLength);
  addHorizontalFace(positions, circle, [hole], 0, false);
  addHorizontalFace(positions, circle, [hole], tubeLength, true);

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

export function getDoorLockAdapterDimensions(
  params: ModelParams,
): ModelDimensions {
  const tubeDiameter = getParam(params, "tubeDiameter");
  const boxWidth = Math.max(getParam(params, "boxWidth"), tubeDiameter);
  return {
    length: boxWidth,
    width: Math.max(tubeDiameter, boxWidth + getParam(params, "notchHeight")),
    height: getParam(params, "tubeLength"),
  };
}

export function updateDoorLockAdapterGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const dimensions = getDoorLockAdapterDimensions(params);
  const notchHeight = getParam(params, "notchHeight");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    dimensions.length,
    dimensions.width,
    dimensions.height,
  );
  mesh.position.set(0, -notchHeight / 2, dimensions.height / 2);
}

export function getDoorLockAdapterParameterLimits(
  model: DoorLockAdapterModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  const minimumWall = model.geometry.minimumWallThickness;

  if (key === "tubeDiameter") {
    const requiredDiameter = Math.max(
      limits.min,
      Math.hypot(
        getParam(params, "cutoutWidth"),
        getParam(params, "cutoutLength"),
      ) + minimumWall * 2,
    );
    limits.min = Number(
      (Math.ceil(requiredDiameter / limits.step) * limits.step).toFixed(6),
    );
    limits.max = Math.min(limits.max, getParam(params, "boxWidth"));
  } else if (key === "tubeLength") {
    limits.min = Math.max(limits.min, getParam(params, "boxLength"));
  } else if (key === "boxWidth") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "tubeDiameter"),
      getParam(params, "notchWidth"),
    );
  } else if (key === "boxLength") {
    limits.min = Math.max(limits.min, getParam(params, "notchLength"));
    limits.max = Math.min(limits.max, getParam(params, "tubeLength"));
  } else if (key === "notchLength") {
    limits.max = Math.min(limits.max, getParam(params, "boxLength"));
  } else if (key === "notchWidth") {
    limits.max = Math.min(limits.max, getParam(params, "boxWidth"));
  } else if (key === "cutoutWidth" || key === "cutoutLength") {
    const otherDimension = getParam(
      params,
      key === "cutoutWidth" ? "cutoutLength" : "cutoutWidth",
    );
    const availableRadius =
      getParam(params, "tubeDiameter") / 2 - minimumWall;
    limits.max = Math.min(
      limits.max,
      2 *
        Math.sqrt(
          Math.max(0, availableRadius ** 2 - (otherDimension / 2) ** 2),
        ),
    );
  }

  return limits;
}

export function getDoorLockAdapterAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: DoorLockAdapterModelDefinition,
): AuditItem {
  const tubeDiameter = getParam(params, "tubeDiameter");
  const tubeLength = getParam(params, "tubeLength");
  const boxWidth = getParam(params, "boxWidth");
  const boxLength = getParam(params, "boxLength");
  const notchHeight = getParam(params, "notchHeight");
  const notchWidth = getParam(params, "notchWidth");
  const notchLength = getParam(params, "notchLength");
  const cutoutWidth = getParam(params, "cutoutWidth");
  const cutoutLength = getParam(params, "cutoutLength");
  const cutoutRotation = getParam(params, "cutoutRotation");
  const minimumWall =
    tubeDiameter / 2 - Math.hypot(cutoutWidth / 2, cutoutLength / 2);
  const pass = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "pass",
  });
  const warn = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "warn",
  });

  switch (check.key) {
    case "adapterTube":
      return pass(
        `${formatLength(tubeDiameter, unit)} Ø × ${formatLength(tubeLength, unit)}`,
      );
    case "adapterCollar":
      return boxWidth >= tubeDiameter && boxLength <= tubeLength
        ? pass(`${formatLength(boxWidth, unit)} × ${formatLength(boxLength, unit)}`)
        : warn("Collar must wrap the tube");
    case "adapterNotch":
      return notchLength <= boxLength && notchWidth <= boxWidth
        ? pass(
            `${formatLength(notchWidth, unit)} W × ${formatLength(notchHeight, unit)} H × ${formatLength(notchLength, unit)} L`,
          )
        : warn("Notch exceeds collar");
    case "adapterCutout":
      return pass(
        `${formatLength(cutoutWidth, unit)} × ${formatLength(cutoutLength, unit)} @ ${cutoutRotation.toFixed(0)}°`,
      );
    case "adapterWallThickness":
      return minimumWall >= model.geometry.minimumWallThickness
        ? pass(formatLength(minimumWall, unit))
        : warn(`${formatLength(minimumWall, unit)} minimum wall`);
    case "adapterCentering":
      return pass("Collar, notch, and slot centered");
    default:
      return warn("Unsupported audit check");
  }
}
