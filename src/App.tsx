import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Focus,
  RotateCcw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  forwardRef,
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

type HolderParams = {
  height: number;
  diameter: number;
  tubeDiameter: number;
};

type CoreViewMode = "surface" | "fill" | "section";
type LengthUnit = "mm" | "cm" | "in";
type RenderMode = "solid" | "xray" | "wire";

type ViewerHandle = {
  exportStl: () => void;
  resetCamera: () => void;
};

type AuditStatus = "pass" | "warn";

type AuditItem = {
  label: string;
  value: string;
  status: AuditStatus;
};

const MODEL = {
  mainUrl: "/models/kuchenrolle-main.stl",
  originalHeight: 215.7379913330078,
  originalDiameter: 123.80001068115234,
  mainAxis: new THREE.Vector2(159.82770919799805, 155.08623123168945),
  fixedCoreRadius: 34,
  outerMoveStartRadius: 42,
  bottomLockedHeight: 8,
  topLockedHeight: 18,
  centerTubeOuterDiameter: 36,
  centerTubeInnerDiameter: 25,
  tubeToHolderDiameterClearance: 28,
  centerTubeOriginalTop: 210,
  centerTubeTopClearance: 5.7379913330078125,
  sandBottomHeight: 8,
  sandHeadspace: 3,
  sandDensityGramsPerCc: 1.6,
};

const DEFAULT_PARAMS: HolderParams = {
  height: Number(MODEL.originalHeight.toFixed(1)),
  diameter: Number(MODEL.originalDiameter.toFixed(1)),
  tubeDiameter: MODEL.centerTubeOuterDiameter,
};

const HEIGHT_LIMITS = {
  min: 170,
  max: 450,
  step: 0.5,
};

const DIAMETER_LIMITS = {
  min: 96,
  max: 260,
  step: 0.5,
};

const TUBE_DIAMETER_LIMITS = {
  min: 24,
  max: 120,
  step: 0.5,
};

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
  return `${toUnit(valueMm, unit).toFixed(digits ?? option.digits)} ${option.label}`;
}

