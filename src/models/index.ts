import { formatLength } from "../units";
import {
  getHolderAuditValue,
  getHolderDimensions,
  getHolderParameterLimits,
} from "./paperTowelHolder";
import { getParam, getParameter } from "./shared";
import {
  getTrayAuditValue,
  getTrayDimensions,
  getTrayParameterLimits,
} from "./japandiTray";
import {
  getDoorLockAdapterAuditValue,
  getDoorLockAdapterDimensions,
  getDoorLockAdapterParameterLimits,
} from "./doorLockAdapter";
import {
  getConcentricTubeJigAuditValue,
  getConcentricTubeJigDimensions,
  getConcentricTubeJigParameterLimits,
} from "./concentricTubeJig";
import {
  getDrillBitHolderAuditValue,
  getDrillBitHolderDimensions,
  getDrillBitHolderParameterLimits,
} from "./drillBitHolder";
import {
  getRouterMortiseJigAuditValue,
  getRouterMortiseJigDimensions,
  getRouterMortiseJigParameterLimits,
} from "./routerMortiseJigPhoto";
import {
  getRouterTenonJigAuditValue,
  getRouterTenonJigDimensions,
  getRouterTenonJigParameterLimits,
} from "./routerTenonJig";
import {
  getBandsawSledAuditValue,
  getBandsawSledDimensions,
  getBandsawSledParameterLimits,
  getBandsawSledSpec,
} from "./bandsawSled";
import {
  getDiningTableAuditValue,
  getDiningTableDimensions,
  getDiningTableParameterLimits,
} from "./diningTable";
import {
  getHoverDiningTableAuditValue,
  getHoverDiningTableDimensions,
  getHoverDiningTableParameterLimits,
} from "./hoverDiningTable";
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
  createSandChamberFloorGeometry,
  createSandPreviewGeometry,
  updateHolderGuide,
  updateWeightedCore,
} from "./paperTowelHolder";
export {
  applyTrayMorph,
  createGridfinityBaseGeometry,
  createTrayDividerGeometries,
  createTrayStackingLipGeometry,
  createSimpleBoxLidGeometries,
  createSimpleBoxLidPrintGeometries,
  updateTrayGuide,
  getGridfinityUnitCount,
  snapGridfinityDimension,
} from "./japandiTray";
export {
  createDoorLockAdapterGeometry,
  updateDoorLockAdapterGuide,
} from "./doorLockAdapter";
export {
  createConcentricTubeJigGeometry,
  updateConcentricTubeJigGuide,
} from "./concentricTubeJig";
export {
  createDrillBitHolderGeometry,
  DRILL_BIT_PARAMETER_KEYS,
  getDrillBitDiameters,
  getDrillBitHolderLayout,
  isDrillBitDiameterKey,
  updateDrillBitHolderGuide,
} from "./drillBitHolder";
export {
  createRouterMortiseJigThicknessJawGeometry,
  createRouterMortiseJigGuideGeometry,
  createRouterMortiseJigPartGeometries,
  createRouterMortiseJigPreviewParts,
  getRouterMortiseJigSpec,
  updateRouterMortiseJigGuide,
} from "./routerMortiseJigPhoto";
export type {
  RouterMortiseJigPart,
  RouterMortiseJigPreviewPart,
  RouterMortiseJigSpec,
} from "./routerMortiseJigPhoto";
export {
  createRouterTenonJigBaseGeometry,
  createRouterTenonJigCheekGuideGeometry,
  createRouterTenonJigEdgeGuideGeometry,
  createRouterTenonJigPartGeometries,
  createRouterTenonJigPreviewParts,
  getRouterTenonJigSpec,
  updateRouterTenonJigGuide,
} from "./routerTenonJig";
export type {
  RouterTenonJigPart,
  RouterTenonJigPreviewPart,
  RouterTenonJigSpec,
} from "./routerTenonJig";
export {
  createBandsawSledBaseGeometry,
  createBandsawSledBracketGeometry,
  createBandsawSledFenceGeometry,
  createBandsawSledGeometry,
  createBandsawSledLockKnobGeometry,
  createBandsawSledPartGeometries,
  createBandsawSledPreviewParts,
  getBandsawSledSpec,
  updateBandsawSledGuide,
} from "./bandsawSled";
export type {
  BandsawSledPart,
  BandsawSledPreviewPart,
  BandsawSledSpec,
} from "./bandsawSled";
export {
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  getDiningTableStructuralAssessment,
  updateDiningTableGuide,
} from "./diningTable";
export {
  assertHoverDiningTableSpec,
  createHoverDiningTableCutPartGeometry,
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  createHoverDiningTableHardwareGeometries,
  getHoverDiningTableEndBoxFabricationProfiles,
  getHoverDiningTableStileFabricationLayout,
  getHoverDiningTableCutList,
  getHoverDiningTablePieceCount,
  getHoverDiningTableStructuralAssessment,
  updateHoverDiningTableGuide,
} from "./hoverDiningTable";
export type {
  HoverDiningTableStructuralAssessment,
  HoverDiningTableStructuralGrade,
  HoverDiningTableStructuralMetric,
} from "./hoverDiningTable";
export {
  createHoverDiningTableTemplateSegments,
  getHoverDiningTableTemplateSummary,
} from "./hoverDiningTableTemplates";
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
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterAuditValue(check, params, unit, model);
  }
  if (model.viewer === "concentric-tube-jig-v1") {
    return getConcentricTubeJigAuditValue(check, params, unit, model);
  }
  if (model.viewer === "drill-bit-holder-v1") {
    return getDrillBitHolderAuditValue(check, params, unit, model);
  }
  if (model.viewer === "router-mortise-jig-v1") {
    return getRouterMortiseJigAuditValue(check, params, unit, model);
  }
  if (model.viewer === "router-tenon-jig-v1") {
    return getRouterTenonJigAuditValue(check, params, unit, model);
  }
  if (model.viewer === "bandsaw-sled-v1") {
    return getBandsawSledAuditValue(check, params, unit, model);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableAuditValue(check, params, unit);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableAuditValue(check, params, unit);
  }

  if (model.viewer !== "weighted-paper-towel-holder-v1") {
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
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterParameterLimits(model, params, key);
  }
  if (model.viewer === "concentric-tube-jig-v1") {
    return getConcentricTubeJigParameterLimits(model, params, key);
  }
  if (model.viewer === "drill-bit-holder-v1") {
    return getDrillBitHolderParameterLimits(model, params, key);
  }
  if (model.viewer === "router-mortise-jig-v1") {
    return getRouterMortiseJigParameterLimits(model, params, key);
  }
  if (model.viewer === "router-tenon-jig-v1") {
    return getRouterTenonJigParameterLimits(model, params, key);
  }
  if (model.viewer === "bandsaw-sled-v1") {
    return getBandsawSledParameterLimits(model, params, key);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableParameterLimits(model, params, key);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableParameterLimits(model, params, key);
  }

  if (model.viewer === "weighted-paper-towel-holder-v1") {
    return getHolderParameterLimits(model, params, key);
  }

  return getTrayParameterLimits(model, params, key);
}

