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
  SimpleBoxModelDefinition,
  TrayModelDefinition,
} from "./types";

type ContainerModelDefinition = TrayModelDefinition | SimpleBoxModelDefinition;

export function getTrayParameterLimits(
  model: ContainerModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };

  if (key === "floorThickness") {
    limits.max = Math.min(limits.max, getParam(params, "height") - 1);
  } else if (key.startsWith("dividerPosition")) {
    limits.max = Math.max(limits.min, getParam(params, "length") - 5);
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
  model: ContainerModelDefinition,
) {
  const settings = model.geometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = position.array as Float32Array;
  const footprintRotation = THREE.MathUtils.degToRad(
    settings.footprintRotationDegrees,
  );
  const rotationCos = Math.cos(footprintRotation);
  const rotationSin = Math.sin(footprintRotation);
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = Math.min(
    getParam(params, "floorThickness"),
    height - 1,
  );
  const ribRelief = params.ribRelief ?? settings.originalRibRelief;
  const outputRotation = THREE.MathUtils.degToRad(-getParam(params, "rotation"));
  const outputRotationCos = Math.cos(outputRotation);
  const outputRotationSin = Math.sin(outputRotation);
  const lengthScale = length / settings.originalLength;
  const widthScale = width / settings.originalWidth;
  const originalFloor = settings.originalFloorThickness;
  const wallSourceHeight = settings.originalHeight - originalFloor;
  const wallTargetHeight = height - floorThickness;
  const halfLength = settings.originalLength / 2;
  const halfWidth = settings.originalWidth / 2;
  const reliefScale =
    settings.originalRibRelief === 0
      ? 1
      : ribRelief / settings.originalRibRelief;

  for (let index = 0; index < position.count; index += 1) {
    const x = basePositions[index * 3];
    const y = basePositions[index * 3 + 1];
    const z = basePositions[index * 3 + 2];
    const widthCoord =
      model.viewer === "simple-box-v1"
        ? y
        : x * rotationCos + y * rotationSin;
    const lengthCoord =
      model.viewer === "simple-box-v1"
        ? x
        : -x * rotationSin + y * rotationCos;
    const edgeRatio = Math.max(
      Math.abs(lengthCoord) / halfLength,
      Math.abs(widthCoord) / halfWidth,
    );
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

    const nextLengthCoord =
      (lengthCoord + Math.sign(lengthCoord) * reliefOffset) * lengthScale;
    const nextWidthCoord =
      (widthCoord + Math.sign(widthCoord) * reliefOffset) * widthScale;

    target[index * 3] =
      nextLengthCoord * outputRotationCos - nextWidthCoord * outputRotationSin;
    target[index * 3 + 1] =
      nextLengthCoord * outputRotationSin + nextWidthCoord * outputRotationCos;
    target[index * 3 + 2] = nextZ;
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function updateTrayGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const rotation = getParam(params, "rotation");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(length, width, height);
  mesh.rotation.set(0, 0, THREE.MathUtils.degToRad(-rotation));
  mesh.position.set(0, 0, height / 2);
}

function roundedRectanglePath(
  path: THREE.Shape | THREE.Path,
  length: number,
  width: number,
  radius: number,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const cornerRadius = Math.min(radius, halfLength, halfWidth);

  path.moveTo(-halfLength + cornerRadius, -halfWidth);
  path.lineTo(halfLength - cornerRadius, -halfWidth);
  path.quadraticCurveTo(halfLength, -halfWidth, halfLength, -halfWidth + cornerRadius);
  path.lineTo(halfLength, halfWidth - cornerRadius);
  path.quadraticCurveTo(halfLength, halfWidth, halfLength - cornerRadius, halfWidth);
  path.lineTo(-halfLength + cornerRadius, halfWidth);
  path.quadraticCurveTo(-halfLength, halfWidth, -halfLength, halfWidth - cornerRadius);
  path.lineTo(-halfLength, -halfWidth + cornerRadius);
  path.quadraticCurveTo(-halfLength, -halfWidth, -halfLength + cornerRadius, -halfWidth);
}

function createRegistrationRingGeometry(
  length: number,
  width: number,
  height: number,
  thickness: number,
  wallInset: number,
  clearance: number,
  cornerRadius: number,
  attachmentOverlap: number,
) {
  const outerLength = Math.max(
    thickness * 2 + 1,
    length - 2 * (wallInset + clearance),
  );
  const outerWidth = Math.max(
    thickness * 2 + 1,
    width - 2 * (wallInset + clearance),
  );
  const innerLength = outerLength - thickness * 2;
  const innerWidth = outerWidth - thickness * 2;
  const shape = new THREE.Shape();
  roundedRectanglePath(shape, outerLength, outerWidth, cornerRadius);
  const hole = new THREE.Path();
  roundedRectanglePath(
    hole,
    innerLength,
    innerWidth,
    Math.max(0.5, cornerRadius - thickness),
  );
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
    steps: 1,
  });
  geometry.translate(0, 0, -height + attachmentOverlap);
  geometry.computeVertexNormals();
  return geometry;
}