function formatSignedLength(valueMm: number, unit: LengthUnit) {
  const normalized = Math.abs(valueMm) < 0.05 ? 0 : valueMm;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${formatLength(normalized, unit)}`;
}

function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  axis: THREE.Vector2,
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute("position");
  const normalized = new Float32Array(sourcePosition.count * 3);

  for (let index = 0; index < sourcePosition.count; index += 1) {
    normalized[index * 3] = sourcePosition.getX(index) - axis.x;
    normalized[index * 3 + 1] = sourcePosition.getY(index) - axis.y;
    normalized[index * 3 + 2] = sourcePosition.getZ(index);
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
  params: HolderParams,
) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = position.array as Float32Array;
  const radiusDelta = params.diameter / 2 - MODEL.originalDiameter / 2;
  const originalTubeRadius = MODEL.centerTubeOuterDiameter / 2;
  const targetTubeRadius = params.tubeDiameter / 2;
  const tubeRadiusScale = targetTubeRadius / originalTubeRadius;
  const originalDomeBase = MODEL.centerTubeOriginalTop - originalTubeRadius;
  const currentDomeBase = getDomeBase(params);
  const originalTopStart = MODEL.originalHeight - MODEL.topLockedHeight;
  const sourceMiddleHeight = originalTopStart - MODEL.bottomLockedHeight;
  const targetMiddleHeight =
    params.height - MODEL.bottomLockedHeight - MODEL.topLockedHeight;
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
      } else if (z > MODEL.bottomLockedHeight) {
        nextZ =
          MODEL.bottomLockedHeight +
          ((z - MODEL.bottomLockedHeight) /
            (originalDomeBase - MODEL.bottomLockedHeight)) *
            (currentDomeBase - MODEL.bottomLockedHeight);
      }
    } else {
      const blend = smoothStep(
        MODEL.fixedCoreRadius,
        MODEL.outerMoveStartRadius,
        radius,
      );
      nextRadius = Math.max(0, radius + radiusDelta * blend);

      if (z >= originalTopStart) {
        nextZ = params.height - (MODEL.originalHeight - z);
      } else if (z > MODEL.bottomLockedHeight) {
        nextZ =
          MODEL.bottomLockedHeight + (z - MODEL.bottomLockedHeight) * heightScale;
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

function updateCylinderGuide(mesh: THREE.Mesh, params: HolderParams) {
  mesh.geometry.dispose();
  mesh.geometry = new THREE.CylinderGeometry(
    params.diameter / 2,
    params.diameter / 2,
    params.height,
    128,
    1,
    true,
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, 0, params.height / 2);
}

function getCenterTubeTop(params: HolderParams) {
  return params.height - MODEL.centerTubeTopClearance;
}

function getDomeBase(params: HolderParams) {
  return getCenterTubeTop(params) - params.tubeDiameter / 2;
}

function getTubeWallThickness() {
  return (
    (MODEL.centerTubeOuterDiameter - MODEL.centerTubeInnerDiameter) / 2
  );
}

function getSandChamberDiameter(params: HolderParams) {
  return Math.max(0, params.tubeDiameter - getTubeWallThickness() * 2);
}

function getSandHeight(params: HolderParams) {
  return Math.max(
    0,
    getDomeBase(params) - MODEL.sandBottomHeight - MODEL.sandHeadspace,
  );
}

function getSandVolumeCc(params: HolderParams) {
  const radius = getSandChamberDiameter(params) / 2;
  return (Math.PI * radius * radius * getSandHeight(params)) / 1000;
}

function createRoundedTopGeometry(params: HolderParams) {
  const radius = params.tubeDiameter / 2;
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
  geometry.translate(0, 0, getDomeBase(params));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSandPreviewGeometry(params: HolderParams) {
  const radius = getSandChamberDiameter(params) / 2;
  const height = getSandHeight(params);
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 56, 1, false);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, MODEL.sandBottomHeight + height / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function updateWeightedCore(
  domeMesh: THREE.Mesh,
  sandMesh: THREE.Mesh,
  params: HolderParams,
) {
  domeMesh.geometry.dispose();
  domeMesh.geometry = createRoundedTopGeometry(params);
  sandMesh.geometry.dispose();
  sandMesh.geometry = createSandPreviewGeometry(params);
}

function applyRenderOptions(
  holderMaterial: THREE.MeshStandardMaterial,
  domeMaterial: THREE.MeshStandardMaterial,
  sandMesh: THREE.Mesh,
  guideMesh: THREE.Mesh,
  coreMode: CoreViewMode,
  renderMode: RenderMode,
) {
  const isCoreSection = coreMode === "section";
  const isCoreFill = coreMode === "fill";
  const isWireframe = renderMode === "wire" || isCoreSection;
  const isTransparent =
    renderMode !== "solid" || isCoreFill || isCoreSection;
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

  [holderMaterial, domeMaterial].forEach((material) => {
    material.transparent = isTransparent;
    material.opacity = opacity;
    material.wireframe = isWireframe;
    material.depthWrite = !isTransparent;
    material.needsUpdate = true;
  });
  sandMesh.visible = coreMode !== "surface";
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

function buildAuditItems(params: HolderParams, unit: LengthUnit): AuditItem[] {
  const heightChanged = Math.abs(params.height - MODEL.originalHeight) > 0.05;
  const diameterChanged = Math.abs(params.diameter - MODEL.originalDiameter) > 0.05;
  const tubeChanged =
    Math.abs(params.tubeDiameter - MODEL.centerTubeOuterDiameter) > 0.05;
  const radiusDelta = params.diameter / 2 - MODEL.originalDiameter / 2;
  const tubeRadiusDelta =
    params.tubeDiameter / 2 - MODEL.centerTubeOuterDiameter / 2;
  const tubeToHolderClearance = (params.diameter - params.tubeDiameter) / 2;
  const targetMiddle =
    params.height - MODEL.bottomLockedHeight - MODEL.topLockedHeight;
  const sandVolume = getSandVolumeCc(params);
  const sandMass = (sandVolume * MODEL.sandDensityGramsPerCc) / 1000;

  return [
    {
      label: "Holder height target",
      value: formatLength(params.height, unit),
      status: targetMiddle > 80 ? "pass" : "warn",
    },
    {
      label: "Holder diameter target",
      value: formatLength(params.diameter, unit),
      status:
        params.diameter >=
        params.tubeDiameter + MODEL.tubeToHolderDiameterClearance
          ? "pass"
          : "warn",
    },
    {
      label: "Center tube outer diameter",
      value: formatLength(params.tubeDiameter, unit),
      status: params.tubeDiameter >= TUBE_DIAMETER_LIMITS.min ? "pass" : "warn",
    },
    {
      label: "Sand chamber",
      value: `${formatLength(getSandChamberDiameter(params), unit)} ID, ${sandVolume.toFixed(
        0,
      )} cc`,
      status: sandVolume > 60 ? "pass" : "warn",
    },
    {
      label: "Estimated sand mass",
      value: `${sandMass.toFixed(2)} kg`,
      status: sandMass > 0.1 ? "pass" : "warn",
    },
    {
      label: "Rounded top",
      value: `${formatLength(params.tubeDiameter / 2, unit)} radius`,
      status: "pass",
    },
    {
      label: "Tube-to-holder clearance",
      value: formatLength(tubeToHolderClearance, unit),
      status:
        tubeToHolderClearance >= MODEL.tubeToHolderDiameterClearance / 2
          ? "pass"
          : "warn",
    },
    {
      label: "Tube radial move",
      value: formatSignedLength(tubeRadiusDelta, unit),
      status: tubeChanged ? "pass" : "pass",
    },
    {
      label: "Rounded top height",
      value: `${formatLength(getCenterTubeTop(params), unit)} high`,
      status: "pass",
    },
    {
      label: "Bottom/top lock bands",
      value: `${formatLength(MODEL.bottomLockedHeight, unit)} + ${formatLength(
        MODEL.topLockedHeight,
        unit,
      )}`,
      status: "pass",
    },
    {
      label: "Outer wall radial move",
      value: formatSignedLength(radiusDelta, unit),
      status: diameterChanged || heightChanged ? "pass" : "pass",
    },
  ];
}

function getHolderDiameterLimits(params: HolderParams) {
  return {
    ...DIAMETER_LIMITS,
    min: Math.max(
      DIAMETER_LIMITS.min,
      params.tubeDiameter + MODEL.tubeToHolderDiameterClearance,
    ),
  };
}

function getTubeDiameterLimits(params: HolderParams) {
  return {
    ...TUBE_DIAMETER_LIMITS,
    max: Math.min(
      TUBE_DIAMETER_LIMITS.max,
      params.diameter - MODEL.tubeToHolderDiameterClearance,
    ),
  };
}

const HolderViewer = forwardRef<
  ViewerHandle,
  {
    params: HolderParams;
    coreViewMode: CoreViewMode;
    renderMode: RenderMode;
    showOriginal: boolean;
    unit: LengthUnit;
  }
>(function HolderViewer(
  { params, coreViewMode, renderMode, showOriginal, unit },
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

  const resetCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    const currentParams = latestParamsRef.current;
    const distance = Math.max(
      currentParams.height * 1.38,
      currentParams.diameter * 2.8,
    );
    camera.position.set(distance * 0.72, -distance, currentParams.height * 0.68);
    camera.near = 0.5;
    camera.far = 2000;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, currentParams.height * 0.46);
    controls.update();
  }, []);

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
      !domeMesh ||
      !sandMesh ||
      !ghostMesh ||
      !guideMesh ||
      !holderMaterial ||
      !domeMaterial ||
      !base
    ) {
      return;
    }

    applyHolderMorph(mainMesh.geometry, base, latestParamsRef.current);
    updateCylinderGuide(guideMesh, latestParamsRef.current);
    updateWeightedCore(domeMesh, sandMesh, latestParamsRef.current);
    applyRenderOptions(
      holderMaterial,
      domeMaterial,
      sandMesh,
      guideMesh,
      latestCoreViewModeRef.current,
      latestRenderModeRef.current,
    );

    ghostMesh.visible = latestShowOriginalRef.current;
  }, []);

  const exportStl = useCallback(() => {
    const mainMesh = mainMeshRef.current;
    const domeMesh = domeMeshRef.current;
    if (!mainMesh || !domeMesh) {
      return;
    }

    const group = new THREE.Group();
    const holder = new THREE.Mesh(mainMesh.geometry.clone());
    holder.name = "adjusted-holder";
    group.add(holder);

    const roundedTop = new THREE.Mesh(domeMesh.geometry.clone());
    roundedTop.name = "rounded-weighted-center-tube-top";
    group.add(roundedTop);
    group.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    const blob = new Blob([result], { type: "model/stl" });
    const fileName = `weighted-paper-holder-h${latestParamsRef.current.height.toFixed(
      1,
    )}-d${latestParamsRef.current.diameter.toFixed(
      1,
    )}-t${latestParamsRef.current.tubeDiameter.toFixed(1)}.stl`;
    downloadBlob(blob, fileName);

    holder.geometry.dispose();
    roundedTop.geometry.dispose();
  }, []);

  useImperativeHandle(ref, () => ({ exportStl, resetCamera }), [
    exportStl,
    resetCamera,
  ]);

  useEffect(() => {
    latestParamsRef.current = params;
    latestCoreViewModeRef.current = coreViewMode;
    latestRenderModeRef.current = renderMode;
    latestShowOriginalRef.current = showOriginal;
    updateMeshes();
  }, [params, coreViewMode, renderMode, showOriginal, updateMeshes]);

  useEffect(() => {
    resetCamera();
  }, [params.height, params.diameter, resetCamera]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f7f2");
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

    const grid = new THREE.GridHelper(260, 26, "#9da88d", "#cfd7c8");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.2;
    scene.add(grid);

    const guide = new THREE.Mesh(
      new THREE.CylinderGeometry(
        DEFAULT_PARAMS.diameter / 2,
        DEFAULT_PARAMS.diameter / 2,
        DEFAULT_PARAMS.height,
        128,
        1,
        true,
      ),
      new THREE.MeshBasicMaterial({
        color: "#c4934b",
        transparent: true,
        opacity: 0.2,
        wireframe: true,
      }),
    );
    guideMeshRef.current = guide;
    scene.add(guide);

    let disposed = false;
    const loader = new STLLoader();

    loader.loadAsync(MODEL.mainUrl).then((mainGeometry) => {
      if (disposed) {
        mainGeometry.dispose();
        return;
      }

      const normalizedMain = normalizeGeometry(mainGeometry, MODEL.mainAxis);
      mainBaseRef.current = normalizedMain.basePositions;

      const mainMaterial = new THREE.MeshStandardMaterial({
        color: "#111313",
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
      mainMesh.name = "adjustable-holder";
      scene.add(mainMesh);
      mainMeshRef.current = mainMesh;

      const domeMesh = new THREE.Mesh(
        createRoundedTopGeometry(latestParamsRef.current),
        domeMaterial,
      );
      domeMesh.name = "rounded-weighted-center-tube-top";
      scene.add(domeMesh);
      domeMeshRef.current = domeMesh;

      const sandMesh = new THREE.Mesh(
        createSandPreviewGeometry(latestParamsRef.current),
        sandMaterial,
      );
      sandMesh.name = "sand-fill-preview";
      sandMesh.visible = latestCoreViewModeRef.current !== "surface";
      scene.add(sandMesh);
      sandMeshRef.current = sandMesh;

      const ghostMesh = new THREE.Mesh(
        normalizedMain.geometry.clone(),
        ghostMaterial,
      );
      ghostMesh.name = "original-holder-overlay";
      ghostMesh.visible = latestShowOriginalRef.current;
      scene.add(ghostMesh);
      ghostMeshRef.current = ghostMesh;

      updateMeshes();
      resetCamera();

      mainGeometry.dispose();
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
  }, [resetCamera, updateMeshes]);

  return (
    <div className="viewer" ref={containerRef}>
      <div className="viewer-status" data-testid="viewer-status">
        <span>{formatLength(params.height, unit)}</span>
        <span>{formatLength(params.diameter, unit)}</span>
        <span>Tube {formatLength(params.tubeDiameter, unit)}</span>
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
            aria-label="Frame model"
            onClick={resetCamera}
            title="Frame model"
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
  limits: { min: number; max: number; step: number };
  unit: LengthUnit;
  onChange: (valueMm: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const unitId = `${id}-unit`;
  const unitOption = UNIT_OPTIONS[unit];
  const displayValue = Number(toUnit(valueMm, unit).toFixed(unitOption.digits));
  const displayMin = Number(toUnit(limits.min, unit).toFixed(unitOption.digits));
  const displayMax = Number(toUnit(limits.max, unit).toFixed(unitOption.digits));
  const displayStep = Number(toUnit(limits.step, unit).toFixed(unitOption.digits));
  const updateValue = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const nextMm = fromUnit(parsed, unit);
    onChange(Math.min(limits.max, Math.max(limits.min, nextMm)));
  };

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
          type="number"
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          onChange={(event) => updateValue(event.currentTarget.value)}
        />
        <select
          aria-label={`${label} units`}
          id={unitId}
          onChange={(event) => onUnitChange(event.currentTarget.value as LengthUnit)}
          title={`${label} units`}
          value={unit}
        >
          {Object.entries(UNIT_OPTIONS).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </select>
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
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>Original inlay</span>
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

export default function App() {
  const [params, setParams] = useState<HolderParams>(DEFAULT_PARAMS);
  const [unit, setUnit] = useState<LengthUnit>("mm");
  const [coreViewMode, setCoreViewMode] = useState<CoreViewMode>("surface");
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [showOriginal, setShowOriginal] = useState(false);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const auditItems = useMemo(() => buildAuditItems(params, unit), [params, unit]);
  const holderDiameterLimits = useMemo(
    () => getHolderDiameterLimits(params),
    [params],
  );
  const tubeDiameterLimits = useMemo(
    () => getTubeDiameterLimits(params),
    [params],
  );

  const updateParam = (key: keyof HolderParams, value: number) => {
    setParams((current) => ({
      ...current,
      [key]: Number(value.toFixed(1)),
    }));
  };

  const resetParams = () => {
    setParams(DEFAULT_PARAMS);
  };

  return (
    <main className="app-shell">
      <section className="scene-panel" aria-label="Paper holder model viewer">
        <HolderViewer
          coreViewMode={coreViewMode}
          params={params}
          ref={viewerRef}
          renderMode={renderMode}
          showOriginal={showOriginal}
          unit={unit}
        />
      </section>

      <aside className="inspector" aria-label="Parameters and audit">
        <header className="inspector-header">
          <div>
            <p>Parametric STL</p>
            <h1>Paper Holder</h1>
          </div>
          <SlidersHorizontal aria-hidden="true" />
        </header>

        <div className="inspector-body">
          <section className="panel-section">
            <h2>Parameters</h2>
            <NumberControl
              label="Holder height"
              limits={HEIGHT_LIMITS}
              onChange={(value) => updateParam("height", value)}
              onUnitChange={setUnit}
              unit={unit}
              valueMm={params.height}
            />
            <NumberControl
              label="Holder diameter"
              limits={holderDiameterLimits}
              onChange={(value) => updateParam("diameter", value)}
              onUnitChange={setUnit}
              unit={unit}
              valueMm={params.diameter}
            />
            <NumberControl
              label="Center tube diameter"
              limits={tubeDiameterLimits}
              onChange={(value) => updateParam("tubeDiameter", value)}
              onUnitChange={setUnit}
              unit={unit}
              valueMm={params.tubeDiameter}
            />
          </section>

          <section className="panel-section">
            <h2>Weighted Center</h2>
            <CoreViewControl onChange={setCoreViewMode} value={coreViewMode} />
          </section>

          <section className="panel-section">
            <h2>Rendering</h2>
            <RenderModeControl onChange={setRenderMode} value={renderMode} />
            <OriginalOverlayToggle
              checked={showOriginal}
              onChange={setShowOriginal}
            />
          </section>

          <section className="panel-section">
            <h2>Audit</h2>
            <AuditList items={auditItems} />
          </section>
        </div>

        <footer className="inspector-actions">
          <button onClick={resetParams} title="Reset parameters" type="button">
            <RotateCcw aria-hidden="true" />
            Reset
          </button>
          <button
            onClick={() => viewerRef.current?.resetCamera()}
            title="Frame model"
            type="button"
          >
            <Focus aria-hidden="true" />
            Frame
          </button>
          <button
            className="primary-action"
            onClick={() => viewerRef.current?.exportStl()}
            title="Export adjusted STL"
            type="button"
          >
            <Download aria-hidden="true" />
            Export
          </button>
        </footer>
      </aside>
    </main>
  );
}
