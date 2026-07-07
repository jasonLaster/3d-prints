import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Focus,
  GitFork,
  Layers3,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
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
import {
  applyHolderMorph,
  applyTrayMorph,
  buildAuditItems,
  createRoundedTopGeometry,
  createSandChamberFloorGeometry,
  createSandPreviewGeometry,
  getDefaultParams,
  getModelDimensions,
  getParam,
  getParameterLimits,
  getStatusItems,
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
type ViewPreset = "iso" | "top" | "xEdge" | "yEdge";

type ViewerHandle = {
  exportStl: () => void;
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
const PARAM_QUERY_KEYS = [
  "height",
  "diameter",
  "tubeDiameter",
  "length",
  "width",
  "floorThickness",
  "ribRelief",
  "rotation",
];
const ANGLE_PARAM_KEYS = new Set(["rotation"]);
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

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getInitialUnit(): LengthUnit {
  const unit = new URLSearchParams(window.location.search).get("unit");
  return isLengthUnit(unit) ? unit : "mm";
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

  if (ANGLE_PARAM_KEYS.has(parameter.key)) {
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
  const unit = isLengthUnit(requestedUnit) ? requestedUnit : "mm";

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

  return params;
}

function serializeUrlParam(key: string, valueMm: number, unit: LengthUnit) {
  if (ANGLE_PARAM_KEYS.has(key)) {
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

function getExportFileName(model: ModelDefinition, params: ModelParams) {
  const suffix = model.parameters
    .map(
      (parameter) =>
        `${parameter.key}-${getParam(params, parameter.key).toFixed(1)}`,
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
    onResetParams: () => void;
    onTrayRotationChange: (value: number) => void;
  }
>(function HolderViewer(
  {
    model,
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
    const sandFloorMesh = sandFloorMeshRef.current;
    if (!mainMesh) {
      return null;
    }

    const group = new THREE.Group();
    const holder = new THREE.Mesh(createCleanExportGeometry(mainMesh.geometry));
    holder.name = `${model.id}-body`;
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
    group.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    const blob = new Blob([result], { type: "model/stl" });

    holder.geometry.dispose();
    roundedTop?.geometry.dispose();
    sandFloor?.geometry.dispose();

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
      sceneRef.current.background =
        theme === "dark" ? null : new THREE.Color(SCENE_BACKGROUND[theme]);
    }
    if (rendererRef.current) {
      rendererRef.current.setClearAlpha(theme === "dark" ? 0 : 1);
    }
    const mainMaterial = mainMaterialRef.current;
    if (mainMaterial && model.viewer !== "japandi-tray-v1") {
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
    controls.minDistance = 80;
    controls.maxDistance = 1400;
    controlsRef.current = controls;
    const handleControlChange = () => updateCubeOrientation();
    const handleControlStart = () => setActiveViewPreset(null);
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
            getParam(initialParams, "length"),
            getParam(initialParams, "width"),
            getParam(initialParams, "height"),
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

        const mainMaterial = new THREE.MeshStandardMaterial({
          color:
            model.viewer === "japandi-tray-v1"
              ? "#d8dee9"
              : theme === "dark"
                ? "#202734"
                : "#111318",
          roughness: 0.78,
          metalness: 0.08,
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

  return (
    <div className="viewer" ref={containerRef}>
      <div className="viewer-backdrop" aria-hidden="true" />
      <div className="viewer-status" data-testid="viewer-status">
        {getStatusItems(model, params, unit).map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>{RENDER_MODE_LABELS[renderMode]}</span>
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
      stepLengthInput(sourceMm, unit, limits.step, direction),
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
                Export
              </button>
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
                  {model.parameters
                    .filter((parameter) => !ANGLE_PARAM_KEYS.has(parameter.key))
                    .map((parameter) => (
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
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
