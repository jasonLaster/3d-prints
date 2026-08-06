import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createHoverDiningTableCutPartGeometry,
  type ModelParams,
} from "../models";
import type { HoverDiningTableCutPart } from "../models/hoverDiningTable";
import type { HoverDiningTableModelDefinition } from "../models/types";
import { createWoodTexture } from "../woodTexture";

type PartView = "iso" | "top" | "bottom" | "front" | "end" | "free";

type PreviewRuntime = {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  edgeMaterial: THREE.LineBasicMaterial;
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  radius: number;
  render: () => void;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  texture: THREE.Texture | null;
};

const VIEW_PRESETS: Array<{ id: Exclude<PartView, "free">; label: string }> = [
  { id: "iso", label: "ISO" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "front", label: "Front" },
  { id: "end", label: "End" },
];

function clearPartGeometry(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
    }
  }
}

function presetDirection(view: Exclude<PartView, "free">) {
  switch (view) {
    case "top":
      return new THREE.Vector3(0, 0, 1);
    case "bottom":
      return new THREE.Vector3(0, 0, -1);
    case "front":
      return new THREE.Vector3(0, -1, 0);
    case "end":
      return new THREE.Vector3(1, 0, 0);
    default:
      return new THREE.Vector3(1.15, -1.35, 0.9).normalize();
  }
}

function cameraDistance(camera: THREE.PerspectiveCamera, radius: number) {
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  return (Math.max(radius, 0.01) / Math.sin(halfFov)) * 1.18;
}

