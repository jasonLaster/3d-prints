import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter, smoothStep } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  TrayModelDefinition,
} from "./types";

export function getTrayParameterLimits(
  model: TrayModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };

  if (key === "floorThickness") {
    limits.max = Math.min(limits.max, getParam(params, "height") - 1);
  }

  return limits;
}

export function getTrayDimensions(params: ModelParams): ModelDimensions {
  return {
    length: getParam(params, "length"),
    width: getParam(params, "width"),
    height: getParam(params, "height"),
  };
}

export function applyTrayMorph(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  params: ModelParams,
  model: TrayModelDefinition,
) {
  const settings = model.geometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = position.array as Float32Array;
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = Math.min(
    getParam(params, "floorThickness"),
    height - 1,
  );
  const ribRelief = getParam(params, "ribRelief");
  const lengthScale = length / settings.originalLength;
  const widthScale = width / settings.originalWidth;
  const originalFloor = settings.originalFloorThickness;
  const wallSourceHeight = settings.originalHeight - originalFloor;
  const wallTargetHeight = height - floorThickness;
  const halfLength = settings.originalLength / 2;
  const halfWidth = settings.originalWidth / 2;
  const reliefScale = ribRelief / settings.originalRibRelief;

  for (let index = 0; index < position.count; index += 1) {
    const x = basePositions[index * 3];
    const y = basePositions[index * 3 + 1];
    const z = basePositions[index * 3 + 2];
    const edgeRatio = Math.max(Math.abs(x) / halfLength, Math.abs(y) / halfWidth);
    const wallBlend =
      smoothStep(0.52, 0.92, edgeRatio) *
      smoothStep(0.08, 0.36, z / settings.originalHeight) *
      (1 - smoothStep(0.98, 1, edgeRatio));
    const reliefOffset =
      (reliefScale - 1) * wallBlend * Math.min(1.4, Math.max(0, 1 - edgeRatio) * 18);

    let nextZ = z;
    if (z <= originalFloor) {
      nextZ = (z / originalFloor) * floorThickness;
    } else {
      nextZ =
        floorThickness +
        ((z - originalFloor) / wallSourceHeight) * wallTargetHeight;
    }

    target[index * 3] = (x + Math.sign(x) * reliefOffset) * lengthScale;
    target[index * 3 + 1] = (y + Math.sign(y) * reliefOffset) * widthScale;
    target[index * 3 + 2] = nextZ;
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function updateTrayGuide(mesh: THREE.Mesh, params: ModelParams) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(length, width, height);
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, height / 2);
}

export function getTrayAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: TrayModelDefinition,
): AuditItem {
  const settings = model.geometry;
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = getParam(params, "floorThickness");
  const ribRelief = getParam(params, "ribRelief");
  const interiorDepth = Math.max(0, height - floorThickness);
  const aspectRatio = length / width;

  switch (check.key) {
    case "trayLengthTarget":
      return {
        label: check.label,
        value: formatLength(length, unit),
        status: length >= getParameter(model, "length").limits.min ? "pass" : "warn",
      };
    case "trayWidthTarget":
      return {
        label: check.label,
        value: formatLength(width, unit),
        status: width >= getParameter(model, "width").limits.min ? "pass" : "warn",
      };
    case "trayHeightTarget":
      return {
        label: check.label,
        value: formatLength(height, unit),
        status: height >= settings.minimumWallHeight ? "pass" : "warn",
      };
    case "trayFloorThickness":
      return {
        label: check.label,
        value: formatLength(floorThickness, unit),
        status:
          floorThickness >= settings.minimumFloorThickness &&
          floorThickness < height
            ? "pass"
            : "warn",
      };
    case "trayRibRelief":
      return {
        label: check.label,
        value: formatLength(ribRelief, unit),
        status:
          ribRelief >= settings.minimumRibRelief &&
          ribRelief <= settings.maximumRibRelief
            ? "pass"
            : "warn",
      };
    case "trayAspectRatio":
      return {
        label: check.label,
        value: `${aspectRatio.toFixed(2)}:1`,
        status: aspectRatio >= 0.35 && aspectRatio <= 3.2 ? "pass" : "warn",
      };
    case "trayInteriorDepth":
      return {
        label: check.label,
        value: formatLength(interiorDepth, unit),
        status: interiorDepth >= settings.minimumWallHeight / 2 ? "pass" : "warn",
      };
    case "trayOriginalReference":
      return {
        label: check.label,
        value: `${formatLength(settings.originalLength, unit)} x ${formatLength(
          settings.originalWidth,
          unit,
        )}`,
        status: "pass",
      };
    default:
      return {
        label: check.label,
        value: "Configured",
        status: "warn",
      };
  }
}
