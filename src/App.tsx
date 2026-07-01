import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Focus,
  LayoutDashboard,
  Moon,
  RotateCcw,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  forwardRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  LibraryDashboard,
  LibraryUnavailableMessage,
  SaveForkControls,
  type CatalogSeedModel,
  type SavedLibraryVersion,
} from "./LibraryPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import type { Id } from "../convex/_generated/dataModel";

type ModelParams = Record<string, number>;
type CoreViewMode = "surface" | "fill" | "section";
type LengthUnit = "mm" | "cm" | "in";
type RenderMode = "solid" | "xray" | "wire";
type ThemeMode = "light" | "dark";
type ViewPreset = "iso" | "top" | "xEdge" | "yEdge";
type SupportedViewer = "weighted-paper-towel-holder-v1" | "japandi-tray-v1";

type ViewerHandle = {
  exportStl: () => void;
  getStlBlob: () => Blob | null;
  resetCamera: () => void;
  setView: (preset: ViewPreset) => void;
};

type AuditStatus = "pass" | "warn";

type AuditItem = {
  label: string;
  value: string;
  status: AuditStatus;
};

type NumberLimits = {
  min: number;
  max: number;
  step: number;
};

type ModelParameter = {
  key: string;
  label: string;
  statusLabel?: string;
  default: number;
  limits: NumberLimits;
};

type AuditCheckDefinition = {
  key: string;
  label: string;
  minMiddleHeightMm?: number;
  minSandMassKg?: number;
  minSandVolumeCc?: number;
};

type ModelScript = {
  name: string;
  path: string;
  command: string;
  description?: string;
};

type HolderGeometry = {
  originalHeight: number;
  originalDiameter: number;
  mainAxis: {
    x: number;
    y: number;
    z?: number;
  };
  fixedCoreRadius: number;
  outerMoveStartRadius: number;
  bottomLockedHeight: number;
  topLockedHeight: number;
  centerTubeOuterDiameter: number;
  centerTubeInnerDiameter: number;
  tubeToHolderDiameterClearance: number;
  centerTubeOriginalTop: number;
  centerTubeTopClearance: number;
  sandBottomHeight: number;
  sandHeadspace: number;
  sandDensityGramsPerCc: number;
};

type TrayGeometry = {
  originalLength: number;
  originalWidth: number;
  originalHeight: number;
  mainAxis: {
    x: number;
    y: number;
    z: number;
  };
  originalFloorThickness: number;
  originalRibRelief: number;
  minimumWallHeight: number;
  minimumFloorThickness: number;
  minimumRibRelief: number;
  maximumRibRelief: number;
};

type BaseModelDefinition = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  viewer: SupportedViewer;
  stl: {
    fileName: string;
    sourceName: string;
    units: "mm";
    url: string;
  };
  export: {
    filePrefix: string;
  };
  parameters: ModelParameter[];
  audit: {
    toleranceMm: number;
    dimensionTargets: string[];
    invariants: string[];
    checks: AuditCheckDefinition[];
  };
  scripts: ModelScript[];
};

type HolderModelDefinition = BaseModelDefinition & {
  viewer: "weighted-paper-towel-holder-v1";
  geometry: HolderGeometry;
};

type TrayModelDefinition = BaseModelDefinition & {
  viewer: "japandi-tray-v1";
  geometry: TrayGeometry;
};

type ModelDefinition = HolderModelDefinition | TrayModelDefinition;

type ModelCatalogEntry = {
  id: string;
  name: string;
  configUrl: string;
};

type ModelCatalog = {
  version: number;
  models: ModelCatalogEntry[];
};

const CATALOG_URL = "/models/index.json";
const PARAM_QUERY_KEYS = [
  "height",
  "diameter",
  "tubeDiameter",
  "length",
  "width",
  "floorThickness",
  "ribRelief",
];
const SIDEBAR_WIDTH_KEY = "3d-prints:sidebar-width";
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 620;
const SIDEBAR_DEFAULT_WIDTH = 390;

const UNIT_OPTIONS: Record<
  LengthUnit,
  {
    label: string;
    name: string;
    mmPerUnit: number;
    digits: number;
  }
> = {
  mm: { label: "mm", name: "millimeters", mmPerUnit: 1, digits: 1 },
  cm: { label: "cm", name: "centimeters", mmPerUnit: 10, digits: 2 },
  in: { label: "in", name: "inches", mmPerUnit: 25.4, digits: 2 },
};

