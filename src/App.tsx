import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Focus,
  GitFork,
  Hand,
  Layers3,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useConvexConnectionState, useQuery } from "convex/react";
import {
  Component,
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
import { api } from "../convex/_generated/api";
import {
  filterLibraryModels,
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
import { HoverDiningTableCutList } from "./components/HoverDiningTableCutList";
import {
  applyHolderMorph,
  applyTrayMorph,
  buildAuditItems,
  createConcentricTubeJigGeometry,
  createDiningTableHardwareGeometries,
  createDiningTableWoodGeometry,
  createDoorLockAdapterGeometry,
  createHoverDiningTableExplodedParts,
  createHoverDiningTableGeometry,
  createRoundedTopGeometry,
  createSandChamberFloorGeometry,
  createSandPreviewGeometry,
  createSimpleBoxLidGeometries,
  createSimpleBoxLidPrintGeometries,
  createTrayDividerGeometries,
  createTrayStackingLipGeometry,
  getDefaultParams,
  getGridfinityUnitCount,
  getModelDimensions,
  getParam,
  getParameterLimits,
  getStatusItems,
  snapGridfinityDimension,
  updateDoorLockAdapterGuide,
  updateConcentricTubeJigGuide,
  updateDiningTableGuide,
  updateHoverDiningTableGuide,
  updateHolderGuide,
  updateTrayGuide,
  updateWeightedCore,
  type AuditItem,
  type LengthUnit,
  type ModelDefinition,
  type ModelParameter,
  type ModelParams,
  type NumberLimits,
} from "./models";
import {
  UNIT_OPTIONS,
  formatLengthInput,
  fromUnit,
  isLengthUnit,
  parseLengthInput,
  stepLengthInput,
  toUnit,
} from "./units";
import type { Id } from "../convex/_generated/dataModel";

type CoreViewMode = "surface" | "fill" | "section";
type RenderMode = "solid" | "xray" | "wire";
type ThemeMode = "light" | "dark";
type ViewPreset = "iso" | "top" | "bottom" | "xEdge" | "yEdge";
type AssemblyMode =
  | "box"
  | "stacked"
  | "lid"
  | "print-layout"
  | "assembled"
  | "exploded"
  | "cut-list";
type ViewerInteractionMode = "orbit" | "pan";

type ViewerHandle = {
  exportStl: () => void;
  exportLidStl: () => void;
  exportBoxAndLidStl: () => void;
  getStlBlob: () => Blob | null;
  resetCamera: () => void;
  setView: (preset: ViewPreset) => void;
};

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
const DEFAULT_MODEL_ID = "japandi-tray";
const DEFAULT_LENGTH_UNIT: LengthUnit = "in";
const PARAM_QUERY_KEYS = [
  "height",
  "diameter",
  "tubeDiameter",
  "tubeLength",
  "boxWidth",
  "boxLength",
  "notchHeight",
  "notchWidth",
  "notchLength",
  "cutoutWidth",
  "cutoutLength",
  "cutoutRotation",
  "firstDiameter",
  "increment",
  "tubeHeight",
  "boreDiameter",
  "mockScale",
  "tableLength",
  "tableWidth",
  "overallHeight",
  "topThickness",
  "tabletopCornerRadius",
  "topRoundoverRadius",
  "bottomRoundoverRadius",
  "legSize",
  "legCornerRadius",
  "legOuterCornerRadius",
  "legEdgeInset",
  "legGrooveEnabled",
  "legGrooveHeight",
  "legGrooveDepth",
  "revealOffset",
  "revealHeight",
  "revealDepth",
  "legTopRoundoverRadius",
  "legBottomRoundoverRadius",
  "plateSize",
  "plateThickness",
  "plateEdgeInset",
  "channelPosition1",
  "channelPosition2",
  "channelPosition3",
  "channelLength",
  "channelWidth",
  "channelDepth",
  "topEdgeRoll",
  "topEdgeTension",
  "sideOverhang",
  "endOverhang",
  "frameDepth",
  "frameSideWidth",
  "frameBottomRailHeight",
  "frameTopRailHeight",
  "frameBottomSpread",
  "frameOuterCornerRadius",
  "frameInnerCornerRadius",
  "frameOuterCurveTension",
  "frameInnerCurveTension",
  "frameEdgeRoundover",
  "upperBraceWidth",
  "upperBraceThickness",
  "upperBraceEndpointInset",
  "upperBraceEdgeRadius",
  "lowerBraceWidth",
  "lowerBraceThickness",
  "lowerBraceEndpointInset",
  "lowerBraceEdgeRadius",
  "halfLapClearance",
  // Retain superseded base keys so older shared URLs are cleaned on load.
  "hoverGap",
  "stretcherHeight",
  "stretcherThickness",
  "stretcherEdgeRadius",
  "supportPadLength",
  "supportPadWidth",
  "length",
  "width",
  "floorThickness",
  "ribRelief",
  "rotation",
];
const ANGLE_PARAM_KEYS = new Set(["rotation", "cutoutRotation"]);
const SCALAR_PARAM_KEYS = new Set([
  "dividerCount",
  "gridfinityCompatible",
  "legGrooveEnabled",
  "mockScale",
  "topEdgeTension",
  "frameOuterCurveTension",
  "frameInnerCurveTension",
]);
const CURVE_PARAM_KEYS = new Set([
  "topEdgeTension",
  "frameOuterCurveTension",
  "frameInnerCurveTension",
]);
const OPTION_PARAM_KEYS = new Set([
  "gridfinityCompatible",
  "legGrooveEnabled",
]);
const LEG_GROOVE_PARAM_KEYS = new Set([
  "legGrooveHeight",
  "legGrooveDepth",
]);
const DIVIDER_PARAM_KEYS = new Set([
  "dividerCount",
  "dividerPosition1",
  "dividerPosition2",
  "dividerPosition3",
  "dividerPosition4",
]);
const SIDEBAR_WIDTH_KEY = "3d-prints:sidebar-width";
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 620;
const SIDEBAR_DEFAULT_WIDTH = 390;
const INSPECTOR_COLLAPSED_WIDTH = 52;
const LIBRARY_SIDEBAR_WIDTH_KEY = "3d-prints:library-sidebar-width";
const THEME_STORAGE_KEY = "3d-prints:theme";
const ENABLE_TRAY_ORIENTATION_CONTROLS =
  import.meta.env.VITE_ENABLE_TRAY_ORIENTATION_CONTROLS === "true";
const LIBRARY_SIDEBAR_MIN_WIDTH = 240;
const LIBRARY_SIDEBAR_MAX_WIDTH = 460;
const LIBRARY_SIDEBAR_DEFAULT_WIDTH = 320;
const LIBRARY_SIDEBAR_COLLAPSED_WIDTH = 52;
const PLAYWRIGHT_TEST_VERSION_TITLE_PREFIX = "Playwright ";
const SCENE_BACKGROUND = {
  light: "#f7f8fb",
  dark: "#090c11",
} satisfies Record<ThemeMode, string>;
const SCENE_GRID_COLORS = {
  light: { center: "#c7ced8", grid: "#e2e6ec" },
  dark: { center: "#526073", grid: "#222a36" },
} satisfies Record<ThemeMode, { center: string; grid: string }>;
const STL_EXPORT_MIN_AREA_SQUARED = 1e-12;

const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  solid: "Solid",
  xray: "X-Ray",
  wire: "Wire",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createWoodTexture(
  renderer: THREE.WebGLRenderer,
  species: "oak" | "walnut",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(canvas.width, canvas.height);
  const walnut = species === "walnut";
  const base = walnut ? [92, 58, 39] : [180, 143, 97];
  let seed = walnut ? 0x77616c6e : 0x5f3759df;
  for (let y = 0; y < canvas.height; y += 1) {
    const broad = Math.sin(y * 0.072) * 5 + Math.sin(y * 0.019) * 7;
    for (let x = 0; x < canvas.width; x += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = ((seed & 255) / 255 - 0.5) * (walnut ? 7 : 0.8);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = base[0] + broad + noise;
      image.data[offset + 1] = base[1] + broad * 0.72 + noise;
      image.data[offset + 2] = base[2] + broad * 0.45 + noise;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  for (let y = 0; y < canvas.height; y += walnut ? 1 : 32) {
    const broad = Math.sin(y * 0.115) * 0.5 + Math.sin(y * 0.031) * 0.5;
    const lightness = (walnut ? 62 : 92) + Math.round(broad * 12);
    context.strokeStyle = walnut
      ? `rgba(${lightness + 20}, ${lightness + 3}, ${Math.max(20, lightness - 18)}, 0.22)`
      : `rgba(${lightness + 28}, ${lightness + 10}, ${Math.max(42, lightness - 22)}, 0.08)`;
    context.lineWidth = walnut ? (y % 23 === 0 ? 1.1 : 0.42) : 0.6;
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += 8) {
      const wave = Math.sin(x * 0.018 + y * 0.15) * 1.7 + Math.sin(x * 0.005) * 1.2;
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.stroke();
  }
  for (let index = 0; index < (walnut ? 38 : 8); index += 1) {
    const y = (index * 71) % canvas.height;
    context.strokeStyle = walnut
      ? "rgba(28, 14, 9, 0.22)"
      : "rgba(68, 41, 21, 0.07)";
    context.lineWidth = 0.65;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(280, y + 12, 700, y - 9, canvas.width, y + 3);
    context.stroke();
  }

  if (!walnut) {
    for (let index = 0; index < 40; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % canvas.width;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = seed % canvas.height;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const length = 2 + (seed % 13);
      context.strokeStyle = `rgba(63, 37, 19, ${0.04 + (seed % 4) / 100})`;
      context.lineWidth = 0.45 + (seed % 3) * 0.18;
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(x + length * 0.55, y - 0.65, x + length, y);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(walnut ? 3.2 : 1, walnut ? 1.6 : 0.7);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getInitialUnit(): LengthUnit {
  const unit = new URLSearchParams(window.location.search).get("unit");
  return isLengthUnit(unit) ? unit : DEFAULT_LENGTH_UNIT;
}

function getInitialTheme(): ThemeMode {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemeMode(storedTheme)) {
    return storedTheme;
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

function getStoredLibrarySidebarWidth() {
  const storedWidth = Number(
    window.localStorage.getItem(LIBRARY_SIDEBAR_WIDTH_KEY),
  );
  if (!Number.isFinite(storedWidth)) {
    return LIBRARY_SIDEBAR_DEFAULT_WIDTH;
  }
  return clamp(
    storedWidth,
    LIBRARY_SIDEBAR_MIN_WIDTH,
    LIBRARY_SIDEBAR_MAX_WIDTH,
  );
}

function parseUrlParam(
  rawValue: string,
  unit: LengthUnit,
  parameter: ModelParameter,
) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (ANGLE_PARAM_KEYS.has(parameter.key) || SCALAR_PARAM_KEYS.has(parameter.key)) {
    return parsed;
  }

  if (unit === "mm") {
    return parsed;
  }

  const displayMax = toUnit(parameter.limits.max, unit);
  const looksLikeLegacyMillimeters =
    parsed > displayMax && parsed <= parameter.limits.max;

  return looksLikeLegacyMillimeters ? parsed : fromUnit(parsed, unit);
}

function getParamsFromUrl(model: ModelDefinition) {
  const searchParams = new URLSearchParams(window.location.search);
  const params = getDefaultParams(model);
  const requestedUnit = searchParams.get("unit");
  const unit = isLengthUnit(requestedUnit)
    ? requestedUnit
    : DEFAULT_LENGTH_UNIT;

  if (searchParams.get("model") !== model.id) {
    return params;
  }

  for (const parameter of model.parameters) {
    const value = searchParams.get(parameter.key);
    if (value === null) {
      continue;
    }
    const parsed = parseUrlParam(value, unit, parameter);
    if (parsed !== null) {
      params[parameter.key] = clamp(
        parsed,
        parameter.limits.min,
        parameter.limits.max,
      );
    }
  }

  if (
    model.viewer === "simple-box-v1" &&
    params.gridfinityCompatible >= 0.5
  ) {
    for (const key of ["length", "width"] as const) {
      const limits = getParameterLimits(model, params, key);
      params[key] = snapGridfinityDimension(
        params[key],
        limits.min,
        limits.max,
        model.geometry.gridfinityGridSize,
      );
    }
  }

  if (model.viewer === "door-lock-adapter-v1") {
    for (const parameter of model.parameters) {
      const limits = getParameterLimits(model, params, parameter.key);
      params[parameter.key] = clamp(
        params[parameter.key],
        limits.min,
        limits.max,
      );
    }
  }

  if (model.viewer === "hover-dining-table-v1") {
    // Two passes settle limits whose valid ranges depend on other image-derived
    // dimensions (opening size, member width, radii, and reveal height).
    for (let pass = 0; pass < 2; pass += 1) {
      for (const parameter of model.parameters) {
        const limits = getParameterLimits(model, params, parameter.key);
        params[parameter.key] = clamp(
          params[parameter.key],
          limits.min,
          limits.max,
        );
      }
    }
  }

  return params;
}

function serializeUrlParam(key: string, valueMm: number, unit: LengthUnit) {
  if (CURVE_PARAM_KEYS.has(key)) {
    return Number(valueMm.toFixed(4)).toString();
  }
  if (ANGLE_PARAM_KEYS.has(key) || SCALAR_PARAM_KEYS.has(key)) {
    return Number(valueMm.toFixed(1)).toString();
  }

  const value = unit === "mm" ? valueMm : toUnit(valueMm, unit);
  return Number(value.toFixed(4)).toString();
}

function writeUrlState({
  modelId,
  params,
  unit,
}: {
  modelId: string;
  params: ModelParams;
  unit: LengthUnit;
}) {
  const url = new URL(window.location.href);
  url.searchParams.set("model", modelId);
  url.searchParams.set("unit", unit);
  url.searchParams.delete("theme");

  for (const key of PARAM_QUERY_KEYS) {
    url.searchParams.delete(key);
  }

  for (const [key, value] of Object.entries(params)) {
    if (Number.isFinite(value)) {
      url.searchParams.set(key, serializeUrlParam(key, value, unit));
    }
  }

  window.history.replaceState(null, "", url);
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

function orientDiningTableForSupportFreePrint(
  object: THREE.Object3D,
  height: number,
) {
  object.rotation.x = Math.PI;
  object.position.z = height;
}

function getExportFileName(model: ModelDefinition, params: ModelParams) {
  if (model.viewer === "dining-table-v1") {
    return `${model.export.filePrefix}-scale-1-${getParam(params, "mockScale").toFixed(0)}-length-${getParam(params, "tableLength").toFixed(1)}-width-${getParam(params, "tableWidth").toFixed(1)}.stl`;
  }
  if (model.viewer === "hover-dining-table-v1") {
    return `${model.export.filePrefix}-scale-1-${getParam(params, "mockScale").toFixed(0)}-length-${getParam(params, "tableLength").toFixed(1)}-width-${getParam(params, "tableWidth").toFixed(1)}.stl`;
  }
  const suffix = model.parameters
    .map(
      (parameter) => {
        const value = getParam(params, parameter.key);
        const formatted = model.viewer === "concentric-tube-jig-v1"
          ? value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
          : value.toFixed(1);
        return `${parameter.key}-${formatted}`;
      },
    )
    .join("-");

  return `${model.export.filePrefix}-${suffix}.stl`;
}

function createCleanExportGeometry(geometry: THREE.BufferGeometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position") as THREE.BufferAttribute;
  const cleanPositions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);

    const areaSquared = ab
      .subVectors(b, a)
      .cross(ac.subVectors(c, a))
      .lengthSq();
    if (areaSquared <= STL_EXPORT_MIN_AREA_SQUARED) {
      continue;
    }

    cleanPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  source.dispose();

  const cleanGeometry = new THREE.BufferGeometry();
  cleanGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(cleanPositions, 3),
  );
  cleanGeometry.computeVertexNormals();
  cleanGeometry.computeBoundingBox();
  cleanGeometry.computeBoundingSphere();

  return cleanGeometry;
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
    assemblyMode: AssemblyMode;
    onResetParams: () => void;
    onTrayRotationChange: (value: number) => void;
  }
>(function HolderViewer(
  {
    model,
    assemblyMode,
    onTrayRotationChange,
    onResetParams,
    params,
    coreViewMode,
    renderMode,
    showOriginal,
    theme,
    unit,
  },
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
  const sandFloorMeshRef = useRef<THREE.Mesh | null>(null);
  const trayLipMeshRef = useRef<THREE.Mesh | null>(null);
  const trayDividerGroupRef = useRef<THREE.Group | null>(null);
  const assemblyPreviewGroupRef = useRef<THREE.Group | null>(null);
  const diningHardwareGroupRef = useRef<THREE.Group | null>(null);
  const hoverExplodedGroupRef = useRef<THREE.Group | null>(null);
  const ghostMeshRef = useRef<THREE.Mesh | null>(null);
  const guideMeshRef = useRef<THREE.Mesh | null>(null);
  const mainMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const domeMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const diningMetalMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const mainBaseRef = useRef<Float32Array | null>(null);
  const animationRef = useRef<number | null>(null);
  const latestParamsRef = useRef(params);
  const latestCoreViewModeRef = useRef(coreViewMode);
  const latestRenderModeRef = useRef(renderMode);
  const latestShowOriginalRef = useRef(showOriginal);
  const latestAssemblyModeRef = useRef(assemblyMode);
  const latestInteractionModeRef = useRef<ViewerInteractionMode>("orbit");
  const [interactionMode, setInteractionMode] = useState<ViewerInteractionMode>(
    "orbit",
  );
  const [activeViewPreset, setActiveViewPreset] = useState<ViewPreset | null>(
    "iso",
  );
  const [cubeTransform, setCubeTransform] = useState(
    "rotateX(-28deg) rotateY(34deg)",
  );

  const updateCubeOrientation = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const offset = camera.position.clone().sub(controls.target);
    const horizontalDistance = Math.hypot(offset.x, offset.y);
    const pitch = clamp(
      -THREE.MathUtils.radToDeg(Math.atan2(offset.z, horizontalDistance)),
      -82,
      82,
    );
    const yaw =
      horizontalDistance < 0.001
        ? 0
        : -THREE.MathUtils.radToDeg(Math.atan2(offset.x, -offset.y));
    setCubeTransform(`rotateX(${pitch.toFixed(1)}deg) rotateY(${yaw.toFixed(1)}deg)`);
  }, []);

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
      model.viewer !== "weighted-paper-towel-holder-v1"
        ? dimensions.height * 0.25
        : dimensions.height * 0.42,
    );
    const edgeViewZ = target.z + dimensions.height * 0.2;

    camera.up.set(0, 0, 1);
    if (preset === "top") {
      camera.up.set(0, 1, 0);
      const topDistance =
        model.viewer === "door-lock-adapter-v1"
          ? distance
          : model.viewer === "dining-table-v1"
            ? distance * 1.05
          : Math.max(distance, dimensions.height * 10);
      camera.position.set(0, 0, target.z + topDistance);
    } else if (preset === "bottom") {
      camera.up.set(0, -1, 0);
      const bottomDistance =
        model.viewer === "dining-table-v1"
          ? distance * 1.05
          : Math.max(distance, dimensions.height * 10);
      camera.position.set(0, 0, target.z - bottomDistance);
    } else if (preset === "xEdge") {
      camera.position.set(0, -distance, edgeViewZ);
    } else if (preset === "yEdge") {
      camera.position.set(distance, 0, edgeViewZ);
    } else if (model.viewer !== "weighted-paper-towel-holder-v1") {
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
    setActiveViewPreset(preset);
    updateCubeOrientation();
  }, [model, updateCubeOrientation]);

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
    setActiveViewPreset(null);
    controls.update();
  }, []);

  const updateMeshes = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    const sandMesh = sandMeshRef.current;
    const sandFloorMesh = sandFloorMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    const assemblyPreviewGroup = assemblyPreviewGroupRef.current;
    const diningHardwareGroup = diningHardwareGroupRef.current;
    const hoverExplodedGroup = hoverExplodedGroupRef.current;
    const ghostMesh = ghostMeshRef.current;
    const guideMesh = guideMeshRef.current;
    const holderMaterial = mainMaterialRef.current;
    const domeMaterial = domeMaterialRef.current;
    const diningMetalMaterial = diningMetalMaterialRef.current;
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
      if (!domeMesh || !sandMesh || !sandFloorMesh || !domeMaterial) {
        return;
      }
      applyHolderMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateHolderGuide(guideMesh, latestParamsRef.current);
      updateWeightedCore(
        domeMesh,
        sandMesh,
        sandFloorMesh,
        latestParamsRef.current,
        model,
      );
    } else if (model.viewer === "door-lock-adapter-v1") {
      mainMesh.geometry.dispose();
      mainMesh.geometry = createDoorLockAdapterGeometry(
        latestParamsRef.current,
        model,
      );
      updateDoorLockAdapterGuide(guideMesh, latestParamsRef.current);
    } else if (model.viewer === "concentric-tube-jig-v1") {
      mainMesh.geometry.dispose();
      mainMesh.geometry = createConcentricTubeJigGeometry(
        latestParamsRef.current,
        model,
      );
      updateConcentricTubeJigGuide(guideMesh, latestParamsRef.current, model);
    } else if (model.viewer === "dining-table-v1") {
      if (!diningHardwareGroup || !diningMetalMaterial) return;
      mainMesh.geometry.dispose();
      mainMesh.geometry = createDiningTableWoodGeometry(
        latestParamsRef.current,
        model,
      );
      diningHardwareGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      diningHardwareGroup.clear();
      const hardware = createDiningTableHardwareGeometries(
        latestParamsRef.current,
      );
      hardware.plates.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-plate-${index + 1}`;
        diningHardwareGroup.add(mesh);
      });
      hardware.channels.forEach((geometry, index) => {
        const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
        mesh.name = `${model.id}-channel-${index + 1}`;
        diningHardwareGroup.add(mesh);
      });
      updateDiningTableGuide(guideMesh, latestParamsRef.current);
    } else if (model.viewer === "hover-dining-table-v1") {
      if (!hoverExplodedGroup) return;
      mainMesh.geometry.dispose();
      mainMesh.geometry = createHoverDiningTableGeometry(
        latestParamsRef.current,
        model,
      );
      hoverExplodedGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      hoverExplodedGroup.clear();
      const exploded = latestAssemblyModeRef.current === "exploded";
      const cutList = latestAssemblyModeRef.current === "cut-list";
      mainMesh.visible = !exploded && !cutList;
      hoverExplodedGroup.visible = exploded;
      if (exploded) {
        for (const part of createHoverDiningTableExplodedParts(
          latestParamsRef.current,
          model,
        )) {
          const mesh = new THREE.Mesh(part.geometry, holderMaterial);
          mesh.name = `${model.id}-${part.name}`;
          mesh.position.copy(part.offset);
          mesh.userData.assemblyCategory = part.category;
          hoverExplodedGroup.add(mesh);
        }
      }
      updateHoverDiningTableGuide(guideMesh, latestParamsRef.current);
    } else {
      applyTrayMorph(mainMesh.geometry, base, latestParamsRef.current, model);
      updateTrayGuide(guideMesh, latestParamsRef.current);
      if (model.viewer === "simple-box-v1" && trayLipMesh) {
        trayLipMesh.geometry.dispose();
        trayLipMesh.geometry = createTrayStackingLipGeometry(
          latestParamsRef.current,
          model,
        );
      }
      if (model.viewer === "simple-box-v1" && trayDividerGroup) {
        trayDividerGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        trayDividerGroup.clear();
        for (const geometry of createTrayDividerGeometries(latestParamsRef.current, model)) {
          trayDividerGroup.add(new THREE.Mesh(geometry, holderMaterial));
        }
      }
      if (model.viewer === "simple-box-v1") {
        const printBedOffset =
          latestAssemblyModeRef.current === "print-layout"
            ? getParam(latestParamsRef.current, "lipHeight") -
              model.geometry.stackingLipFloorOverlap
            : 0;
        mainMesh.position.z = printBedOffset;
        if (trayLipMesh) trayLipMesh.position.z = printBedOffset;
        if (trayDividerGroup) trayDividerGroup.position.z = printBedOffset;
      }
      if (model.viewer === "simple-box-v1" && assemblyPreviewGroup) {
        assemblyPreviewGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        assemblyPreviewGroup.clear();
        const previewMaterial = holderMaterial;
        if (latestAssemblyModeRef.current === "stacked") {
          const offsetZ =
            getParam(latestParamsRef.current, "height") +
            (getParam(latestParamsRef.current, "gridfinityCompatible") >= 0.5
              ? model.geometry.gridfinityBottomChamfer +
                model.geometry.gridfinityStraightHeight +
                model.geometry.gridfinityTopChamfer
              : 0);
          const upperBody = new THREE.Mesh(mainMesh.geometry.clone(), previewMaterial);
          upperBody.position.z = offsetZ;
          assemblyPreviewGroup.add(upperBody);
          if (trayLipMesh) {
            const upperLip = new THREE.Mesh(trayLipMesh.geometry.clone(), previewMaterial);
            upperLip.position.z = offsetZ;
            assemblyPreviewGroup.add(upperLip);
          }
          trayDividerGroup?.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
              const divider = new THREE.Mesh(child.geometry.clone(), previewMaterial);
              divider.position.z = offsetZ;
              assemblyPreviewGroup.add(divider);
            }
          });
        } else if (latestAssemblyModeRef.current === "lid") {
          const offsetZ = getParam(latestParamsRef.current, "height");
          for (const geometry of createSimpleBoxLidGeometries(
            latestParamsRef.current,
            model,
          )) {
            const lidPart = new THREE.Mesh(geometry, previewMaterial);
            lidPart.position.z = offsetZ;
            assemblyPreviewGroup.add(lidPart);
          }
        } else if (latestAssemblyModeRef.current === "print-layout") {
          const offsetY = -(getParam(latestParamsRef.current, "width") + 10);
          for (const geometry of createSimpleBoxLidPrintGeometries(
            latestParamsRef.current,
            model,
          )) {
            const lidPart = new THREE.Mesh(geometry, previewMaterial);
            lidPart.position.y = offsetY;
            assemblyPreviewGroup.add(lidPart);
          }
        }
      }
    }

    applyRenderOptions(
      holderMaterial,
      model.viewer === "dining-table-v1"
        ? diningMetalMaterial
        : domeMaterial,
      sandMesh,
      guideMesh,
      latestCoreViewModeRef.current,
      latestRenderModeRef.current,
      model,
    );

    ghostMesh.visible =
      model.viewer !== "dining-table-v1" &&
      model.viewer !== "hover-dining-table-v1" &&
      latestShowOriginalRef.current;
  }, [model]);

  const createStlBlob = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    const sandFloorMesh = sandFloorMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    if (!mainMesh) {
      return null;
    }

    const group = new THREE.Group();
    const holder = new THREE.Mesh(createCleanExportGeometry(mainMesh.geometry));
    holder.name = `${model.id}-body`;
    if (model.viewer === "dining-table-v1") {
      orientDiningTableForSupportFreePrint(
        holder,
        getModelDimensions(model, latestParamsRef.current).height,
      );
    }
    group.add(holder);

    let roundedTop: THREE.Mesh | null = null;
    let sandFloor: THREE.Mesh | null = null;
    if (model.viewer === "weighted-paper-towel-holder-v1" && domeMesh) {
      roundedTop = new THREE.Mesh(createCleanExportGeometry(domeMesh.geometry));
      roundedTop.name = `${model.id}-rounded-weighted-center-tube-top`;
      group.add(roundedTop);
    }
    if (model.viewer === "weighted-paper-towel-holder-v1" && sandFloorMesh) {
      sandFloor = new THREE.Mesh(createCleanExportGeometry(sandFloorMesh.geometry));
      sandFloor.name = `${model.id}-flush-sand-chamber-floor`;
      group.add(sandFloor);
    }
    let trayLip: THREE.Mesh | null = null;
    if (model.viewer === "simple-box-v1" && trayLipMesh) {
      trayLip = new THREE.Mesh(createCleanExportGeometry(trayLipMesh.geometry));
      trayLip.name = `${model.id}-stacking-lip`;
      group.add(trayLip);
    }
    const exportDividers: THREE.Mesh[] = [];
    if (model.viewer === "simple-box-v1" && trayDividerGroup) {
      trayDividerGroup.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          const divider = new THREE.Mesh(createCleanExportGeometry(child.geometry));
          divider.name = `${model.id}-divider-${index + 1}`;
          exportDividers.push(divider);
          group.add(divider);
        }
      });
    }
    group.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    const blob = new Blob([result], { type: "model/stl" });

    holder.geometry.dispose();
    roundedTop?.geometry.dispose();
    sandFloor?.geometry.dispose();
    trayLip?.geometry.dispose();
    exportDividers.forEach((divider) => divider.geometry.dispose());

    return blob;
  }, [model]);

  const createDiningTableHardwareStlBlob = useCallback(() => {
    if (model.viewer !== "dining-table-v1") {
      return null;
    }
    const hardware = createDiningTableHardwareGeometries(
      latestParamsRef.current,
    );
    const sourceGeometries = [...hardware.plates, ...hardware.channels];
    const group = new THREE.Group();
    const printHeight = getModelDimensions(
      model,
      latestParamsRef.current,
    ).height;
    const meshes = sourceGeometries.map((geometry, index) => {
      const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
      mesh.name =
        index < hardware.plates.length
          ? `${model.id}-plate-${index + 1}`
          : `${model.id}-c-channel-${index - hardware.plates.length + 1}`;
      orientDiningTableForSupportFreePrint(mesh, printHeight);
      group.add(mesh);
      return mesh;
    });
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    sourceGeometries.forEach((geometry) => geometry.dispose());
    meshes.forEach((mesh) => mesh.geometry.dispose());
    return new Blob([result], { type: "model/stl" });
  }, [model]);

  const exportStl = useCallback(() => {
    const blob = createStlBlob();
    if (!blob) {
      return;
    }
    const fileName = getExportFileName(model, latestParamsRef.current);
    if (model.viewer === "dining-table-v1") {
      const hardwareBlob = createDiningTableHardwareStlBlob();
      downloadBlob(
        blob,
        fileName.replace(/\.stl$/, "-support-free-wood-color-1.stl"),
      );
      if (hardwareBlob) {
        downloadBlob(
          hardwareBlob,
          fileName.replace(/\.stl$/, "-support-free-hardware-color-2.stl"),
        );
      }
      return;
    }
    downloadBlob(blob, fileName);
  }, [createDiningTableHardwareStlBlob, createStlBlob, model]);

  const exportLidStl = useCallback(() => {
    if (model.viewer !== "simple-box-v1") return;
    const group = new THREE.Group();
    const meshes = createSimpleBoxLidPrintGeometries(latestParamsRef.current, model).map(
      (geometry, index) => {
        const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
        mesh.name = `${model.id}-lid-${index === 0 ? "plate" : "registration-skirt"}`;
        geometry.dispose();
        group.add(mesh);
        return mesh;
      },
    );
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    downloadBlob(
      new Blob([result], { type: "model/stl" }),
      `${model.id}-lid-length-${getParam(latestParamsRef.current, "length").toFixed(1)}-width-${getParam(latestParamsRef.current, "width").toFixed(1)}.stl`,
    );
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }, [model]);

  const exportBoxAndLidStl = useCallback(() => {
    if (model.viewer !== "simple-box-v1") return;
    const mainMesh = mainMeshRef.current;
    const trayLipMesh = trayLipMeshRef.current;
    const trayDividerGroup = trayDividerGroupRef.current;
    if (!mainMesh || !trayLipMesh || !trayDividerGroup) return;
    const group = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    const addMesh = (geometry: THREE.BufferGeometry, name: string) => {
      const mesh = new THREE.Mesh(createCleanExportGeometry(geometry));
      mesh.name = name;
      meshes.push(mesh);
      group.add(mesh);
      return mesh;
    };
    const boxPrintBedOffset =
      getParam(latestParamsRef.current, "lipHeight") -
      model.geometry.stackingLipFloorOverlap;
    addMesh(mainMesh.geometry, `${model.id}-body`).position.z = boxPrintBedOffset;
    addMesh(trayLipMesh.geometry, `${model.id}-stacking-lip`).position.z =
      boxPrintBedOffset;
    trayDividerGroup.children.forEach((child, index) => {
      if (child instanceof THREE.Mesh) {
        addMesh(child.geometry, `${model.id}-divider-${index + 1}`).position.z =
          boxPrintBedOffset;
      }
    });
    const offsetY = -(getParam(latestParamsRef.current, "width") + 10);
    createSimpleBoxLidPrintGeometries(latestParamsRef.current, model).forEach(
      (geometry, index) => {
        const mesh = addMesh(
          geometry,
          `${model.id}-lid-${index === 0 ? "plate" : "registration-skirt"}`,
        );
        mesh.position.y = offsetY;
        geometry.dispose();
      },
    );
    group.updateMatrixWorld(true);
    const result = new STLExporter().parse(group, { binary: true });
    downloadBlob(
      new Blob([result], { type: "model/stl" }),
      `${model.id}-box-and-lid-length-${getParam(latestParamsRef.current, "length").toFixed(1)}-width-${getParam(latestParamsRef.current, "width").toFixed(1)}.stl`,
    );
    meshes.forEach((mesh) => mesh.geometry.dispose());
  }, [model]);

  useImperativeHandle(
    ref,
    () => ({
      exportStl,
      exportLidStl,
      exportBoxAndLidStl,
      getStlBlob: createStlBlob,
      resetCamera,
      setView: setCameraView,
    }),
    [createStlBlob, exportBoxAndLidStl, exportLidStl, exportStl, resetCamera, setCameraView],
  );

  useEffect(() => {
    latestParamsRef.current = params;
    latestCoreViewModeRef.current = coreViewMode;
    latestRenderModeRef.current = renderMode;
    latestShowOriginalRef.current = showOriginal;
    latestAssemblyModeRef.current = assemblyMode;
    updateMeshes();
  }, [params, coreViewMode, renderMode, showOriginal, assemblyMode, updateMeshes]);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.background =
        theme === "dark" ? null : new THREE.Color(SCENE_BACKGROUND[theme]);
    }
    if (rendererRef.current) {
      rendererRef.current.setClearAlpha(theme === "dark" ? 0 : 1);
    }
    const mainMaterial = mainMaterialRef.current;
    if (mainMaterial && model.viewer === "weighted-paper-towel-holder-v1") {
      mainMaterial.color.set(theme === "dark" ? "#202734" : "#111318");
      mainMaterial.needsUpdate = true;
    }
  }, [model.viewer, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background =
      theme === "dark" ? null : new THREE.Color(SCENE_BACKGROUND[theme]);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(theme === "dark" ? 0 : 1);
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
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT =
      latestInteractionModeRef.current === "pan"
        ? THREE.MOUSE.PAN
        : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      latestInteractionModeRef.current === "pan"
        ? THREE.TOUCH.PAN
        : THREE.TOUCH.ROTATE;
    controls.minDistance =
      model.viewer === "door-lock-adapter-v1" || model.viewer === "concentric-tube-jig-v1" ? 18 : 80;
    controls.maxDistance = 1400;
    controlsRef.current = controls;
    const handleControlChange = () => updateCubeOrientation();
    const handleControlStart = () => setActiveViewPreset(null);
    let trackpadGestureUntil = 0;
    const handleTrackpadPan = (event: WheelEvent) => {
      if (event.ctrlKey) {
        trackpadGestureUntil = 0;
        return;
      }

      const now = performance.now();
      const isContinuingTrackpadGesture = now < trackpadGestureUntil;
      const isTrackpadGesture =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
        (isContinuingTrackpadGesture ||
          Math.abs(event.deltaX) > 0 ||
          Math.abs(event.deltaY) <= 12);
      if (!isTrackpadGesture) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      trackpadGestureUntil = now + 160;

      const cameraOffset = camera.position.clone().sub(controls.target);
      const worldUnitsPerPixel =
        (2 *
          cameraOffset.length() *
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
        Math.max(renderer.domElement.clientHeight, 1);
      const movement = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrix, 0)
        .multiplyScalar(-event.deltaX * worldUnitsPerPixel);
      movement.add(
        new THREE.Vector3()
          .setFromMatrixColumn(camera.matrix, 1)
          .multiplyScalar(event.deltaY * worldUnitsPerPixel),
      );
      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
      setActiveViewPreset(null);
    };
    renderer.domElement.addEventListener("wheel", handleTrackpadPan, {
      capture: true,
      passive: false,
    });
    controls.addEventListener("change", handleControlChange);
    controls.addEventListener("start", handleControlStart);

    scene.add(new THREE.HemisphereLight("#ffffff", "#aeb7c4", 2.1));
    const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
    keyLight.position.set(180, -160, 260);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#dbeafe", 0.78);
    fillLight.position.set(-220, 140, 120);
    scene.add(fillLight);

    const initialDimensions = getModelDimensions(model, latestParamsRef.current);
    const gridSize = Math.max(
      initialDimensions.length * 1.8,
      initialDimensions.width * 1.8,
      260,
    );
    const gridColors = SCENE_GRID_COLORS[theme];
    const grid = new THREE.GridHelper(
      gridSize,
      26,
      gridColors.center,
      gridColors.grid,
    );
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
            initialDimensions.length,
            initialDimensions.width,
            initialDimensions.height,
          );
    const guide = new THREE.Mesh(
      guideGeometry,
      new THREE.MeshBasicMaterial({
        color: "#2563eb",
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

        const woodTexture =
          model.viewer === "dining-table-v1"
            ? createWoodTexture(renderer, "oak")
            : model.viewer === "hover-dining-table-v1"
              ? createWoodTexture(renderer, "oak")
              : null;
        const isWoodFurniture =
          model.viewer === "dining-table-v1" ||
          model.viewer === "hover-dining-table-v1";
        const mainMaterial = new THREE.MeshStandardMaterial({
          color:
            isWoodFurniture
              ? "#ffffff"
              : model.viewer !== "weighted-paper-towel-holder-v1"
                ? "#d8dee9"
                : theme === "dark"
                  ? "#202734"
                  : "#111318",
          map: woodTexture,
          roughness:
            model.viewer === "hover-dining-table-v1"
              ? 0.62
              : model.viewer === "dining-table-v1"
                ? 0.72
                : 0.78,
          metalness: isWoodFurniture ? 0 : 0.08,
          side: THREE.DoubleSide,
        });
        mainMaterialRef.current = mainMaterial;
        const domeMaterial = new THREE.MeshStandardMaterial({
          color: "#111318",
          roughness: 0.72,
          metalness: 0.06,
          side: THREE.DoubleSide,
        });
        domeMaterialRef.current = domeMaterial;
        const diningMetalMaterial = new THREE.MeshStandardMaterial({
          color: "#16191d",
          roughness: 0.48,
          metalness: 0.82,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        diningMetalMaterialRef.current = diningMetalMaterial;
        const sandMaterial = new THREE.MeshStandardMaterial({
          color: "#c7a45d",
          roughness: 0.86,
          metalness: 0,
          transparent: true,
          opacity: 0.9,
        });
        const ghostMaterial = new THREE.MeshBasicMaterial({
          color: "#7f8794",
          transparent: true,
          opacity: 0.22,
          wireframe: true,
        });

        const displayedGeometry = model.viewer === "door-lock-adapter-v1"
          ? createDoorLockAdapterGeometry(latestParamsRef.current, model)
          : model.viewer === "concentric-tube-jig-v1"
            ? createConcentricTubeJigGeometry(latestParamsRef.current, model)
            : model.viewer === "dining-table-v1"
              ? createDiningTableWoodGeometry(latestParamsRef.current, model)
            : model.viewer === "hover-dining-table-v1"
              ? createHoverDiningTableGeometry(latestParamsRef.current, model)
            : normalizedMain.geometry;
        const mainMesh = new THREE.Mesh(displayedGeometry, mainMaterial);
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

          const sandFloorMesh = new THREE.Mesh(
            createSandChamberFloorGeometry(latestParamsRef.current, model),
            mainMaterial,
          );
          sandFloorMesh.name = `${model.id}-flush-sand-chamber-floor`;
          scene.add(sandFloorMesh);
          sandFloorMeshRef.current = sandFloorMesh;

          const sandMesh = new THREE.Mesh(
            createSandPreviewGeometry(latestParamsRef.current, model),
            sandMaterial,
          );
          sandMesh.name = `${model.id}-sand-fill-preview`;
          sandMesh.visible = latestCoreViewModeRef.current !== "surface";
          scene.add(sandMesh);
          sandMeshRef.current = sandMesh;
        } else if (model.viewer === "simple-box-v1") {
          const trayLipMesh = new THREE.Mesh(
            createTrayStackingLipGeometry(latestParamsRef.current, model),
            mainMaterial,
          );
          trayLipMesh.name = `${model.id}-stacking-lip`;
          scene.add(trayLipMesh);
          trayLipMeshRef.current = trayLipMesh;

          const dividerGroup = new THREE.Group();
          dividerGroup.name = `${model.id}-dividers`;
          for (const geometry of createTrayDividerGeometries(latestParamsRef.current, model)) {
            dividerGroup.add(new THREE.Mesh(geometry, mainMaterial));
          }
          scene.add(dividerGroup);
          trayDividerGroupRef.current = dividerGroup;

          const assemblyPreviewGroup = new THREE.Group();
          assemblyPreviewGroup.name = `${model.id}-assembly-preview`;
          scene.add(assemblyPreviewGroup);
          assemblyPreviewGroupRef.current = assemblyPreviewGroup;
        } else if (model.viewer === "dining-table-v1") {
          const hardwareGroup = new THREE.Group();
          hardwareGroup.name = `${model.id}-hardware`;
          const hardware = createDiningTableHardwareGeometries(
            latestParamsRef.current,
          );
          hardware.plates.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-plate-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          hardware.channels.forEach((geometry, index) => {
            const mesh = new THREE.Mesh(geometry, diningMetalMaterial);
            mesh.name = `${model.id}-channel-${index + 1}`;
            hardwareGroup.add(mesh);
          });
          scene.add(hardwareGroup);
          diningHardwareGroupRef.current = hardwareGroup;
        } else if (model.viewer === "hover-dining-table-v1") {
          const explodedGroup = new THREE.Group();
          explodedGroup.name = `${model.id}-exploded-assembly`;
          explodedGroup.visible = latestAssemblyModeRef.current === "exploded";
          scene.add(explodedGroup);
          hoverExplodedGroupRef.current = explodedGroup;
        }

        const ghostMesh = new THREE.Mesh(
          normalizedMain.geometry.clone(),
          ghostMaterial,
        );
        ghostMesh.name = `${model.id}-original-overlay`;
        ghostMesh.visible = latestShowOriginalRef.current;
        scene.add(ghostMesh);
        ghostMeshRef.current = ghostMesh;

        if (
          model.viewer === "door-lock-adapter-v1" ||
          model.viewer === "concentric-tube-jig-v1" ||
          model.viewer === "dining-table-v1" ||
          model.viewer === "hover-dining-table-v1"
        ) {
          normalizedMain.geometry.dispose();
        }

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
      renderer.domElement.removeEventListener("wheel", handleTrackpadPan, true);
      controls.removeEventListener("change", handleControlChange);
      controls.removeEventListener("start", handleControlStart);
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
  }, [model, resetCamera, updateCubeOrientation, updateMeshes]);

  useEffect(() => {
    latestInteractionModeRef.current = interactionMode;
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.mouseButtons.LEFT =
      interactionMode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE =
      interactionMode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }, [interactionMode]);

  return (
    <div
      className="viewer"
      data-assembly-mode={assemblyMode}
      data-interaction-mode={interactionMode}
      ref={containerRef}
    >
      <div className="viewer-backdrop" aria-hidden="true" />
      {model.viewer === "hover-dining-table-v1" &&
      assemblyMode === "cut-list" ? (
        <HoverDiningTableCutList params={params} unit={unit} />
      ) : null}
      <div className="viewer-status" data-testid="viewer-status">
        {getStatusItems(model, params, unit).map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{RENDER_MODE_LABELS[renderMode]}</span>
        {model.viewer === "hover-dining-table-v1" &&
        assemblyMode === "exploded" ? (
          <span>Exploded · 13 pieces</span>
        ) : null}
        {model.viewer === "hover-dining-table-v1" &&
        assemblyMode === "cut-list" ? (
          <span>Cut list · full-size · 13 pieces</span>
        ) : null}
      </div>
      <div className="viewer-nav" aria-label="3D view controls">
        <div className="viewer-tool-rail" role="group" aria-label="View tools">
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
          <button
            aria-label="Pan view"
            aria-pressed={interactionMode === "pan"}
            className={interactionMode === "pan" ? "active" : undefined}
            onClick={() =>
              setInteractionMode((current) =>
                current === "pan" ? "orbit" : "pan",
              )
            }
            title="Pan view with a mouse or one finger"
            type="button"
          >
            <Hand aria-hidden="true" />
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
            aria-label="Reset parameters"
            onClick={onResetParams}
            title="Reset parameters"
            type="button"
          >
            <RotateCcw aria-hidden="true" />
          </button>
          {ENABLE_TRAY_ORIENTATION_CONTROLS &&
          model.viewer === "japandi-tray-v1" ? (
            <TrayOrientationSnapControl
              maxRotation={model.geometry.footprintRotationDegrees}
              onChange={onTrayRotationChange}
              value={getParam(params, "rotation")}
            />
          ) : null}
        </div>
      </div>
      <div
        aria-label="Orientation controls"
        className="orientation-cube-control"
      >
        <span className="orientation-cube-scene" aria-hidden="true">
          <span
            className="orientation-cube"
            style={{ transform: cubeTransform }}
          >
            <span className="orientation-cube-face orientation-cube-face-top">
              Top
            </span>
            <span className="orientation-cube-face orientation-cube-face-front">
              Front
            </span>
            <span className="orientation-cube-face orientation-cube-face-right">
              Right
            </span>
            <span className="orientation-cube-face orientation-cube-face-bottom">
              Bottom
            </span>
            <span className="orientation-cube-face orientation-cube-face-back">
              Back
            </span>
            <span className="orientation-cube-face orientation-cube-face-left">
              Left
            </span>
          </span>
        </span>
        <span className="orientation-cube-tabs">
          {[
            { label: "3D", preset: "iso", ariaLabel: "Isometric view" },
            { label: "Top", preset: "top", ariaLabel: "Top view" },
            ...(model.viewer === "dining-table-v1"
              ? [{ label: "Bottom", preset: "bottom", ariaLabel: "Bottom view" }]
              : []),
            { label: "X", preset: "xEdge", ariaLabel: "Align X edge to view" },
            { label: "Y", preset: "yEdge", ariaLabel: "Align Y edge to view" },
          ].map((option) => (
            <button
              aria-label={option.ariaLabel}
              aria-pressed={activeViewPreset === option.preset}
              className={activeViewPreset === option.preset ? "active" : ""}
              key={option.preset}
              onClick={() => setCameraView(option.preset as ViewPreset)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </span>
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
  preferFineStep = false,
}: {
  label: string;
  valueMm: number;
  limits: NumberLimits;
  unit: LengthUnit;
  onChange: (valueMm: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
  preferFineStep?: boolean;
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
  const clampValue = (nextMm: number) =>
    Math.min(limits.max, Math.max(limits.min, nextMm));
  const updateValue = (rawValue: string) => {
    const nextMm = parseLengthInput(rawValue, unit);
    if (nextMm === null) {
      return;
    }
    onChange(clampValue(nextMm));
  };
  const stepValue = (direction: -1 | 1) => {
    const parsedMm = parseLengthInput(draftValue, unit);
    const sourceMm = clampValue(parsedMm ?? valueMm);
    const nextMm = clampValue(
      stepLengthInput(sourceMm, unit, limits.step, direction, preferFineStep),
    );
    setDraftValue(formatLengthInput(nextMm, unit));
    onChange(nextMm);
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
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
              return;
            }
            event.preventDefault();
            stepValue(event.key === "ArrowUp" ? 1 : -1);
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

function ScaleControl({
  limits,
  onChange,
  value,
}: {
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const update = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.round(clamp(parsed, limits.min, limits.max)));
  };
  return (
    <div className="number-control">
      <label htmlFor="mock-scale-denominator">Mock scale</label>
      <div className="number-row angle-number-row">
        <input
          id="mock-scale-denominator"
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label="Mock scale denominator"
          inputMode="numeric"
          onChange={(event) => update(event.currentTarget.value)}
          type="number"
          value={value}
        />
        <span aria-label={`Scale 1 to ${value}`}>1:{value}</span>
      </div>
    </div>
  );
}

function BezierCurveControl({
  label,
  limits,
  onChange,
  value,
}: {
  label: string;
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const update = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed, limits.min, limits.max));
  };
  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row angle-number-row">
        <input
          id={id}
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label={`${label} Bézier tension`}
          inputMode="decimal"
          max={limits.max}
          min={limits.min}
          onChange={(event) => update(event.currentTarget.value)}
          step={limits.step}
          type="number"
          value={value.toFixed(3)}
        />
        <span aria-label={`${label} kappa ${value.toFixed(3)}`}>κ</span>
      </div>
    </div>
  );
}

function AngleControl({
  label,
  limits,
  onChange,
  value,
}: {
  label: string;
  limits: NumberLimits;
  onChange: (value: number) => void;
  value: number;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const [draftValue, setDraftValue] = useState(() => value.toFixed(0));
  const clampAngle = (nextValue: number) =>
    Math.min(limits.max, Math.max(limits.min, nextValue));
  const updateValue = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) onChange(clampAngle(parsed));
  };

  useEffect(() => {
    setDraftValue(value.toFixed(0));
  }, [value]);

  return (
    <div className="number-control">
      <label htmlFor={id}>{label}</label>
      <div className="number-row angle-number-row">
        <input
          id={id}
          max={limits.max}
          min={limits.min}
          onChange={(event) => updateValue(event.currentTarget.value)}
          step={limits.step}
          type="range"
          value={value}
        />
        <input
          aria-label={`${label} in degrees`}
          inputMode="decimal"
          onBlur={() => setDraftValue(value.toFixed(0))}
          onChange={(event) => {
            setDraftValue(event.currentTarget.value);
            updateValue(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const direction = event.key === "ArrowUp" ? 1 : -1;
            const nextValue = clampAngle(value + direction * limits.step);
            setDraftValue(nextValue.toFixed(0));
            onChange(nextValue);
          }}
          type="text"
          value={draftValue}
        />
        <span aria-hidden="true" className="angle-unit">
          °
        </span>
      </div>
    </div>
  );
}

function DividerControls({
  model,
  params,
  unit,
  onAdd,
  onRemove,
  onPositionChange,
  onUnitChange,
}: {
  model: ModelDefinition;
  params: ModelParams;
  unit: LengthUnit;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onPositionChange: (index: number, value: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
}) {
  const count = Math.round(getParam(params, "dividerCount"));
  return (
    <div className="divider-controls">
      <div className="divider-controls-heading">
        <p>{count === 0 ? "No dividers" : `${count} divider${count === 1 ? "" : "s"}`}</p>
        <button disabled={count >= 4} onClick={onAdd} type="button">
          <Plus aria-hidden="true" /> Add divider
        </button>
      </div>
      {Array.from({ length: count }, (_, index) => (
        <div className="divider-control" key={index}>
          <NumberControl
            label={`Divider ${index + 1} position`}
            limits={getParameterLimits(model, params, `dividerPosition${index + 1}`)}
            onChange={(value) => onPositionChange(index, value)}
            onUnitChange={onUnitChange}
            unit={unit}
            valueMm={getParam(params, `dividerPosition${index + 1}`)}
          />
          <button
            aria-label={`Remove divider ${index + 1}`}
            className="divider-remove-button"
            onClick={() => onRemove(index)}
            title={`Remove divider ${index + 1}`}
            type="button"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      ))}
      <small>Positions are measured from the left end of the box.</small>
    </div>
  );
}

function AssemblyPreviewControl({
  value,
  onChange,
}: {
  value: AssemblyMode;
  onChange: (value: AssemblyMode) => void;
}) {
  return (
    <div className="segmented-control assembly-preview-control" aria-label="Assembly preview">
      {([
        ["box", "Box"],
        ["stacked", "Stacked pair"],
        ["lid", "Fitted lid"],
        ["print-layout", "Print layout"],
      ] as const).map(([mode, label]) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function HoverAssemblyControl({
  value,
  onChange,
}: {
  value: AssemblyMode;
  onChange: (value: AssemblyMode) => void;
}) {
  return (
    <div className="segmented-control" aria-label="X-Hover assembly view">
      {([
        ["assembled", "Assembled"],
        ["exploded", "Exploded"],
        ["cut-list", "Cut list"],
      ] as const).map(([mode, label]) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "active" : ""}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {label}
        </button>
      ))}
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

function GridfinityToggle({
  checked,
  lengthUnits,
  onChange,
  widthUnits,
}: {
  checked: boolean;
  lengthUnits: number;
  onChange: (checked: boolean) => void;
  widthUnits: number;
}) {
  return (
    <div className="gridfinity-option">
      <OriginalOverlayToggle
        checked={checked}
        label="Gridfinity compatibility"
        onChange={onChange}
      />
      <small>
        {checked
          ? `${lengthUnits} × ${widthUnits} units · 42 mm pitch · standard base + stacking rim`
          : "Snap the footprint to whole grid units and add standard mating feet and rim."}
      </small>
    </div>
  );
}

function PostGrooveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="gridfinity-option">
      <OriginalOverlayToggle
        checked={checked}
        label="Post-top groove / rabbet"
        onChange={onChange}
      />
      <small>
        {checked
          ? "The recessed band meets a rounded lower shoulder below the tabletop."
          : "The top roundover returns to the post edge with no recessed band."}
      </small>
    </div>
  );
}

function TrayOrientationSnapControl({
  maxRotation,
  onChange,
  value,
}: {
  maxRotation: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const clampedValue = clamp(value, 0, maxRotation);
  const displayValue = Number(clampedValue.toFixed(1));
  const sourceLabel = `${Number(maxRotation.toFixed(1))}\u00b0`;

  return (
    <div className="tray-orientation-snap-control" aria-label="Tray orientation">
      <button
        aria-label="Align tray to X axis"
        aria-pressed={displayValue === 0}
        className={displayValue === 0 ? "active" : ""}
        onClick={() => onChange(0)}
        title="Align tray to X axis"
        type="button"
      >
        X
      </button>
      <button
        aria-label="Use tray source angle"
        aria-pressed={displayValue === maxRotation}
        className={displayValue === maxRotation ? "active" : ""}
        onClick={() => onChange(maxRotation)}
        title="Use tray source angle"
        type="button"
      >
        {sourceLabel}
      </button>
    </div>
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

function LoadingShell({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section className="scene-panel loading-panel" aria-live="polite">
        <div>{message}</div>
      </section>
    </main>
  );
}

function getWorkspaceModelPreviewClass(modelKey: string) {
  return modelKey.includes("tray") ? "tray" : "holder";
}

function formatWorkspaceVersionDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function isVisibleSavedVersion(version: SavedLibraryVersion) {
  return !version.title.startsWith(PLAYWRIGHT_TEST_VERSION_TITLE_PREFIX);
}

type WorkspaceLibrarySidebarProps = {
  activeVersionId: Id<"versions"> | null;
  catalogModels: CatalogSeedModel[];
  convexEnabled: boolean;
  isCollapsed: boolean;
  selectedModelId: string;
  onOpenModel: (modelId: string) => void;
  onOpenVersion: (version: SavedLibraryVersion) => void;
  onToggleCollapsed: () => void;
};

function WorkspaceLibrarySidebar({
  activeVersionId,
  catalogModels,
  convexEnabled,
  isCollapsed,
  selectedModelId,
  onOpenModel,
  onOpenVersion,
  onToggleCollapsed,
}: WorkspaceLibrarySidebarProps) {
  const [activeSection, setActiveSection] = useState<"models" | "versions">(
    "models",
  );
  const [query, setQuery] = useState("");
  const filteredModels = useMemo(
    () => filterLibraryModels(catalogModels, query),
    [catalogModels, query],
  );

  if (isCollapsed) {
    return (
      <aside
        className="workspace-library-sidebar collapsed"
        aria-label="Workspace model library"
      >
        <button
          aria-label="Expand model library"
          className="library-collapse-button"
          onClick={onToggleCollapsed}
          title="Expand model library"
          type="button"
        >
          <PanelLeftOpen aria-hidden="true" />
        </button>
        <button
          aria-label="Show models"
          className={activeSection === "models" ? "active" : ""}
          onClick={() => {
            setActiveSection("models");
            onToggleCollapsed();
          }}
          title="Model Library"
          type="button"
        >
          <Layers3 aria-hidden="true" />
        </button>
        <button
          aria-label="Show saved versions"
          className={activeSection === "versions" ? "active" : ""}
          onClick={() => {
            setActiveSection("versions");
            onToggleCollapsed();
          }}
          title="Saved Versions"
          type="button"
        >
          <Clock3 aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="workspace-library-sidebar" aria-label="Workspace model library">
      <div className="workspace-library-topbar">
        <button
          aria-label="Collapse model library"
          className="library-collapse-button"
          onClick={onToggleCollapsed}
          title="Collapse model library"
          type="button"
        >
          <PanelLeftClose aria-hidden="true" />
        </button>
      </div>

      <nav className="workspace-library-nav" aria-label="Workspace library sections">
        <button
          className={activeSection === "models" ? "active" : ""}
          onClick={() => setActiveSection("models")}
          type="button"
        >
          <Layers3 aria-hidden="true" />
          Model Library
        </button>
        <button
          className={activeSection === "versions" ? "active" : ""}
          onClick={() => setActiveSection("versions")}
          type="button"
        >
          <Clock3 aria-hidden="true" />
          Saved Versions
        </button>
      </nav>

      {activeSection === "models" ? (
        <div className="workspace-sidebar-section">
          <div className="workspace-sidebar-section-heading">
            <span>Models</span>
          </div>
          <label className="workspace-library-search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search workspace models"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search models..."
              type="search"
              value={query}
            />
            <SlidersHorizontal aria-hidden="true" />
          </label>
          <div className="workspace-model-list">
            {filteredModels.map((modelEntry) => {
              const isActive = modelEntry.key === selectedModelId;
              return (
                <button
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${modelEntry.name}`}
                  className={`workspace-model-card${isActive ? " active" : ""}`}
                  key={modelEntry.key}
                  onClick={() => onOpenModel(modelEntry.key)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`model-preview ${getWorkspaceModelPreviewClass(modelEntry.key)}`}
                  >
                    <span />
                  </span>
                  <span className="workspace-model-card-copy">
                    <strong>{modelEntry.name}</strong>
                    <span>
                      {modelEntry.description ?? "Parametric STL model"}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <WorkspaceSavedVersions
          activeVersionId={activeVersionId}
          convexEnabled={convexEnabled}
          selectedModelId={selectedModelId}
          onOpenVersion={onOpenVersion}
        />
      )}
    </aside>
  );
}

class WorkspaceVersionsErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unable to render workspace saved versions.", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function WorkspaceSavedVersions({
  activeVersionId,
  convexEnabled,
  selectedModelId,
  onOpenVersion,
}: {
  activeVersionId: Id<"versions"> | null;
  convexEnabled: boolean;
  selectedModelId: string;
  onOpenVersion: (version: SavedLibraryVersion) => void;
}) {
  if (!convexEnabled) {
    return (
      <div className="workspace-sidebar-section">
        <div className="workspace-sidebar-section-heading">
          <span>Saved versions</span>
        </div>
        <LibraryUnavailableMessage>
          Connect Convex to browse saved versions for this model.
        </LibraryUnavailableMessage>
      </div>
    );
  }

  return (
    <WorkspaceVersionsErrorBoundary
      fallback={
        <div className="workspace-sidebar-section">
          <div className="workspace-sidebar-section-heading">
            <span>Saved versions</span>
          </div>
          <LibraryUnavailableMessage>
            Saved versions could not load. The model is still editable and exportable.
          </LibraryUnavailableMessage>
        </div>
      }
    >
      <ConnectedWorkspaceSavedVersions
        activeVersionId={activeVersionId}
        selectedModelId={selectedModelId}
        onOpenVersion={onOpenVersion}
      />
    </WorkspaceVersionsErrorBoundary>
  );
}

