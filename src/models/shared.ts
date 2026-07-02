import type { ModelDefinition, ModelParams } from "./types";

export function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getParameter(model: ModelDefinition, key: string) {
  const parameter = model.parameters.find((entry) => entry.key === key);
  if (!parameter) {
    throw new Error(`${model.id} is missing parameter "${key}"`);
  }
  return parameter;
}

export function getParam(params: ModelParams, key: string) {
  const value = params[key];
  if (!Number.isFinite(value)) {
    throw new Error(`Missing parameter value "${key}"`);
  }
  return value;
}

export function getDefaultParams(model: ModelDefinition): ModelParams {
  return Object.fromEntries(
    model.parameters.map((parameter) => [parameter.key, parameter.default]),
  );
}