const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  solid: "Solid",
  xray: "X-Ray",
  wire: "Wire",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isLengthUnit(value: string | null): value is LengthUnit {
  return value === "mm" || value === "cm" || value === "in";
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getInitialUnit(): LengthUnit {
  const unit = new URLSearchParams(window.location.search).get("unit");
  return isLengthUnit(unit) ? unit : "mm";
}

function getInitialTheme(): ThemeMode {
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (isThemeMode(theme)) {
    return theme;
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredSidebarWidth() {
  const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(storedWidth)) {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  return clamp(storedWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function toUnit(valueMm: number, unit: LengthUnit) {
  return valueMm / UNIT_OPTIONS[unit].mmPerUnit;
}

function fromUnit(value: number, unit: LengthUnit) {
  return value * UNIT_OPTIONS[unit].mmPerUnit;
}

function formatLength(valueMm: number, unit: LengthUnit, digits?: number) {
  const option = UNIT_OPTIONS[unit];
  if (unit === "in") {
    return `${formatFractionalInches(toUnit(valueMm, unit))} ${option.label}`;
  }
  return `${toUnit(valueMm, unit).toFixed(digits ?? option.digits)} ${
    option.label
  }`;
}

function formatSignedLength(valueMm: number, unit: LengthUnit) {
  const normalized = Math.abs(valueMm) < 0.05 ? 0 : valueMm;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatLength(normalized, unit)}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function formatFractionalInches(valueIn: number, denominator = 8) {
  const sign = valueIn < 0 ? "-" : "";
  const absoluteValue = Math.abs(valueIn);
  let whole = Math.floor(absoluteValue);
  let numerator = Math.round((absoluteValue - whole) * denominator);

  if (numerator === denominator) {
    whole += 1;
    numerator = 0;
  }

  if (numerator === 0) {
    return `${sign}${whole}`;
  }

  const divisor = greatestCommonDivisor(numerator, denominator);
  const fraction = `${numerator / divisor}/${denominator / divisor}`;
  return whole > 0 ? `${sign}${whole} ${fraction}` : `${sign}${fraction}`;
}

function formatLengthInput(valueMm: number, unit: LengthUnit) {
  if (unit === "in") {
    return formatFractionalInches(toUnit(valueMm, unit));
  }

  return toUnit(valueMm, unit).toFixed(UNIT_OPTIONS[unit].digits);
}

function parseFractionalNumber(rawValue: string) {
  const cleaned = rawValue
    .toLowerCase()
    .replace(/inches|inch|in|cm|mm|["']/g, "")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bths?\b/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  let total = 0;
  for (const part of cleaned.split(" ")) {
    if (!part) {
      continue;
    }
    if (part.includes("/")) {
      const [numerator, denominator] = part.split("/").map(Number);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return null;
      }
      total += numerator / denominator;
    } else {
      const parsed = Number(part);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      total += parsed;
    }
  }

  return total;
}

function parseLengthInput(rawValue: string, unit: LengthUnit) {
  const cleaned = rawValue
    .toLowerCase()
    .replace(/inches|inch|in|cm|mm|["']/g, "")
    .trim();
  const parsed = unit === "in" ? parseFractionalNumber(rawValue) : Number(cleaned);
  if (!cleaned) {
    return null;
  }
  if (parsed === null || !Number.isFinite(parsed)) {
    return null;
  }
  return fromUnit(parsed, unit);
}

function getParameter(model: ModelDefinition, key: string) {
  const parameter = model.parameters.find((entry) => entry.key === key);
  if (!parameter) {
    throw new Error(`${model.id} is missing parameter "${key}"`);
  }
  return parameter;
}

function getParam(params: ModelParams, key: string) {
  const value = params[key];
  if (!Number.isFinite(value)) {
    throw new Error(`Missing parameter value "${key}"`);
  }
  return value;
}

function getDefaultParams(model: ModelDefinition): ModelParams {
  return Object.fromEntries(
    model.parameters.map((parameter) => [parameter.key, parameter.default]),
  );
}

function getParamsFromUrl(model: ModelDefinition) {
  const searchParams = new URLSearchParams(window.location.search);
  const params = getDefaultParams(model);

  if (searchParams.get("model") !== model.id) {
    return params;
  }

  for (const parameter of model.parameters) {
    const value = searchParams.get(parameter.key);
    if (value === null) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      params[parameter.key] = clamp(
        parsed,
        parameter.limits.min,
        parameter.limits.max,
      );
    }
  }

  return params;
}

function writeUrlState({
  modelId,
  params,
  theme,
  unit,
}: {
  modelId: string;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
}) {
  const url = new URL(window.location.href);
  url.searchParams.set("model", modelId);
  url.searchParams.set("unit", unit);
  url.searchParams.set("theme", theme);

  for (const key of PARAM_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  for (const [key, value] of Object.entries(params)) {
    if (Number.isFinite(value)) {
      url.searchParams.set(key, Number(value.toFixed(3)).toString());
    }
  }

  window.history.replaceState(null, "", url);
}

function writeDashboardUrlState({
  theme,
  unit,
}: {
  theme: ThemeMode;
  unit: LengthUnit;
}) {
  const url = new URL(window.location.href);
  url.searchParams.delete("model");
  url.searchParams.set("unit", unit);
  url.searchParams.set("theme", theme);

  for (const key of PARAM_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  window.history.replaceState(null, "", url);
}

function getParameterLimits(
  model: ModelDefinition,
  params: ModelParams,
  key: string,
) {
  const limits = { ...getParameter(model, key).limits };

  if (model.viewer === "weighted-paper-towel-holder-v1" && key === "diameter") {
    const clearance = model.geometry.tubeToHolderDiameterClearance;
    limits.min = Math.max(limits.min, params.tubeDiameter + clearance);
  }

  if (model.viewer === "weighted-paper-towel-holder-v1" && key === "tubeDiameter") {
    const clearance = model.geometry.tubeToHolderDiameterClearance;
    limits.max = Math.min(limits.max, params.diameter - clearance);
  }

  if (model.viewer === "japandi-tray-v1" && key === "floorThickness") {
    limits.max = Math.min(limits.max, getParam(params, "height") - 1);
  }

  return limits;
}

function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  axis: { x: number; y: number; z?: number },
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute("position");
  const normalized = new Float32Array(sourcePosition.count * 3);

  for (let index = 0; index < sourcePosition.count; index += 1) {
    normalized[index * 3] = sourcePosition.getX(index) - axis.x;
    normalized[index * 3 + 1] = sourcePosition.getY(index) - axis.y;
    normalized[index * 3 + 2] = sourcePosition.getZ(index) - (axis.z ?? 0);
  }

  source.setAttribute("position", new THREE.BufferAttribute(normalized.slice(), 3));
  source.computeVertexNormals();
  source.computeBoundingBox();
  source.computeBoundingSphere();

  return {
    geometry: source,
    basePositions: normalized,
  };
}

function applyHolderMorph(
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

function applyTrayMorph(
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

function updateHolderGuide(mesh: THREE.Mesh, params: ModelParams) {
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

function updateTrayGuide(mesh: THREE.Mesh, params: ModelParams) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(length, width, height);
  mesh.rotation.set(0, 0, 0);
  mesh.position.set(0, 0, height / 2);
}

function getCenterTubeTop(params: ModelParams, model: HolderModelDefinition) {
  return getParam(params, "height") - model.geometry.centerTubeTopClearance;
}

function getDomeBase(params: ModelParams, model: HolderModelDefinition) {
  return getCenterTubeTop(params, model) - getParam(params, "tubeDiameter") / 2;
}

function getTubeWallThickness(model: HolderModelDefinition) {
  return (
    (model.geometry.centerTubeOuterDiameter -
      model.geometry.centerTubeInnerDiameter) /
    2
  );
}

function getSandChamberDiameter(params: ModelParams, model: HolderModelDefinition) {
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

function getSandVolumeCc(params: ModelParams, model: HolderModelDefinition) {
  const radius = getSandChamberDiameter(params, model) / 2;
  return (Math.PI * radius * radius * getSandHeight(params, model)) / 1000;
}

function createRoundedTopGeometry(
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

function createSandPreviewGeometry(
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

function updateWeightedCore(
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

function applyRenderOptions(
  mainMaterial: THREE.MeshStandardMaterial,
  secondaryMaterial: THREE.MeshStandardMaterial | null,
  sandMesh: THREE.Mesh | null,
  guideMesh: THREE.Mesh,
  coreMode: CoreViewMode,
  renderMode: RenderMode,
  model: ModelDefinition,
) {
  const isWeightedHolder = model.viewer === "weighted-paper-towel-holder-v1";
  const isCoreSection = isWeightedHolder && coreMode === "section";
  const isCoreFill = isWeightedHolder && coreMode === "fill";
  const isWireframe = renderMode === "wire" || isCoreSection;
  const isTransparent = renderMode !== "solid" || isCoreFill || isCoreSection;
  const opacity = (() => {
    if (isWireframe) {
      return 0.32;
    }
    if (renderMode === "xray") {
      return isCoreFill ? 0.42 : 0.55;
    }
    if (isCoreFill) {
      return 0.62;
    }
    return 1;
  })();

  const materials = secondaryMaterial
    ? [mainMaterial, secondaryMaterial]
    : [mainMaterial];
  materials.forEach((material) => {
    material.transparent = isTransparent;
    material.opacity = opacity;
    material.wireframe = isWireframe;
    material.depthWrite = !isTransparent;
    material.needsUpdate = true;
  });
  if (sandMesh) {
    sandMesh.visible = isWeightedHolder && coreMode !== "surface";
  }
  guideMesh.visible = renderMode !== "solid" || isCoreSection;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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

function getHolderAuditValue(
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

function getTrayAuditValue(
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

function buildAuditItems(
  params: ModelParams,
  unit: LengthUnit,
  model: ModelDefinition,
): AuditItem[] {
  return model.audit.checks.map((check) =>
    getAuditValue(check, params, unit, model),
  );
}

function getModelDimensions(model: ModelDefinition, params: ModelParams) {
  if (model.viewer === "weighted-paper-towel-holder-v1") {
    const diameter = getParam(params, "diameter");
    return {
      length: diameter,
      width: diameter,
      height: getParam(params, "height"),
    };
  }

  return {
    length: getParam(params, "length"),
    width: getParam(params, "width"),
    height: getParam(params, "height"),
  };
}

function getStatusItems(
  model: ModelDefinition,
  params: ModelParams,
  unit: LengthUnit,
) {
  return model.parameters.slice(0, 4).map((parameter) => {
    const label = parameter.statusLabel ?? parameter.label;
    return `${label} ${formatLength(getParam(params, parameter.key), unit)}`;
  });
}

function getExportFileName(model: ModelDefinition, params: ModelParams) {
  const suffix = model.parameters
    .slice(0, 5)
    .map((parameter) => `${parameter.key}-${getParam(params, parameter.key).toFixed(1)}`)
    .join("-");

  return `${model.export.filePrefix}-${suffix}.stl`;
}

const HolderViewer = forwardRef<
  ViewerHandle,
  {
    model: ModelDefinition;
    params: ModelParams;
    coreViewMode: CoreViewMode;
    renderMode: RenderMode;
    showOriginal: boolean;
    theme: ThemeMode;
    unit: LengthUnit;
  }
>(function HolderViewer(
  { model, params, coreViewMode, renderMode, showOriginal, theme, unit },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const mainMeshRef = useRef<THREE.Mesh | null>(null);
  const domeMeshRef = useRef<THREE.Mesh | null>(null);
  const sandMeshRef = useRef<THREE.Mesh | null>(null);
  const ghostMeshRef = useRef<THREE.Mesh | null>(null);
  const guideMeshRef = useRef<THREE.Mesh | null>(null);
  const mainMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const domeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const mainBaseRef = useRef<Float32Array | null>(null);
  const animationRef = useRef<number | null>(null);
  const latestParamsRef = useRef(params);
  const latestCoreViewModeRef = useRef(coreViewMode);
  const latestRenderModeRef = useRef(renderMode);
  const latestShowOriginalRef = useRef(showOriginal);

  const setCameraView = useCallback((preset: ViewPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const currentParams = latestParamsRef.current;
    const dimensions = getModelDimensions(model, currentParams);
    const distance = Math.max(
      dimensions.height * 2.2,
      dimensions.length * 1.55,
      dimensions.width * 2.25,
    );
    const target = new THREE.Vector3(
      0,
      0,
      model.viewer === "japandi-tray-v1"
        ? dimensions.height * 0.25
        : dimensions.height * 0.42,
    );
    const edgeViewZ = target.z + dimensions.height * 0.2;

    camera.up.set(0, 0, 1);
    if (preset === "top") {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, target.z + Math.max(distance, dimensions.height * 10));
    } else if (preset === "xEdge") {
      camera.position.set(0, -distance, edgeViewZ);
    } else if (preset === "yEdge") {
      camera.position.set(distance, 0, edgeViewZ);
    } else if (model.viewer === "japandi-tray-v1") {
      camera.position.set(distance * 0.7, -distance * 0.78, distance * 0.52);
    } else {
      camera.position.set(distance * 0.72, -distance, dimensions.height * 1.25);
    }

    camera.near = 0.5;
    camera.far = 2000;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.update();
  }, [model]);

  const resetCamera = useCallback(() => {
    setCameraView("iso");
  }, [setCameraView]);

  const zoomBy = useCallback((scale: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const nextDistance = Math.min(
      controls.maxDistance,
      Math.max(controls.minDistance, offset.length() * scale),
    );
    offset.setLength(nextDistance);
    camera.position.copy(controls.target).add(offset);
    camera.updateProjectionMatrix();
    controls.update();
  }, []);

  const panBy = useCallback((xDirection: number, yDirection: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    camera.updateMatrixWorld();
    const distance = camera.position.distanceTo(controls.target);
    const visibleHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    const panStep = visibleHeight * 0.12;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const movement = right
      .multiplyScalar(xDirection * panStep)
      .add(up.multiplyScalar(yDirection * panStep));

    camera.position.add(movement);
    controls.target.add(movement);
    controls.update();
  }, []);

  const updateMeshes = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    const sandMesh = sandMeshRef.current;
    const ghostMesh = ghostMeshRef.current;
    const guideMesh = guideMeshRef.current;
    const holderMaterial = mainMaterialRef.current;
    const domeMaterial = domeMaterialRef.current;
    const base = mainBaseRef.current;
    if (
      !mainMesh ||
      !ghostMesh ||
      !guideMesh ||
      !holderMaterial ||
      !base
    ) {
      return;
    }

    if (model.viewer === "weighted-paper-towel-holder-v1") {
      if (!domeMesh || !sandMesh || !domeMaterial) {
        return;
      }
      applyHolderMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateHolderGuide(guideMesh, latestParamsRef.current);
      updateWeightedCore(domeMesh, sandMesh, latestParamsRef.current, model);
    } else {
      applyTrayMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateTrayGuide(guideMesh, latestParamsRef.current);
    }

    applyRenderOptions(
      holderMaterial,
      domeMaterial,
      sandMesh,
      guideMesh,
      latestCoreViewModeRef.current,
      latestRenderModeRef.current,
      model,
    );

    ghostMesh.visible = latestShowOriginalRef.current;
  }, [model]);

  const createStlBlob = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    if (!mainMesh) {
      return null;
    }

    const group = new THREE.Group();
    const holder = new THREE.Mesh(mainMesh.geometry.clone());
    holder.name = `${model.id}-body`;
    group.add(holder);

    let roundedTop: THREE.Mesh | null = null;
    if (model.viewer === "weighted-paper-towel-holder-v1" && domeMesh) {
      roundedTop = new THREE.Mesh(domeMesh.geometry.clone());
      roundedTop.name = `${model.id}-rounded-weighted-center-tube-top`;
      group.add(roundedTop);
    }
    group.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    const blob = new Blob([result], { type: "model/stl" });

    holder.geometry.dispose();
    roundedTop?.geometry.dispose();

    return blob;
  }, [model]);

  const exportStl = useCallback(() => {
    const blob = createStlBlob();
    if (!blob) {
      return;
    }
    downloadBlob(blob, getExportFileName(model, latestParamsRef.current));
  }, [createStlBlob, model]);

  useImperativeHandle(
    ref,
    () => ({
      exportStl,
      getStlBlob: createStlBlob,
      resetCamera,
      setView: setCameraView,
    }),
    [createStlBlob, exportStl, resetCamera, setCameraView],
  );

  useEffect(() => {
    latestParamsRef.current = params;
    latestCoreViewModeRef.current = coreViewMode;
    latestRenderModeRef.current = renderMode;
    latestShowOriginalRef.current = showOriginal;
    updateMeshes();
  }, [params, coreViewMode, renderMode, showOriginal, updateMeshes]);

  useEffect(() => {
    resetCamera();
  }, [params, resetCamera]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(
        theme === "dark" ? "#111510" : "#f4f7f2",
      );
    }
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme === "dark" ? "#111510" : "#f4f7f2");
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.append(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 80;
    controls.maxDistance = 1400;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#fff8ec", "#a2aaa0", 2.1));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
    keyLight.position.set(180, -160, 260);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#d7fff4", 0.8);
    fillLight.position.set(-220, 140, 120);
    scene.add(fillLight);

    const initialDimensions = getModelDimensions(model, latestParamsRef.current);
    const gridSize = Math.max(
      initialDimensions.length * 1.8,
      initialDimensions.width * 1.8,
      260,
    );
    const grid = new THREE.GridHelper(gridSize, 26, "#9da88d", "#cfd7c8");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.2;
    scene.add(grid);

    const initialParams = latestParamsRef.current;
    const guideGeometry =
      model.viewer === "weighted-paper-towel-holder-v1"
        ? new THREE.CylinderGeometry(
            getParam(initialParams, "diameter") / 2,
            getParam(initialParams, "diameter") / 2,
            getParam(initialParams, "height"),
            128,
            1,
            true,
          )
        : new THREE.BoxGeometry(
            getParam(initialParams, "length"),
            getParam(initialParams, "width"),
            getParam(initialParams, "height"),
          );
    const guide = new THREE.Mesh(
      guideGeometry,
      new THREE.MeshBasicMaterial({
        color: "#c4934b",
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      }),
    );
    if (model.viewer === "weighted-paper-towel-holder-v1") {
      guide.rotation.x = Math.PI / 2;
    }
    guideMeshRef.current = guide;
    scene.add(guide);

    let disposed = false;
    const loader = new STLLoader();

    loader
      .loadAsync(model.stl.url)
      .then((mainGeometry) => {
        if (disposed) {
          mainGeometry.dispose();
          return;
        }

        const normalizedMain = normalizeGeometry(
          mainGeometry,
          model.geometry.mainAxis,
        );
        mainBaseRef.current = normalizedMain.basePositions;

        const mainMaterial = new THREE.MeshStandardMaterial({
          color: model.viewer === "japandi-tray-v1" ? "#d8c7aa" : "#111313",
          roughness: 0.78,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
        mainMaterialRef.current = mainMaterial;
        const domeMaterial = new THREE.MeshStandardMaterial({
          color: "#111313",
          roughness: 0.72,
          metalness: 0.06,
          side: THREE.DoubleSide,
        });
        domeMaterialRef.current = domeMaterial;
        const sandMaterial = new THREE.MeshStandardMaterial({
          color: "#c4934b",
          roughness: 0.86,
          metalness: 0,
          transparent: true,
          opacity: 0.9,
        });
        const ghostMaterial = new THREE.MeshBasicMaterial({
          color: "#7b7f78",
          transparent: true,
          opacity: 0.22,
          wireframe: true,
        });

        const mainMesh = new THREE.Mesh(normalizedMain.geometry, mainMaterial);
        mainMesh.name = `${model.id}-adjustable-body`;
        scene.add(mainMesh);
        mainMeshRef.current = mainMesh;

        if (model.viewer === "weighted-paper-towel-holder-v1") {
          const domeMesh = new THREE.Mesh(
            createRoundedTopGeometry(latestParamsRef.current, model),
            domeMaterial,
          );
          domeMesh.name = `${model.id}-rounded-weighted-center-tube-top`;
          scene.add(domeMesh);
          domeMeshRef.current = domeMesh;

          const sandMesh = new THREE.Mesh(
            createSandPreviewGeometry(latestParamsRef.current, model),
            sandMaterial,
          );
          sandMesh.name = `${model.id}-sand-fill-preview`;
          sandMesh.visible = latestCoreViewModeRef.current !== "surface";
          scene.add(sandMesh);
          sandMeshRef.current = sandMesh;
        }

        const ghostMesh = new THREE.Mesh(
          normalizedMain.geometry.clone(),
          ghostMaterial,
        );
        ghostMesh.name = `${model.id}-original-overlay`;
        ghostMesh.visible = latestShowOriginalRef.current;
        scene.add(ghostMesh);
        ghostMeshRef.current = ghostMesh;

        updateMeshes();
        resetCamera();

        mainGeometry.dispose();
      })
      .catch((error) => {
        console.error(`Unable to load STL for ${model.name}`, error);
      });

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose());
          } else {
            material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model, resetCamera, updateMeshes]);

  return (
    <div className="viewer" ref={containerRef}>
      <div className="viewer-status" data-testid="viewer-status">
        {getStatusItems(model, params, unit).map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{RENDER_MODE_LABELS[renderMode]}</span>
      </div>
      <div className="viewer-nav" aria-label="3D view controls">
        <div className="viewer-zoom-controls">
          <button
            aria-label="Zoom in"
            onClick={() => zoomBy(0.82)}
            title="Zoom in"
            type="button"
          >
            <ZoomIn aria-hidden="true" />
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => zoomBy(1.22)}
            title="Zoom out"
            type="button"
          >
            <ZoomOut aria-hidden="true" />
          </button>
        </div>
        <div className="viewer-pan-pad">
          <span />
          <button
            aria-label="Pan up"
            onClick={() => panBy(0, 1)}
            title="Pan up"
            type="button"
          >
            <ArrowUp aria-hidden="true" />
          </button>
          <span />
          <button
            aria-label="Pan left"
            onClick={() => panBy(-1, 0)}
            title="Pan left"
            type="button"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            aria-label="Center view"
            onClick={resetCamera}
            title="Center view"
            type="button"
          >
            <Focus aria-hidden="true" />
          </button>
          <button
            aria-label="Pan right"
            onClick={() => panBy(1, 0)}
            title="Pan right"
            type="button"
          >
            <ArrowRight aria-hidden="true" />
          </button>
          <span />
          <button
            aria-label="Pan down"
            onClick={() => panBy(0, -1)}
            title="Pan down"
            type="button"
          >
            <ArrowDown aria-hidden="true" />
          </button>
          <span />
        </div>
      </div>
    </div>
  );
});

function NumberControl({
  label,
  valueMm,
  limits,
  unit,
  onChange,
  onUnitChange,
}: {
  label: string;
  valueMm: number;
  limits: NumberLimits;
  unit: LengthUnit;
  onChange: (valueMm: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const unitId = `${id}-unit`;
  const unitOption = UNIT_OPTIONS[unit];
  const [draftValue, setDraftValue] = useState(() =>
    formatLengthInput(valueMm, unit),
  );
  const displayValue = Number(toUnit(valueMm, unit).toFixed(4));
  const displayMin = Number(toUnit(limits.min, unit).toFixed(4));
  const displayMax = Number(toUnit(limits.max, unit).toFixed(4));
  const displayStep = Number(toUnit(limits.step, unit).toFixed(4));
  const updateValue = (rawValue: string) => {
    const nextMm = parseLengthInput(rawValue, unit);
    if (nextMm === null) {
      return;
    }
    onChange(Math.min(limits.max, Math.max(limits.min, nextMm)));
  };

  useEffect(() => {
    setDraftValue(formatLengthInput(valueMm, unit));
  }, [unit, valueMm]);

  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row">
        <input
          id={id}
          type="range"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(event) => updateValue(event.currentTarget.value)}
        />
        <input
          aria-label={`${label} in ${unitOption.name}`}
          inputMode={unit === "in" ? "text" : "decimal"}
          type="text"
          value={draftValue}
          onBlur={() => setDraftValue(formatLengthInput(valueMm, unit))}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            updateValue(event.currentTarget.value);
          }}
        />
        <Select
          onValueChange={(value) => onUnitChange(value as LengthUnit)}
          value={unit}
        >
          <SelectTrigger
            aria-label={`${label} units`}
            className="unit-select-trigger"
            id={unitId}
            title={`${label} units`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(UNIT_OPTIONS).map(([value, option]) => (
              <SelectItem key={value} value={value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CoreViewControl({
  value,
  onChange,
}: {
  value: CoreViewMode;
  onChange: (value: CoreViewMode) => void;
}) {
  const options: { value: CoreViewMode; label: string }[] = [
    { value: "surface", label: "Surface" },
    { value: "fill", label: "Fill" },
    { value: "section", label: "Section" },
  ];

  return (
    <div className="segmented-control" aria-label="Weighted center view">
      {options.map((option) => (
        <button
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RenderModeControl({
  value,
  onChange,
}: {
  value: RenderMode;
  onChange: (value: RenderMode) => void;
}) {
  const options: { value: RenderMode; label: string }[] = [
    { value: "solid", label: RENDER_MODE_LABELS.solid },
    { value: "xray", label: RENDER_MODE_LABELS.xray },
    { value: "wire", label: RENDER_MODE_LABELS.wire },
  ];

  return (
    <div className="segmented-control" aria-label="Rendering mode">
      {options.map((option) => (
        <button
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OriginalOverlayToggle({
  checked,
  label = "Original STL",
  onChange,
}: {
  checked: boolean;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function AuditList({ items }: { items: AuditItem[] }) {
  return (
    <div className="audit-list">
      {items.map((item) => (
        <div className="audit-row" key={item.label}>
          <span className={`status-dot ${item.status}`} />
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: ThemeMode;
  onChange: (theme: ThemeMode) => void;
}) {
  const isDark = theme === "dark";
  return (
    <button
      aria-label={isDark ? "Use light theme" : "Use dark theme"}
      className="theme-toggle"
      onClick={() => onChange(isDark ? "light" : "dark")}
      title={isDark ? "Use light theme" : "Use dark theme"}
      type="button"
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section className="scene-panel loading-panel" aria-live="polite">
        <div>{message}</div>
      </section>
    </main>
  );
}

function StaticDashboard({
  actions,
  catalogModels,
  onOpenModel,
}: {
  actions?: ReactNode;
  catalogModels: CatalogSeedModel[];
  onOpenModel: (modelId: string) => void;
}) {
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>3D Prints</p>
          <h1>Model Library</h1>
        </div>
        {actions ? <div className="dashboard-actions">{actions}</div> : null}
      </header>

      <section className="dashboard-section" aria-labelledby="dashboard-models">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-models">Models</h2>
          <span>{catalogModels.length} available</span>
        </div>
        <div className="dashboard-grid">
          {catalogModels.map((modelEntry) => (
            <article className="dashboard-card" key={modelEntry.key}>
              <div>
                <strong>{modelEntry.name}</strong>
                <p>{modelEntry.description ?? "Parametric STL model"}</p>
              </div>
              <button onClick={() => onOpenModel(modelEntry.key)} type="button">
                Open
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="dashboard-forks">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-forks">Saved Versions And Forks</h2>
          <span>Convex not connected</span>
        </div>
        <div className="dashboard-list">
          <LibraryUnavailableMessage />
        </div>
      </section>
    </main>
  );
}

function WorkspaceHeader({
  activeVersionId,
  convexEnabled,
  exportFileName,
  model,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onOpenDashboard,
  onSavedVersion,
  onThemeChange,
}: {
  activeVersionId: Id<"versions"> | null;
  convexEnabled: boolean;
  exportFileName: string;
  model: ModelDefinition;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onOpenDashboard: () => void;
  onSavedVersion: (versionId: Id<"versions">) => void;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <button
          className="dashboard-link"
          onClick={onOpenDashboard}
          title="Open dashboard"
          type="button"
        >
          <LayoutDashboard aria-hidden="true" />
          Dashboard
        </button>
        <div>
          <p>{model.subtitle}</p>
          <h1>{model.name}</h1>
        </div>
      </div>
      <div className="workspace-actions">
        {convexEnabled ? (
          <SaveForkControls
            activeVersionId={activeVersionId}
            currentModel={{ id: model.id, name: model.name }}
            exportFileName={exportFileName}
            onCreateStlBlob={onCreateStlBlob}
            onSavedVersion={onSavedVersion}
            params={params}
            theme={theme}
            unit={unit}
          />
        ) : (
          <LibraryUnavailableMessage />
        )}
        <ThemeToggle onChange={onThemeChange} theme={theme} />
      </div>
    </header>
  );
}

function WorkspaceFooter({
  onExport,
  onFrame,
  onReset,
  onSetView,
}: {
  onExport: () => void;
  onFrame: () => void;
  onReset: () => void;
  onSetView: (preset: ViewPreset) => void;
}) {
  return (
    <footer className="workspace-footer" aria-label="Model actions">
      <div
        className="footer-control-group"
        role="group"
        aria-label="Orientation controls"
      >
        <span>Orientation</span>
        <button
          aria-label="Isometric view"
          onClick={() => onSetView("iso")}
          title="Isometric view"
          type="button"
        >
          3D
        </button>
        <button
          aria-label="Top view"
          onClick={() => onSetView("top")}
          title="Top view"
          type="button"
        >
          Top
        </button>
        <button
          aria-label="Align X edge to view"
          onClick={() => onSetView("xEdge")}
          title="Align X edge to view"
          type="button"
        >
          X
        </button>
        <button
          aria-label="Align Y edge to view"
          onClick={() => onSetView("yEdge")}
          title="Align Y edge to view"
          type="button"
        >
          Y
        </button>
      </div>

      <div
        className="footer-control-group footer-actions"
        role="group"
        aria-label="Model file actions"
      >
        <button onClick={onReset} title="Reset parameters" type="button">
          <RotateCcw aria-hidden="true" />
          Reset
        </button>
        <button onClick={onFrame} title="Frame model" type="button">
          <Focus aria-hidden="true" />
          Frame
        </button>
        <button
          className="primary-action"
          onClick={onExport}
          title="Export adjusted STL"
          type="button"
        >
          <Download aria-hidden="true" />
          Export
        </button>
      </div>
    </footer>
  );
}

function getRequestedModelId() {
  return new URLSearchParams(window.location.search).get("model") ?? "";
}

export default function App({
  convexEnabled = false,
}: {
  convexEnabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [model, setModel] = useState<ModelDefinition | null>(null);
  const [params, setParams] = useState<ModelParams | null>(null);
  const [loadError, setLoadError] = useState("");
  const [unit, setUnit] = useState<LengthUnit>(() => getInitialUnit());
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [sidebarWidth, setSidebarWidth] = useState(() => getStoredSidebarWidth());
  const [coreViewMode, setCoreViewMode] = useState<CoreViewMode>("surface");
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [showOriginal, setShowOriginal] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<Id<"versions"> | null>(
    null,
  );
  const viewerRef = useRef<ViewerHandle | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const response = await fetch(CATALOG_URL);
        if (!response.ok) {
          throw new Error(`Unable to load ${CATALOG_URL}`);
        }
        const nextCatalog = (await response.json()) as ModelCatalog;
        if (cancelled) {
          return;
        }
        setCatalog(nextCatalog);
        setSelectedModelId((current) => {
          if (current) {
            return current;
          }
          const requestedModelId = getRequestedModelId();
          if (!requestedModelId) {
            return "";
          }
          const requestedModel = nextCatalog.models.find(
            (entry) => entry.id === requestedModelId,
          );
          if (!requestedModel) {
            setLoadError(`Unknown model "${requestedModelId}"`);
            return "";
          }
          return requestedModel.id;
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalog) {
      return undefined;
    }

    if (!selectedModelId) {
      setModel(null);
      setParams(null);
      if (!getRequestedModelId()) {
        setLoadError("");
      }
      return undefined;
    }

    const entry = catalog.models.find((candidate) => candidate.id === selectedModelId);
    if (!entry) {
      setLoadError(`Unknown model "${selectedModelId}"`);
      return undefined;
    }

    const configUrl = entry.configUrl;
    let cancelled = false;
    async function loadModel() {
      try {
        setLoadError("");
        const response = await fetch(configUrl);
        if (!response.ok) {
          throw new Error(`Unable to load ${configUrl}`);
        }
        const nextModel = (await response.json()) as ModelDefinition;
        if (cancelled) {
          return;
        }
        setModel(nextModel);
        setParams(getParamsFromUrl(nextModel));
        setShowOriginal(false);
        setCoreViewMode("surface");
        setRenderMode("solid");
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [catalog, selectedModelId]);

  const auditItems = useMemo(() => {
    if (!model || !params) {
      return [];
    }
    return buildAuditItems(params, unit, model);
  }, [model, params, unit]);

  const catalogSeedModels = useMemo<CatalogSeedModel[]>(() => {
    if (!catalog) {
      return [];
    }

    return catalog.models.map((entry) => {
      const isCurrentModel = model?.id === entry.id;
      const seedModel: CatalogSeedModel = {
        key: entry.id,
        name: entry.name,
        configUrl: entry.configUrl,
      };
      if (isCurrentModel) {
        seedModel.description = model.description;
        seedModel.publicStlUrl = model.stl.url;
        seedModel.fileName = model.stl.fileName;
      }
      return seedModel;
    });
  }, [catalog, model]);

  useEffect(() => {
    if (!model || !params || !selectedModelId || model.id !== selectedModelId) {
      return;
    }

    writeUrlState({
      modelId: selectedModelId,
      params,
      theme,
      unit,
    });
  }, [model, params, selectedModelId, theme, unit]);

  const updateParam = (key: string, value: number) => {
    if (!model) {
      return;
    }
    setParams((current) => {
      if (!current) {
        return current;
      }
      const limits = getParameterLimits(model, current, key);
      return {
        ...current,
        [key]: Number(Math.min(limits.max, Math.max(limits.min, value)).toFixed(1)),
      };
    });
  };

  const resetParams = () => {
    if (model) {
      setParams(getDefaultParams(model));
    }
  };

  const openModel = (modelId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", modelId);
    url.searchParams.set("unit", unit);
    url.searchParams.set("theme", theme);
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);

    setActiveVersionId(null);
    setLoadError("");
    setModel(null);
    setParams(null);
    setSelectedModelId(modelId);
  };

  const openDashboard = () => {
    writeDashboardUrlState({ theme, unit });
    setActiveVersionId(null);
    setLoadError("");
    setModel(null);
    setParams(null);
    setSelectedModelId("");
  };

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    if (!selectedModelId) {
      writeDashboardUrlState({ theme: nextTheme, unit });
    }
  };

  const openLibraryVersion = (version: SavedLibraryVersion) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", version.modelKey);
    url.searchParams.set("unit", version.unit);
    url.searchParams.set("theme", version.theme);
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    for (const [key, value] of Object.entries(version.params)) {
      if (Number.isFinite(value)) {
        url.searchParams.set(key, Number(value.toFixed(3)).toString());
      }
    }
    window.history.replaceState(null, "", url);

    setUnit(version.unit);
    setTheme(version.theme);
    setActiveVersionId(version._id);

    if (model?.id === version.modelKey) {
      const nextParams = getDefaultParams(model);
      for (const parameter of model.parameters) {
        const value = version.params[parameter.key];
        if (Number.isFinite(value)) {
          nextParams[parameter.key] = clamp(
            value,
            parameter.limits.min,
            parameter.limits.max,
          );
        }
      }
      setParams(nextParams);
    }

    setSelectedModelId(version.modelKey);
  };

  const resizeSidebarBy = (delta: number) => {
    setSidebarWidth((currentWidth) =>
      clamp(
        currentWidth + delta,
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
      ),
    );
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const resize = (pointerEvent: PointerEvent) => {
      setSidebarWidth(
        clamp(
          window.innerWidth - pointerEvent.clientX,
          SIDEBAR_MIN_WIDTH,
          SIDEBAR_MAX_WIDTH,
        ),
      );
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("is-resizing-sidebar");
    };

    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  };

  if (loadError) {
    return <LoadingShell message={loadError} />;
  }

  if (!catalog) {
    return <LoadingShell message="Loading model library" />;
  }

  if (!selectedModelId) {
    const dashboardActions = (
      <ThemeToggle onChange={updateTheme} theme={theme} />
    );

    return convexEnabled ? (
      <LibraryDashboard
        actions={dashboardActions}
        catalogModels={catalogSeedModels}
        onOpenModel={openModel}
        onOpenVersion={openLibraryVersion}
      />
    ) : (
      <StaticDashboard
        actions={dashboardActions}
        catalogModels={catalogSeedModels}
        onOpenModel={openModel}
      />
    );
  }

  if (!model || !params) {
    return <LoadingShell message="Loading model" />;
  }

  return (
    <main
      className="workspace-shell"
      style={
        {
          "--inspector-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <WorkspaceHeader
        activeVersionId={activeVersionId}
        convexEnabled={convexEnabled}
        exportFileName={getExportFileName(model, params)}
        model={model}
        onCreateStlBlob={() => viewerRef.current?.getStlBlob() ?? null}
        onOpenDashboard={openDashboard}
        onSavedVersion={setActiveVersionId}
        onThemeChange={updateTheme}
        params={params}
        theme={theme}
        unit={unit}
      />

      <div className="app-shell">
        <section
          className="scene-panel"
          aria-label={`${model.name} model viewer`}
        >
          <HolderViewer
            coreViewMode={coreViewMode}
            key={model.id}
            model={model}
            params={params}
            ref={viewerRef}
            renderMode={renderMode}
            showOriginal={showOriginal}
            theme={theme}
            unit={unit}
          />
        </section>

        <div
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuenow={sidebarWidth}
          className="sidebar-resizer"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              resizeSidebarBy(20);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              resizeSidebarBy(-20);
            } else if (event.key === "Home") {
              event.preventDefault();
              setSidebarWidth(SIDEBAR_MAX_WIDTH);
            } else if (event.key === "End") {
              event.preventDefault();
              setSidebarWidth(SIDEBAR_MIN_WIDTH);
            }
          }}
          onPointerDown={startSidebarResize}
          role="separator"
          tabIndex={0}
        />

        <aside className="inspector" aria-label="Parameters and audit">
          <header className="inspector-header">
            <div>
              <p>Model controls</p>
              <h2>Parameters</h2>
            </div>
          </header>

          <div className="inspector-body">
            <section className="panel-section">
              <h2>Parameters</h2>
              {model.parameters.map((parameter) => (
                <NumberControl
                  key={parameter.key}
                  label={parameter.label}
                  limits={getParameterLimits(model, params, parameter.key)}
                  onChange={(value) => updateParam(parameter.key, value)}
                  onUnitChange={setUnit}
                  unit={unit}
                  valueMm={params[parameter.key]}
                />
              ))}
            </section>

            {model.viewer === "weighted-paper-towel-holder-v1" ? (
              <section className="panel-section">
                <h2>Weighted Center</h2>
                <CoreViewControl
                  onChange={setCoreViewMode}
                  value={coreViewMode}
                />
              </section>
            ) : null}

            <section className="panel-section">
              <h2>Rendering</h2>
              <RenderModeControl onChange={setRenderMode} value={renderMode} />
              <OriginalOverlayToggle
                checked={showOriginal}
                label={
                  model.viewer === "weighted-paper-towel-holder-v1"
                    ? "Original inlay"
                    : "Original STL"
                }
                onChange={setShowOriginal}
              />
            </section>

            <section className="panel-section">
              <h2>Audit</h2>
              <AuditList items={auditItems} />
            </section>
          </div>
        </aside>
      </div>

      <WorkspaceFooter
        onExport={() => viewerRef.current?.exportStl()}
        onFrame={() => viewerRef.current?.resetCamera()}
        onReset={resetParams}
        onSetView={(preset) => viewerRef.current?.setView(preset)}
      />
    </main>
  );
}