function ConnectedWorkspaceSavedVersions({
  activeVersionId,
  selectedModelId,
  onOpenVersion,
}: {
  activeVersionId: Id<"versions"> | null;
  selectedModelId: string;
  onOpenVersion: (version: SavedLibraryVersion) => void;
}) {
  const connectionState = useConvexConnectionState();
  const library = useQuery(api.library.listLibrary);
  const versions = useMemo(
    () =>
      ((library?.versions ?? []) as SavedLibraryVersion[]).filter(
        (version) =>
          version.modelKey === selectedModelId && isVisibleSavedVersion(version),
      ),
    [library, selectedModelId],
  );
  const hasConnectionIssue =
    !connectionState.isWebSocketConnected &&
    (connectionState.hasEverConnected || connectionState.connectionRetries > 0);

  return (
    <div className="workspace-sidebar-section">
      <div className="workspace-sidebar-section-heading">
        <span>Saved versions</span>
      </div>
      {hasConnectionIssue ? (
        <LibraryUnavailableMessage>
          Saved versions are reconnecting. You can keep editing the model.
        </LibraryUnavailableMessage>
      ) : null}
      {library === undefined ? (
        <p className="library-empty">Loading saved versions...</p>
      ) : versions.length === 0 ? (
        <p className="library-empty">No saved versions for this model yet.</p>
      ) : (
        <div className="workspace-version-list">
          {versions.map((version) => {
            const isActive = activeVersionId === version._id;
            return (
              <button
                aria-current={isActive ? "page" : undefined}
                aria-label={`Open ${version.title}`}
                className={`workspace-version-row${isActive ? " active" : ""}`}
                key={version._id}
                onClick={() => onOpenVersion(version)}
                type="button"
              >
                <span className="workspace-version-icon" aria-hidden="true">
                  {version.source === "fork" ? <GitFork /> : <Clock3 />}
                </span>
                <span className="workspace-version-copy">
                  <strong>{version.title}</strong>
                  <span>
                    {version.source === "fork" ? "Fork" : "Saved"} ·{" "}
                    {formatWorkspaceVersionDate(version.updatedAt)}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorkspaceActionsMenu({
  activeVersionId,
  convexEnabled,
  exportFileName,
  model,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onExport,
  onExportLid,
  onExportBoxAndLid,
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
  onExport: () => void;
  onExportLid: () => void;
  onExportBoxAndLid: () => void;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isDark = theme === "dark";

  return (
    <div
      className="workspace-actions-menu-shell"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
        }
      }}
    >
      <button
        aria-expanded={isOpen}
        aria-label="Workspace actions"
        className="workspace-actions-trigger"
        onClick={() => setIsOpen((current) => !current)}
        title="Workspace actions"
        type="button"
      >
        <MoreHorizontal aria-hidden="true" />
        <ChevronDown aria-hidden="true" />
      </button>
      {isOpen ? (
        <>
          <div
            aria-hidden="true"
            className="workspace-actions-mask"
            onMouseDown={() => setIsOpen(false)}
          />
          <div
            aria-label="Workspace actions"
            className="workspace-actions-menu"
            role="dialog"
          >
            <div className="workspace-menu-group">
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
                <LibraryUnavailableMessage>
                  Library sync is unavailable here. You can still edit and export;
                  Save/Fork return when Convex reconnects.
                </LibraryUnavailableMessage>
              )}
            </div>
            <div className="workspace-menu-group">
              <button
                aria-label={isDark ? "Use light theme" : "Use dark theme"}
                onClick={() => onThemeChange(isDark ? "light" : "dark")}
                type="button"
              >
                {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                {isDark ? "Light theme" : "Dark theme"}
              </button>
            </div>
            <div className="workspace-menu-group">
              <button className="primary-action" onClick={onExport} type="button">
                <Download aria-hidden="true" />
                {model.viewer === "dining-table-v1"
                  ? "Export two-color STLs"
                  : "Export"}
              </button>
              {model.viewer === "simple-box-v1" ? (
                <>
                  <button onClick={onExportLid} type="button">
                    <Download aria-hidden="true" />
                    Export lid
                  </button>
                  <button onClick={onExportBoxAndLid} type="button">
                    <Download aria-hidden="true" />
                    Export box + lid
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function WorkspaceHeader({
  activeVersionId,
  activeVersionTitle,
  convexEnabled,
  exportFileName,
  model,
  params,
  theme,
  unit,
  onCreateStlBlob,
  onExport,
  onExportLid,
  onExportBoxAndLid,
  onSavedVersion,
  onThemeChange,
}: {
  activeVersionId: Id<"versions"> | null;
  activeVersionTitle: string | null;
  convexEnabled: boolean;
  exportFileName: string;
  model: ModelDefinition;
  params: ModelParams;
  theme: ThemeMode;
  unit: LengthUnit;
  onCreateStlBlob: () => Blob | null;
  onExport: () => void;
  onExportLid: () => void;
  onExportBoxAndLid: () => void;
  onSavedVersion: (versionId: Id<"versions">, title: string) => void;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <div>
          <p>{model.subtitle}</p>
          <h1>{activeVersionTitle ?? model.name}</h1>
        </div>
      </div>
      <div className="workspace-actions">
        <WorkspaceActionsMenu
          activeVersionId={activeVersionId}
          convexEnabled={convexEnabled}
          exportFileName={exportFileName}
          model={model}
          onCreateStlBlob={onCreateStlBlob}
          onExport={onExport}
          onExportLid={onExportLid}
          onExportBoxAndLid={onExportBoxAndLid}
          onSavedVersion={onSavedVersion}
          onThemeChange={onThemeChange}
          params={params}
          theme={theme}
          unit={unit}
        />
      </div>
    </header>
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
  const [assemblyMode, setAssemblyMode] = useState<AssemblyMode>("box");
  const [inspectorWidth, setInspectorWidth] = useState(() => getStoredSidebarWidth());
  const [librarySidebarWidth, setLibrarySidebarWidth] = useState(() =>
    getStoredLibrarySidebarWidth(),
  );
  const [isLibrarySidebarCollapsed, setIsLibrarySidebarCollapsed] =
    useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [coreViewMode, setCoreViewMode] = useState<CoreViewMode>("surface");
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [showOriginal, setShowOriginal] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<Id<"versions"> | null>(
    null,
  );
  const [activeVersionTitle, setActiveVersionTitle] = useState<string | null>(
    null,
  );
  const viewerRef = useRef<ViewerHandle | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      LIBRARY_SIDEBAR_WIDTH_KEY,
      String(librarySidebarWidth),
    );
  }, [librarySidebarWidth]);

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
            const defaultModel =
              nextCatalog.models.find((entry) => entry.id === DEFAULT_MODEL_ID) ??
              nextCatalog.models[0];
            if (!defaultModel) {
              setLoadError("No models are available.");
              return "";
            }
            const url = new URL(window.location.href);
            url.searchParams.set("model", defaultModel.id);
            url.searchParams.delete("theme");
            for (const key of PARAM_QUERY_KEYS) {
              url.searchParams.delete(key);
            }
            window.history.replaceState(null, "", url);
            return defaultModel.id;
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
        setAssemblyMode(
          nextModel.viewer === "hover-dining-table-v1" ? "assembled" : "box",
        );
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
      unit,
    });
  }, [model, params, selectedModelId, unit]);

  const updateParam = (key: string, value: number) => {
    if (!model) {
      return;
    }
    setParams((current) => {
      if (!current) {
        return current;
      }
      const limits = getParameterLimits(model, current, key);
      let nextValue = Math.min(limits.max, Math.max(limits.min, value));
      if (
        model.viewer === "simple-box-v1" &&
        current.gridfinityCompatible >= 0.5 &&
        (key === "length" || key === "width")
      ) {
        nextValue = snapGridfinityDimension(
          nextValue,
          limits.min,
          limits.max,
          model.geometry.gridfinityGridSize,
        );
      }
      return {
        ...current,
        [key]: Number(
          nextValue.toFixed(
            model.viewer === "concentric-tube-jig-v1"
              ? 4
              : CURVE_PARAM_KEYS.has(key)
                ? 3
                : 1,
          ),
        ),
      };
    });
  };

  const setGridfinityCompatible = (checked: boolean) => {
    if (!model || model.viewer !== "simple-box-v1") return;
    setParams((current) => {
      if (!current) return current;
      if (!checked) {
        return { ...current, gridfinityCompatible: 0 };
      }
      const lengthLimits = getParameterLimits(model, current, "length");
      const widthLimits = getParameterLimits(model, current, "width");
      return {
        ...current,
        gridfinityCompatible: 1,
        length: snapGridfinityDimension(
          current.length,
          lengthLimits.min,
          lengthLimits.max,
          model.geometry.gridfinityGridSize,
        ),
        width: snapGridfinityDimension(
          current.width,
          widthLimits.min,
          widthLimits.max,
          model.geometry.gridfinityGridSize,
        ),
      };
    });
  };

  const addDivider = () => {
    setParams((current) => {
      if (!current) return current;
      const count = Math.min(4, Math.round(current.dividerCount ?? 0));
      if (count >= 4) return current;
      const previousPosition = count > 0 ? current[`dividerPosition${count}`] : 0;
      const suggestedPosition = Math.min(
        current.length - 5,
        Math.max(5, previousPosition + (count > 0 ? 25.4 : current.length / 2)),
      );
      return {
        ...current,
        dividerCount: count + 1,
        [`dividerPosition${count + 1}`]: Number(suggestedPosition.toFixed(1)),
      };
    });
  };

  const removeDivider = (index: number) => {
    setParams((current) => {
      if (!current) return current;
      const count = Math.round(current.dividerCount ?? 0);
      const next: ModelParams = {
        ...current,
        dividerCount: Math.max(0, count - 1),
      };
      for (let slot = index + 1; slot < count; slot += 1) {
        next[`dividerPosition${slot}`] = current[`dividerPosition${slot + 1}`];
      }
      return next;
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
    url.searchParams.delete("theme");
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);

    setActiveVersionId(null);
    setActiveVersionTitle(null);
    setLoadError("");
    setModel(null);
    setParams(null);
    setSelectedModelId(modelId);
  };

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  const openLibraryVersion = (version: SavedLibraryVersion) => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", version.modelKey);
    url.searchParams.set("unit", version.unit);
    url.searchParams.delete("theme");
    for (const key of PARAM_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    for (const [key, value] of Object.entries(version.params)) {
      if (Number.isFinite(value)) {
        url.searchParams.set(key, serializeUrlParam(key, value, version.unit));
      }
    }
    window.history.replaceState(null, "", url);

    setUnit(version.unit);
    setActiveVersionId(version._id);
    setActiveVersionTitle(version.title);

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

  const handleSavedVersion = (versionId: Id<"versions">, title: string) => {
    setActiveVersionId(versionId);
    setActiveVersionTitle(title);
  };

  const resizeSidebarBy = (delta: number) => {
    setInspectorWidth((currentWidth) =>
      clamp(
        currentWidth + delta,
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
      ),
    );
  };

  const resizeLibrarySidebarBy = (delta: number) => {
    setLibrarySidebarWidth((currentWidth) =>
      clamp(
        currentWidth + delta,
        LIBRARY_SIDEBAR_MIN_WIDTH,
        LIBRARY_SIDEBAR_MAX_WIDTH,
      ),
    );
  };

  const startLibrarySidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const resize = (pointerEvent: PointerEvent) => {
      setLibrarySidebarWidth(
        clamp(
          pointerEvent.clientX,
          LIBRARY_SIDEBAR_MIN_WIDTH,
          LIBRARY_SIDEBAR_MAX_WIDTH,
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

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const resize = (pointerEvent: PointerEvent) => {
      setInspectorWidth(
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

  if (!model || !params) {
    return <LoadingShell message="Loading model" />;
  }

  return (
    <main
      className="workspace-shell"
      style={
        {
          "--inspector-width": `${inspectorWidth}px`,
          "--inspector-panel-width": `${
            isInspectorCollapsed ? INSPECTOR_COLLAPSED_WIDTH : inspectorWidth
          }px`,
          "--library-sidebar-width": `${
            isLibrarySidebarCollapsed
              ? LIBRARY_SIDEBAR_COLLAPSED_WIDTH
              : librarySidebarWidth
          }px`,
        } as CSSProperties
      }
    >
      <WorkspaceHeader
        activeVersionId={activeVersionId}
        activeVersionTitle={activeVersionTitle}
        convexEnabled={convexEnabled}
        exportFileName={getExportFileName(model, params)}
        model={model}
        onCreateStlBlob={() => viewerRef.current?.getStlBlob() ?? null}
        onExport={() => viewerRef.current?.exportStl()}
        onExportLid={() => viewerRef.current?.exportLidStl()}
        onExportBoxAndLid={() => viewerRef.current?.exportBoxAndLidStl()}
        onSavedVersion={handleSavedVersion}
        onThemeChange={updateTheme}
        params={params}
        theme={theme}
        unit={unit}
      />

      <div className="app-shell">
        <WorkspaceLibrarySidebar
          activeVersionId={activeVersionId}
          catalogModels={catalogSeedModels}
          convexEnabled={convexEnabled}
          isCollapsed={isLibrarySidebarCollapsed}
          selectedModelId={selectedModelId}
          onOpenModel={openModel}
          onOpenVersion={openLibraryVersion}
          onToggleCollapsed={() =>
            setIsLibrarySidebarCollapsed((current) => !current)
          }
        />

        {!isLibrarySidebarCollapsed ? (
          <div
            aria-label="Resize model library"
            aria-orientation="vertical"
            aria-valuemax={LIBRARY_SIDEBAR_MAX_WIDTH}
            aria-valuemin={LIBRARY_SIDEBAR_MIN_WIDTH}
            aria-valuenow={librarySidebarWidth}
            className="sidebar-resizer library-resizer"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                resizeLibrarySidebarBy(-20);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                resizeLibrarySidebarBy(20);
              } else if (event.key === "Home") {
                event.preventDefault();
                setLibrarySidebarWidth(LIBRARY_SIDEBAR_MIN_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setLibrarySidebarWidth(LIBRARY_SIDEBAR_MAX_WIDTH);
              }
            }}
            onPointerDown={startLibrarySidebarResize}
            role="separator"
            tabIndex={0}
          />
        ) : null}

        <section
          className="scene-panel"
          aria-label={`${model.name} model viewer`}
        >
          <HolderViewer
            assemblyMode={assemblyMode}
            coreViewMode={coreViewMode}
            key={model.id}
            model={model}
            onResetParams={resetParams}
            onTrayRotationChange={(value) => updateParam("rotation", value)}
            params={params}
            ref={viewerRef}
            renderMode={renderMode}
            showOriginal={showOriginal}
            theme={theme}
            unit={unit}
          />
        </section>

        {!isInspectorCollapsed ? (
          <div
            aria-label="Resize inspector"
            aria-orientation="vertical"
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuenow={inspectorWidth}
            className="sidebar-resizer inspector-resizer"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                resizeSidebarBy(20);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                resizeSidebarBy(-20);
              } else if (event.key === "Home") {
                event.preventDefault();
                setInspectorWidth(SIDEBAR_MAX_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setInspectorWidth(SIDEBAR_MIN_WIDTH);
              }
            }}
            onPointerDown={startSidebarResize}
            role="separator"
            tabIndex={0}
          />
        ) : null}

        <aside
          className={`inspector${isInspectorCollapsed ? " collapsed" : ""}`}
          aria-label="Parameters and audit"
        >
          {isInspectorCollapsed ? (
            <button
              aria-label="Expand inspector"
              className="inspector-collapse-button"
              onClick={() => setIsInspectorCollapsed(false)}
              title="Expand inspector"
              type="button"
            >
              <PanelRightOpen aria-hidden="true" />
            </button>
          ) : (
            <>
              <header className="inspector-header">
                <div>
                  <p>Model controls</p>
                  <h2>Inspector</h2>
                </div>
                <button
                  aria-label="Collapse inspector"
                  className="inspector-collapse-button"
                  onClick={() => setIsInspectorCollapsed(true)}
                  title="Collapse inspector"
                  type="button"
                >
                  <PanelRightClose aria-hidden="true" />
                </button>
              </header>

              <div className="inspector-body">
                <section className="panel-section">
                  <h2>Parameters</h2>
                  {model.viewer === "dining-table-v1" ||
                  model.viewer === "hover-dining-table-v1" ? (
                    <>
                      <ScaleControl
                        limits={getParameterLimits(model, params, "mockScale")}
                        onChange={(value) => updateParam("mockScale", value)}
                        value={getParam(params, "mockScale")}
                      />
                      {model.viewer === "dining-table-v1" ? (
                        <PostGrooveToggle
                          checked={getParam(params, "legGrooveEnabled") >= 0.5}
                          onChange={(checked) =>
                            updateParam("legGrooveEnabled", checked ? 1 : 0)
                          }
                        />
                      ) : null}
                    </>
                  ) : null}
                  {model.parameters
                    .filter((parameter) => {
                      if (
                        model.viewer === "dining-table-v1" &&
                        getParam(params, "legGrooveEnabled") < 0.5 &&
                        LEG_GROOVE_PARAM_KEYS.has(parameter.key)
                      ) {
                        return false;
                      }
                      return (
                        parameter.key !== "mockScale" &&
                        !ANGLE_PARAM_KEYS.has(parameter.key) &&
                        !CURVE_PARAM_KEYS.has(parameter.key) &&
                        !DIVIDER_PARAM_KEYS.has(parameter.key) &&
                        !OPTION_PARAM_KEYS.has(parameter.key)
                      );
                    })
                    .map((parameter) => (
                      <NumberControl
                        key={parameter.key}
                        label={parameter.label}
                        limits={getParameterLimits(model, params, parameter.key)}
                        onChange={(value) => updateParam(parameter.key, value)}
                        onUnitChange={setUnit}
                        preferFineStep={parameter.key.endsWith("Clearance")}
                        unit={unit}
                        valueMm={params[parameter.key]}
                      />
                    ))}
                  {model.viewer === "hover-dining-table-v1" ? (
                    <section className="nested-parameter-section" aria-label="Bézier curve editor">
                      <div className="divider-controls-heading">
                        <div>
                          <h3>Curve editor</h3>
                          <p>κ scales each control handle from its radius.</p>
                        </div>
                      </div>
                      {model.parameters
                        .filter((parameter) => CURVE_PARAM_KEYS.has(parameter.key))
                        .map((parameter) => (
                          <BezierCurveControl
                            key={parameter.key}
                            label={parameter.label}
                            limits={getParameterLimits(model, params, parameter.key)}
                            onChange={(value) => updateParam(parameter.key, value)}
                            value={getParam(params, parameter.key)}
                          />
                        ))}
                    </section>
                  ) : null}
                  {model.viewer === "simple-box-v1" ? (
                    <GridfinityToggle
                      checked={params.gridfinityCompatible >= 0.5}
                      lengthUnits={getGridfinityUnitCount(
                        params.length,
                        getParameterLimits(model, params, "length").min,
                        getParameterLimits(model, params, "length").max,
                        model.geometry.gridfinityGridSize,
                      )}
                      onChange={setGridfinityCompatible}
                      widthUnits={getGridfinityUnitCount(
                        params.width,
                        getParameterLimits(model, params, "width").min,
                        getParameterLimits(model, params, "width").max,
                        model.geometry.gridfinityGridSize,
                      )}
                    />
                  ) : null}
                  {model.viewer === "door-lock-adapter-v1" ? (
                    <AngleControl
                      label="Inner cutout rotation"
                      limits={getParameterLimits(
                        model,
                        params,
                        "cutoutRotation",
                      )}
                      onChange={(value) => updateParam("cutoutRotation", value)}
                      value={getParam(params, "cutoutRotation")}
                    />
                  ) : null}
                </section>

                {model.viewer === "simple-box-v1" ? (
                  <section className="panel-section">
                    <h2>Assembly proof</h2>
                    <AssemblyPreviewControl
                      onChange={setAssemblyMode}
                      value={assemblyMode}
                    />
                  </section>
                ) : null}

                {model.viewer === "hover-dining-table-v1" ? (
                  <section className="panel-section">
                    <h2>Assembly</h2>
                    <HoverAssemblyControl
                      onChange={setAssemblyMode}
                      value={assemblyMode}
                    />
                    <p className="assembly-mode-note">
                      Explode all 13 pieces or open the full-size dimensioned
                      fabrication sheet.
                    </p>
                  </section>
                ) : null}

                {model.viewer === "simple-box-v1" ? (
                  <section className="panel-section">
                    <h2>Dividers</h2>
                    <DividerControls
                      model={model}
                      onAdd={addDivider}
                      onPositionChange={(index, value) =>
                        updateParam(`dividerPosition${index + 1}`, value)
                      }
                      onRemove={removeDivider}
                      onUnitChange={setUnit}
                      params={params}
                      unit={unit}
                    />
                  </section>
                ) : null}

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
                  {model.viewer !== "dining-table-v1" &&
                  model.viewer !== "hover-dining-table-v1" ? (
                    <OriginalOverlayToggle
                      checked={showOriginal}
                      label={
                        model.viewer === "weighted-paper-towel-holder-v1"
                          ? "Original inlay"
                          : "Original STL"
                      }
                      onChange={setShowOriginal}
                    />
                  ) : null}
                </section>

                <section className="panel-section">
                  <h2>Audit</h2>
                  <AuditList items={auditItems} />
                </section>
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
