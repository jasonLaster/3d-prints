import { formatLength } from "../units";
import {
  getHolderAuditValue,
  getHolderDimensions,
  getHolderParameterLimits,
} from "./paperTowelHolder";
import { getParam } from "./shared";
import {
  getTrayAuditValue,
  getTrayDimensions,
  getTrayParameterLimits,
} from "./japandiTray";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDefinition,
  ModelDimensions,
  ModelParams,
  NumberLimits,
} from "./types";

export {
  applyHolderMorph,
  createRoundedTopGeometry,
  createSandPreviewGeometry,
  updateHolderGuide,
  updateWeightedCore,
} from "./paperTowelHolder";
export { applyTrayMorph, updateTrayGuide } from "./japandiTray";
export { getDefaultParams, getParam, getParameter } from "./shared";
export type {
  AuditItem,
  LengthUnit,
  ModelDefinition,
  ModelParameter,
  ModelParams,
  NumberLimits,
} from "./types";

function getAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: ModelDefinition,
): AuditItem {
  if (model.viewer === "japandi-tray-v1") {
    return getTrayAuditValue(check, params, unit, model);
  }

  return getHolderAuditValue(check, params, unit, model);
}

export function buildAuditItems(
  params: ModelParams,
  unit: LengthUnit,
  model: ModelDefinition,
): AuditItem[] {
  return model.audit.checks.map((check) =>
    getAuditValue(check, params, unit, model),
  );
}

export function getParameterLimits(
  model: ModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  if (model.viewer === "weighted-paper-towel-holder-v1") {
    return getHolderParameterLimits(model, params, key);
  }

  return getTrayParameterLimits(model, params, key);
}

export function getModelDimensions(
  model: ModelDefinition,
  params: ModelParams,
): ModelDimensions {
  if (model.viewer === "weighted-paper-towel-holder-v1") {
    return getHolderDimensions(params);
  }

  return getTrayDimensions(params);
}

export function getStatusItems(
  model: ModelDefinition,
  params: ModelParams,
  unit: LengthUnit,
) {
  return model.parameters.slice(0, 4).map((parameter) => {
    const label = parameter.statusLabel ?? parameter.label;
    return `${label} ${formatLength(getParam(params, parameter.key), unit)}`;
  });
}
