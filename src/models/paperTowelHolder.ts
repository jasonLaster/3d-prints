import * as THREE from "three";
import { formatLength, formatSignedLength } from "../units";
import { getParam, getParameter, smoothStep } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  HolderModelDefinition,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

export function getHolderParameterLimits(
  model: HolderModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };

  if (key === "diameter") {
    const clearance = model.geometry.tubeToHolderDiameterClearance;
    limits.min = Math.max(limits.min, params.tubeDiameter + clearance);
  }

  if (key === "tubeDiameter") {
    const clearance = model.geometry.tubeToHolderDiameterClearance;
    limits.max = Math.min(limits.max, params.diameter - clearance);
  }

  return limits;
}

export function getHolderDimensions(
  params: ModelParams,
): ModelDimensions {
  const diameter = getParam(params, "diameter");
  return {
    length: diameter,
    width: diameter,
    height: getParam(params, "height"),
  };
}

export function applyHolderMorph(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  params: ModelParams,
  model: HolderModelDefinition,
) {
  const settings = model.geometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = position.array as Float32Array;
  const height = getParam(params, "height");
  const diameter = getParam(params, "diameter");
  const tubeDiameter = getParam(params, "tubeDiameter");
  const radiusDelta = diameter / 2 - settings.originalDiameter / 2;
  const originalTubeRadius = settings.centerTubeOuterDiameter / 2;
  const targetTubeRadius = tubeDiameter / 2;
  const tubeRadiusScale = targetTubeRadius / originalTubeRadius;
  const originalDomeBase =
    settings.centerTubeOriginalTop - originalTubeRadius;
  const currentDomeBase = getDomeBase(params, model);
  const originalTopStart = settings.originalHeight - settings.topLockedHeight;
  const sourceMiddleHeight = originalTopStart - settings.bottomLockedHeight;
  const targetMiddleHeight =
    height - settings.bottomLockedHeight - settings.topLockedHeight;
  const heightScale = targetMiddleHeight / sourceMiddleHeight;

  for (let index = 0; index < position.count; index += 1) {
    const x = basePositions[index * 3];
    const y = basePositions[index * 3 + 1];
    const z = basePositions[index * 3 + 2];
    const radius = Math.hypot(x, y);
    let nextRadius = radius;
    let nextZ = z;

    if (radius <= originalTubeRadius + 0.1) {
      nextRadius = radius * tubeRadiusScale;
      if (z >= originalDomeBase) {
        nextZ = currentDomeBase;
      } else if (z > settings.bottomLockedHeight) {
        nextZ =
          settings.bottomLockedHeight +
          ((z - settings.bottomLockedHeight) /
            (originalDomeBase - settings.bottomLockedHeight)) *
            (currentDomeBase - settings.bottomLockedHeight);
      }
    } else {
      const blend = smoothStep(
        settings.fixedCoreRadius,
        settings.outerMoveStartRadius,
        radius,
      );
      nextRadius = Math.max(0, radius + radiusDelta * blend);

      if (z >= originalTopStart) {
        nextZ = height - (settings.originalHeight - z);
      } else if (z > settings.bottomLockedHeight) {
        nextZ =
          settings.bottomLockedHeight +
          (z - settings.bottomLockedHeight) * heightScale;
      }
    }

    const radiusScale = radius > 0.0001 ? nextRadius / radius : 1;
    target[index * 3] = x * radiusScale;
    target[index * 3 + 1] = y * radiusScale;
    target[index * 3 + 2] = nextZ;
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function updateHolderGuide(mesh: THREE.Mesh, params: ModelParams) {
  const height = getParam(params, "height");
  const diameter = getParam(params, "diameter");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.CylinderGeometry(
    diameter / 2,
    diameter / 2,
    height,
    128,
    1,
    true,
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 0, height / 2);
}

export function getCenterTubeTop(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  return getParam(params, "height") - model.geometry.centerTubeTopClearance;
}

export function getDomeBase(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  return getCenterTubeTop(params, model) - getParam(params, "tubeDiameter") / 2;
}

function getTubeWallThickness(model: HolderModelDefinition) {
  return (
    (model.geometry.centerTubeOuterDiameter -
      model.geometry.centerTubeInnerDiameter) /
    2
  );
}

export function getSandChamberDiameter(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  return Math.max(0, getParam(params, "tubeDiameter") - getTubeWallThickness(model) * 2);
}

function getSandHeight(params: ModelParams, model: HolderModelDefinition) {
  return Math.max(
    0,
    getDomeBase(params, model) -
      model.geometry.sandBottomHeight -
      model.geometry.sandHeadspace,
  );
}

export function getSandVolumeCc(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  const radius = getSandChamberDiameter(params, model) / 2;
  return (Math.PI * radius * radius * getSandHeight(params, model)) / 1000;
}

export function createRoundedTopGeometry(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  const radius = getParam(params, "tubeDiameter") / 2;
  const geometry = new THREE.SphereGeometry(
    radius,
    64,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, getDomeBase(params, model));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSandPreviewGeometry(
  params: ModelParams,
  model: HolderModelDefinition,
) {
  const radius = getSandChamberDiameter(params, model) / 2;
  const height = getSandHeight(params, model);
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 56, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, model.geometry.sandBottomHeight + height / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function updateWeightedCore(
  domeMesh: THREE.Mesh,
  sandMesh: THREE.Mesh,
  params: ModelParams,
  model: HolderModelDefinition,
) {
  domeMesh.geometry.dispose();
  domeMesh.geometry = createRoundedTopGeometry(params, model);
  sandMesh.geometry.dispose();
  sandMesh.geometry = createSandPreviewGeometry(params, model);
}

export function getHolderAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: HolderModelDefinition,
): AuditItem {
  const settings = model.geometry;
  const height = getParam(params, "height");
  const diameter = getParam(params, "diameter");
  const tubeDiameter = getParam(params, "tubeDiameter");
  const heightChanged = Math.abs(height - settings.originalHeight) > 0.05;
  const diameterChanged =
    Math.abs(diameter - settings.originalDiameter) > 0.05;
  const tubeChanged =
    Math.abs(tubeDiameter - settings.centerTubeOuterDiameter) > 0.05;
  const radiusDelta = diameter / 2 - settings.originalDiameter / 2;
  const tubeRadiusDelta =
    tubeDiameter / 2 - settings.centerTubeOuterDiameter / 2;
  const tubeToHolderClearance = (diameter - tubeDiameter) / 2;
  const targetMiddle =
    height - settings.bottomLockedHeight - settings.topLockedHeight;
  const sandVolume = getSandVolumeCc(params, model);
  const sandMass = (sandVolume * settings.sandDensityGramsPerCc) / 1000;

  switch (check.key) {
    case "holderHeightTarget":
      return {
        label: check.label,
        value: formatLength(height, unit),
        status: targetMiddle > (check.minMiddleHeightMm ?? 80) ? "pass" : "warn",
      };
    case "holderDiameterTarget":
      return {
        label: check.label,
        value: formatLength(diameter, unit),
        status:
          diameter >= tubeDiameter + settings.tubeToHolderDiameterClearance
            ? "pass"
            : "warn",
      };
    case "centerTubeOuterDiameter":
      return {
        label: check.label,
        value: formatLength(tubeDiameter, unit),
        status: tubeDiameter >= getParameter(model, "tubeDiameter").limits.min ? "pass" : "warn",
      };
    case "sandChamber":
      return {
        label: check.label,
        value: `${formatLength(
          getSandChamberDiameter(params, model),
          unit,
        )} ID, ${sandVolume.toFixed(0)} cc`,
        status: sandVolume > (check.minSandVolumeCc ?? 60) ? "pass" : "warn",
      };
    case "estimatedSandMass":
      return {
        label: check.label,
        value: `${sandMass.toFixed(2)} kg`,
        status: sandMass > (check.minSandMassKg ?? 0.1) ? "pass" : "warn",
      };
    case "roundedTop":
      return {
        label: check.label,
        value: `${formatLength(tubeDiameter / 2, unit)} radius`,
        status: "pass",
      };
    case "tubeToHolderClearance":
      return {
        label: check.label,
        value: formatLength(tubeToHolderClearance, unit),
        status:
          tubeToHolderClearance >= settings.tubeToHolderDiameterClearance / 2
            ? "pass"
            : "warn",
      };
    case "tubeRadialMove":
      return {
        label: check.label,
        value: formatSignedLength(tubeRadiusDelta, unit),
        status: tubeChanged ? "pass" : "pass",
      };
    case "roundedTopHeight":
      return {
        label: check.label,
        value: `${formatLength(getCenterTubeTop(params, model), unit)} high`,
        status: "pass",
      };
    case "bottomTopLockBands":
      return {
        label: check.label,
        value: `${formatLength(
          settings.bottomLockedHeight,
          unit,
        )} + ${formatLength(settings.topLockedHeight, unit)}`,
        status: "pass",
      };
    case "outerWallRadialMove":
      return {
        label: check.label,
        value: formatSignedLength(radiusDelta, unit),
        status: diameterChanged || heightChanged ? "pass" : "pass",
      };
    default:
      return {
        label: check.label,
        value: "Configured",
        status: "warn",
      };
  }
}