export function createTrayStackingLipGeometry(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  const clearance = getParam(params, "lipClearance");
  const lipHeight = getParam(params, "lipHeight");
  const geometry = createRegistrationRingGeometry(
    getParam(params, "length"),
    getParam(params, "width"),
    lipHeight,
    settings.stackingLipThickness,
    settings.stackingLipWallInset,
    clearance,
    settings.stackingLipCornerRadius,
    settings.stackingLipFloorOverlap,
  );
  geometry.rotateZ(THREE.MathUtils.degToRad(-getParam(params, "rotation")));
  return geometry;
}

export function createSimpleBoxLidGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const thickness = getParam(params, "lidThickness");
  const skirtHeight = getParam(params, "lidSkirtHeight");
  const clearance = getParam(params, "lidClearance");
  const plate = new THREE.BoxGeometry(length, width, thickness);
  plate.translate(0, 0, thickness / 2);
  const skirt = createRegistrationRingGeometry(
    length,
    width,
    skirtHeight,
    model.geometry.stackingLipThickness,
    model.geometry.stackingLipWallInset,
    clearance,
    model.geometry.stackingLipCornerRadius,
    model.geometry.stackingLipFloorOverlap,
  );
  return [plate, skirt];
}

export function createSimpleBoxLidPrintGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const thickness = getParam(params, "lidThickness");
  return createSimpleBoxLidGeometries(params, model).map((geometry) => {
    geometry.rotateX(Math.PI);
    geometry.translate(0, 0, thickness);
    geometry.computeVertexNormals();
    return geometry;
  });
}

export function createTrayDividerGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  const count = Math.round(getParam(params, "dividerCount"));
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = getParam(params, "floorThickness");
  const dividerBottom = floorThickness - settings.dividerFloorOverlap;
  const dividerHeight = Math.max(
    1,
    height - dividerBottom - settings.dividerTopClearance,
  );
  const dividerWidth = Math.max(1, width - settings.dividerWallInset * 2);
  const rotation = THREE.MathUtils.degToRad(-getParam(params, "rotation"));

  return Array.from({ length: count }, (_, index) => {
    const position = Math.min(
      length - 5,
      Math.max(5, getParam(params, `dividerPosition${index + 1}`)),
    );
    const geometry = new THREE.BoxGeometry(
      settings.dividerThickness,
      dividerWidth,
      dividerHeight,
    );
    geometry.translate(
      -length / 2 + position,
      0,
      dividerBottom + dividerHeight / 2,
    );
    geometry.rotateZ(rotation);
    return geometry;
  });
}

export function getTrayAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: ContainerModelDefinition,
): AuditItem {
  const settings = model.geometry;
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = getParam(params, "floorThickness");
  const ribRelief = params.ribRelief ?? settings.originalRibRelief;
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
    case "trayStackingLip": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const lipHeight = getParam(params, "lipHeight");
      const lipClearance = getParam(params, "lipClearance");
      return {
        label: check.label,
        value: `${formatLength(lipHeight, unit)} high · ${formatLength(lipClearance, unit)} clearance`,
        status:
          lipHeight >= 1 &&
          lipClearance >= 0.15 &&
          model.geometry.stackingLipThickness >= 1.2
            ? "pass"
            : "warn",
      };
    }
    case "trayDividers": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const dividerCount = Math.round(getParam(params, "dividerCount"));
      return {
        label: check.label,
        value: `${dividerCount} divider${dividerCount === 1 ? "" : "s"}`,
        status:
          dividerCount >= 0 &&
          dividerCount <= 4 &&
          model.geometry.dividerThickness >= 1.2
            ? "pass"
            : "warn",
      };
    }
    case "trayStackingFit": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const clearance = getParam(params, "lipClearance");
      const engagement =
        getParam(params, "lipHeight") - model.geometry.stackingLipFloorOverlap;
      return {
        label: check.label,
        value: `${formatLength(clearance, unit)} / side · ${formatLength(engagement, unit)} engaged`,
        status: clearance > 0 && engagement >= 1 ? "pass" : "warn",
      };
    }
    case "trayLidFit": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const clearance = getParam(params, "lidClearance");
      const engagement =
        getParam(params, "lidSkirtHeight") -
        model.geometry.stackingLipFloorOverlap;
      return {
        label: check.label,
        value: `${formatLength(clearance, unit)} / side · ${formatLength(engagement, unit)} engaged`,
        status:
          clearance > 0 &&
          engagement >= 1 &&
          getParam(params, "lidThickness") >= 1.2
            ? "pass"
            : "warn",
      };
    }
    default:
      return {
        label: check.label,
        value: "Configured",
        status: "warn",
      };
  }
}