export function getModelDimensions(
  model: ModelDefinition,
  params: ModelParams,
): ModelDimensions {
  if (model.viewer === "door-lock-adapter-v1") {
    return getDoorLockAdapterDimensions(params);
  }
  if (model.viewer === "concentric-tube-jig-v1") {
    return getConcentricTubeJigDimensions(params, model);
  }
  if (model.viewer === "drill-bit-holder-v1") {
    return getDrillBitHolderDimensions(params, model);
  }
  if (model.viewer === "router-mortise-jig-v1") {
    return getRouterMortiseJigDimensions(params, model);
  }
  if (model.viewer === "router-tenon-jig-v1") {
    return getRouterTenonJigDimensions(params, model);
  }
  if (model.viewer === "bandsaw-sled-v1") {
    return getBandsawSledDimensions(params, model);
  }
  if (model.viewer === "dining-table-v1") {
    return getDiningTableDimensions(params);
  }
  if (model.viewer === "hover-dining-table-v1") {
    return getHoverDiningTableDimensions(params);
  }

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
  if (
    model.viewer === "dining-table-v1" ||
    model.viewer === "hover-dining-table-v1"
  ) {
    return [
      `Scale 1:${getParam(params, "mockScale").toFixed(0)}`,
      `Length ${formatLength(getParam(params, "tableLength"), unit)}`,
      `Width ${formatLength(getParam(params, "tableWidth"), unit)}`,
      `Height ${formatLength(getParam(params, "overallHeight"), unit)}`,
    ];
  }
  if (model.viewer === "drill-bit-holder-v1") {
    return ["bitClearance", "bitSpacing", "holderHeight", "holeDepth"].map(
      (key) => {
        const parameter = getParameter(model, key);
        const label = parameter.statusLabel ?? parameter.label;
        return `${label} ${formatLength(getParam(params, key), unit)}`;
      },
    );
  }
  if (model.viewer === "router-mortise-jig-v1") {
    const width = getParam(params, "mortiseWidth");
    const length = getParam(params, "mortiseLength");
    const openingWidth =
      width +
      getParam(params, "guideBushingDiameter") -
      getParam(params, "routerBitDiameter") +
      getParam(params, "templateWiggle");
    const openingLength =
      length +
      getParam(params, "guideBushingDiameter") -
      getParam(params, "routerBitDiameter") +
      getParam(params, "templateWiggle");
    return [
      `Mortise ${formatLength(width, unit)} × ${formatLength(length, unit)}`,
      `Opening ${formatLength(openingWidth, unit)} × ${formatLength(openingLength, unit)}`,
      `Lower jaws ${formatLength(getParam(params, "stockThickness"), unit)} board + ${formatLength(getParam(params, "workpieceWiggle"), unit)} wiggle`,
      getParam(params, "assemblyView") >= 1.5 ? "Centering fixture" : getParam(params, "assemblyView") >= 0.5 ? "Positioning bridge" : "Main jig",
      "M5 heat-set inserts × 12",
    ];
  }
  if (model.viewer === "router-tenon-jig-v1") {
    return [
      `Tenon ${formatLength(getParam(params, "tenonThickness"), unit)} T × ${formatLength(getParam(params, "tenonWidth"), unit)} W × ${formatLength(getParam(params, "tenonLength"), unit)} L`,
      `Bearing bit ${formatLength(getParam(params, "routerCutterDiameter"), unit)} cutter / ${formatLength(getParam(params, "guideBearingDiameter"), unit)} bearing`,
      `Stock ${formatLength(getParam(params, "workpieceWidth"), unit)} × ${formatLength(getParam(params, "workpieceThickness"), unit)}`,
      `${getParam(params, "activeGuidePair") >= 0.5 ? "Thickness / edge" : "Width / cheek"} guide pair`,
      "M5 heat-set inserts × 8",
    ];
  }
  if (model.viewer === "bandsaw-sled-v1") {
    const spec = getBandsawSledSpec(params, model);
    return [
      `Wood base ${formatLength(spec.baseWidth, unit)} × ${formatLength(spec.baseDepth, unit)} × ${formatLength(spec.baseThickness, unit)}`,
      `Wood fence ${formatLength(spec.fenceWidth, unit)} × ${formatLength(spec.fenceHeight, unit)}`,
      `Fence setback ${formatLength(spec.fencePosition, unit)}`,
      `Bracket ${formatLength(spec.bracketDepth, unit)} · gusset ${formatLength(spec.bracketGussetDepth, unit)} (${(spec.bracketGussetLengthRatio * 100).toFixed(1).replace(/\.0$/, "")}%)`,
      "Printed brackets × 2 · lock knobs × 2",
      "M5 heat-set inserts × 4 · M6 wood inserts × 2",
    ];
  }
  return model.parameters.slice(0, 4).map((parameter) => {
    const label = parameter.statusLabel ?? parameter.label;
    return `${label} ${formatLength(getParam(params, parameter.key), unit)}`;
  });
}