export function HoverCutPartPreview({
  model,
  params,
  part,
}: {
  model: HoverDiningTableModelDefinition;
  params: ModelParams;
  part: HoverDiningTableCutPart;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const initializedCameraRef = useRef(false);
  const edgesVisibleRef = useRef(true);
  const [isActive, setIsActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [edgesVisible, setEdgesVisible] = useState(true);
  const [view, setView] = useState<PartView>("iso");
  const [error, setError] = useState<string | null>(null);

  const applyView = useCallback((nextView: Exclude<PartView, "free">) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const direction = presetDirection(nextView);
    const distance = cameraDistance(runtime.camera, runtime.radius);
    runtime.camera.up.set(
      0,
      Math.abs(direction.z) > 0.99 ? 1 : 0,
      Math.abs(direction.z) > 0.99 ? 0 : 1,
    );
    runtime.camera.position.copy(direction.multiplyScalar(distance));
    runtime.controls.target.set(0, 0, 0);
    runtime.camera.lookAt(0, 0, 0);
    runtime.controls.update();
    runtime.render();
    setView(nextView);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!("IntersectionObserver" in window)) {
      setIsActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsActive(entry.isIntersecting),
      { rootMargin: "260px 0px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isActive) {
      setIsReady(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "3D preview unavailable");
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xf2ede3, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.className = "hover-cut-3d-canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      `Interactive 3D view of ${part.name}. Drag to rotate and scroll to zoom.`,
    );
    renderer.domElement.tabIndex = 0;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.8;

    const isSteel = part.material === "Steel";
    const texture = isSteel ? null : createWoodTexture(renderer, "oak");
    const material = new THREE.MeshStandardMaterial({
      color: isSteel ? 0x1b1e22 : 0xffffff,
      map: texture,
      metalness: isSteel ? 0.84 : 0,
      roughness: isSteel ? 0.42 : 0.62,
      side: THREE.DoubleSide,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: isSteel ? 0xb6bec8 : 0x443a2c,
      opacity: 0.72,
      transparent: true,
    });
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.HemisphereLight(0xfffbf1, 0x6d6254, 2.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
    keyLight.position.set(-4, -5, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xd8e2ef, 1.25);
    fillLight.position.set(5, 3, 2);
    scene.add(fillLight);

    const render = () => renderer.render(scene, camera);
    const runtime: PreviewRuntime = {
      camera,
      controls,
      edgeMaterial,
      group,
      material,
      radius: 1,
      render,
      renderer,
      scene,
      texture,
    };
    runtimeRef.current = runtime;
    setError(null);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    controls.addEventListener("change", render);
    const markFreeView = () => setView("free");
    controls.addEventListener("start", markFreeView);
    resize();

    return () => {
      resizeObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.removeEventListener("start", markFreeView);
      controls.dispose();
      clearPartGeometry(group);
      material.dispose();
      edgeMaterial.dispose();
      texture?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      initializedCameraRef.current = false;
    };
  }, [isActive, part.material, part.name]);

  useEffect(() => {
    if (!isActive) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;

    let geometry: THREE.BufferGeometry;
    try {
      geometry = createHoverDiningTableCutPartGeometry(params, model, part.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to build part");
      setIsReady(false);
      return;
    }

    clearPartGeometry(runtime.group);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const bounds = geometry.boundingBox;
    const sphere = geometry.boundingSphere;
    if (!bounds || !sphere || sphere.radius <= 0) {
      geometry.dispose();
      setError("Part geometry has invalid bounds");
      setIsReady(false);
      return;
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const mesh = new THREE.Mesh(geometry, runtime.material);
    mesh.position.copy(center).multiplyScalar(-1);
    const edges = new THREE.EdgesGeometry(geometry, 24);
    const outline = new THREE.LineSegments(edges, runtime.edgeMaterial);
    outline.position.copy(mesh.position);
    outline.visible = edgesVisibleRef.current;
    outline.userData.cutPreviewEdges = true;
    runtime.group.add(mesh, outline);

    const oldRadius = runtime.radius;
    runtime.radius = sphere.radius;
    runtime.controls.minDistance = runtime.radius * 0.45;
    runtime.controls.maxDistance = runtime.radius * 8;
    runtime.camera.near = Math.max(runtime.radius / 500, 0.001);
    runtime.camera.far = Math.max(runtime.radius * 30, 100);
    runtime.camera.updateProjectionMatrix();

    if (!initializedCameraRef.current) {
      initializedCameraRef.current = true;
      applyView("iso");
    } else {
      const scale = runtime.radius / Math.max(oldRadius, 0.001);
      runtime.camera.position.multiplyScalar(scale);
      runtime.controls.target.set(0, 0, 0);
      runtime.controls.update();
      runtime.render();
    }
    setError(null);
    setIsReady(true);
  }, [applyView, isActive, model, params, part.id]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.group.traverse((child) => {
      if (child.userData.cutPreviewEdges) child.visible = edgesVisible;
    });
    runtime.render();
  }, [edgesVisible]);

  return (
    <section
      aria-label={`${part.name} 3D inspection`}
      className="hover-cut-3d"
      data-part-id={part.id}
      data-ready={isReady}
      data-view={view}
    >
      <div className="hover-cut-3d-stage" ref={containerRef}>
        {!isReady && !error ? (
          <span className="hover-cut-3d-loading">Loading exact part geometry…</span>
        ) : null}
        {error ? <span className="hover-cut-3d-error">{error}</span> : null}
      </div>
      <div className="hover-cut-3d-toolbar" aria-label="3D view controls">
        <div className="hover-cut-3d-presets" role="group" aria-label="View angle">
          {VIEW_PRESETS.map((preset) => (
            <button
              aria-pressed={view === preset.id}
              disabled={!isReady}
              key={preset.id}
              onClick={() => applyView(preset.id)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          aria-pressed={edgesVisible}
          className="hover-cut-3d-edges"
          disabled={!isReady}
          onClick={() =>
            setEdgesVisible((visible) => {
              edgesVisibleRef.current = !visible;
              return !visible;
            })
          }
          type="button"
        >
          Edges
        </button>
      </div>
      <p className="hover-cut-3d-note">
        Drag to rotate · scroll to zoom · exact {part.material.toLowerCase()} part with finished edges
      </p>
    </section>
  );
}
