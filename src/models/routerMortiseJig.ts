import * as THREE from "three";
import { formatLength } from "../units";
import { getParam, getParameter } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  RouterMortiseJigModelDefinition,
} from "./types";

const EPSILON = 1e-6;

type Point = THREE.Vector2;

export type RouterMortiseJigSpec = {
  plateLength: number;
  plateWidth: number;
  plateThickness: number;
  plateCornerRadius: number;
  openingLength: number;
  openingWidth: number;
  workpieceWidth: number;
  stockThickness: number;
  workpieceWiggle: number;
  jawLength: number;
  jawThickness: number;
  jawDepth: number;
  jawCenterY: number;
  boltStationX: number;
  boltSlotWidth: number;
  insertPocketDiameter: number;
  insertDepth: number;
  insertFloor: number;
  insertSideWall: number;
  routerBitDiameter: number;
  guideBushingDiameter: number;
  routerBaseDiameter: number;
  templateWiggle: number;
  minimumPlateWeb: number;
};

export type RouterMortiseJigPart = {
  key: "guide-plate" | "left-fence" | "right-fence";
  label: string;
  quantity: number;
  geometry: THREE.BufferGeometry;
};

export type RouterMortiseJigPreviewPart = {
  key: "left-fence" | "right-fence" | "workpiece" | "router-base" | "router-motor" | "guide-bushing" | "router-bit";
  material: "printed" | "workpiece" | "router" | "metal" | "bit";
  geometry: THREE.BufferGeometry;
};

function roundedRectangleRing(
  length: number,
  width: number,
  radius: number,
  cornerSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const safeRadius = Math.max(
    EPSILON,
    Math.min(radius, halfLength - EPSILON, halfWidth - EPSILON),
  );
  const corners = [
    { x: halfLength - safeRadius, y: -halfWidth + safeRadius, start: -Math.PI / 2 },
    { x: halfLength - safeRadius, y: halfWidth - safeRadius, start: 0 },
    { x: -halfLength + safeRadius, y: halfWidth - safeRadius, start: Math.PI / 2 },
    { x: -halfLength + safeRadius, y: -halfWidth + safeRadius, start: Math.PI },
  ];
  return corners.flatMap((corner) =>
    Array.from({ length: cornerSegments }, (_, index) => {
      const angle = corner.start + (index / (cornerSegments - 1)) * Math.PI / 2;
      return new THREE.Vector2(
        centerX + corner.x + Math.cos(angle) * safeRadius,
        centerY + corner.y + Math.sin(angle) * safeRadius,
      );
    }),
  );
}

function circleRing(
  radius: number,
  segments: number,
  centerX = 0,
  centerY = 0,
) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    );
  });
}

function capsuleRing(
  length: number,
  width: number,
  axis: "x" | "y",
  arcSegments: number,
  centerX = 0,
  centerY = 0,
) {
  const radius = width / 2;
  const straight = Math.max(0, length - width);
  const points: Point[] = [];
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = -Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  for (let index = 0; index <= arcSegments; index += 1) {
    const angle = Math.PI / 2 + (index / arcSegments) * Math.PI;
    points.push(
      new THREE.Vector2(
        -straight / 2 + Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      ),
    );
  }
  return points.map((point) =>
    axis === "x"
      ? new THREE.Vector2(centerX + point.x, centerY + point.y)
      : new THREE.Vector2(centerX - point.y, centerY + point.x),
  );
}

function addTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function addRingBridge(
  positions: number[],
  lower: Point[],
  upper: Point[],
  lowerZ: number,
  upperZ: number,
  inward = false,
) {
  for (let index = 0; index < lower.length; index += 1) {
    const next = (index + 1) % lower.length;
    const a = new THREE.Vector3(lower[index].x, lower[index].y, lowerZ);
    const b = new THREE.Vector3(lower[next].x, lower[next].y, lowerZ);
    const c = new THREE.Vector3(upper[next].x, upper[next].y, upperZ);
    const d = new THREE.Vector3(upper[index].x, upper[index].y, upperZ);
    if (inward) {
      addTriangle(positions, a, c, b);
      addTriangle(positions, a, d, c);
    } else {
      addTriangle(positions, a, b, c);
      addTriangle(positions, a, c, d);
    }
  }
}

function addHorizontalFace(
  positions: number[],
  contour: Point[],
  holes: Point[][],
  z: number,
  upward: boolean,
) {
  // ShapeUtils expects a clockwise contour and counter-clockwise holes.
  const outer = contour.slice().reverse().map((point) => point.clone());
  const inner = holes.map((hole) => hole.map((point) => point.clone()));
  const triangles = THREE.ShapeUtils.triangulateShape(outer, inner);
  const points = [...outer, ...inner.flat()];
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = new THREE.Vector3(points[aIndex].x, points[aIndex].y, z);
    const b = new THREE.Vector3(points[bIndex].x, points[bIndex].y, z);
    const c = new THREE.Vector3(points[cIndex].x, points[cIndex].y, z);
    const cross = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a)).z;
    if ((cross > 0) === upward) addTriangle(positions, a, b, c);
    else addTriangle(positions, a, c, b);
  }
}

function buildGeometry(positions: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getRouterMortiseJigSpec(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
): RouterMortiseJigSpec {
  const mortiseLength = getParam(params, "mortiseLength");
  const mortiseWidth = getParam(params, "mortiseWidth");
  const routerBitDiameter = getParam(params, "routerBitDiameter");
  const guideBushingDiameter = getParam(params, "guideBushingDiameter");
  const templateWiggle = getParam(params, "templateWiggle");
  const workpieceWidth = getParam(params, "workpieceWidth");
  const workpieceWiggle = getParam(params, "workpieceWiggle");
  const jawThickness = model.geometry.jawThickness;
  const jawDepth = getParam(params, "jawDepth");
  const insertPocketDiameter = getParam(params, "insertPocketDiameter");
  const insertDepth = getParam(params, "insertDepth");
  const openingLength =
    mortiseLength + guideBushingDiameter - routerBitDiameter + templateWiggle;
  const openingWidth =
    mortiseWidth + guideBushingDiameter - routerBitDiameter + templateWiggle;
  const jawCenterY = workpieceWidth / 2 + workpieceWiggle / 2 + jawThickness / 2;
  const slotInnerEdge = model.geometry.boltStationX - model.geometry.boltSlotWidth / 2;
  const openingEnd = openingLength / 2;
  const maximumAdjustmentCenter =
    model.geometry.maximumWorkpieceWidth / 2 +
    model.geometry.maximumWorkpieceWiggle / 2 +
    jawThickness / 2;
  const plateEdgeWeb =
    model.geometry.plateWidth / 2 -
    (maximumAdjustmentCenter + model.geometry.boltSlotWidth / 2);
  const bridgeWeb = slotInnerEdge - openingEnd;

  return {
    plateLength: model.geometry.plateLength,
    plateWidth: model.geometry.plateWidth,
    plateThickness: getParam(params, "plateThickness"),
    plateCornerRadius: model.geometry.plateCornerRadius,
    openingLength,
    openingWidth,
    workpieceWidth,
    stockThickness: getParam(params, "stockThickness"),
    workpieceWiggle,
    jawLength: model.geometry.jawLength,
    jawThickness,
    jawDepth,
    jawCenterY,
    boltStationX: model.geometry.boltStationX,
    boltSlotWidth: model.geometry.boltSlotWidth,
    insertPocketDiameter,
    insertDepth,
    insertFloor: jawDepth - insertDepth,
    insertSideWall: (jawThickness - insertPocketDiameter) / 2,
    routerBitDiameter,
    guideBushingDiameter,
    routerBaseDiameter: getParam(params, "routerBaseDiameter"),
    templateWiggle,
    minimumPlateWeb: Math.min(plateEdgeWeb, bridgeWeb),
  };
}

function getAdjustmentSlotRings(model: RouterMortiseJigModelDefinition) {
  const { boltStationX, boltSlotWidth, jawThickness } = model.geometry;
  const minCenter =
    model.geometry.minimumWorkpieceWidth / 2 + jawThickness / 2;
  const maxCenter =
    model.geometry.maximumWorkpieceWidth / 2 +
    model.geometry.maximumWorkpieceWiggle / 2 +
    jawThickness / 2;
  const totalLength = maxCenter - minCenter + boltSlotWidth;
  const center = (minCenter + maxCenter) / 2;
  return [-1, 1].flatMap((xSign) =>
    [-1, 1].map((ySign) =>
      capsuleRing(
        totalLength,
        boltSlotWidth,
        "y",
        model.geometry.slotArcSegments,
        xSign * boltStationX,
        ySign * center,
      ),
    ),
  );
}

function getPresetMarkerRings(
  model: RouterMortiseJigModelDefinition,
  workpieceWiggle: number,
) {
  const markerX = model.geometry.boltStationX - model.geometry.markerOffsetX;
  return [-1, 1].flatMap((xSign) =>
    model.geometry.presetWorkpieceWidthsMm.flatMap((width) => {
      const center =
        width / 2 + workpieceWiggle / 2 + model.geometry.jawThickness / 2;
      return [-1, 1].map((ySign) =>
        capsuleRing(
          model.geometry.markerLength,
          model.geometry.markerWidth,
          "x",
          model.geometry.markerArcSegments,
          xSign * markerX,
          ySign * center,
        ),
      );
    }),
  );
}

export function createRouterMortiseJigGuideGeometry(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
) {
  const spec = getRouterMortiseJigSpec(params, model);
  const outer = roundedRectangleRing(
    spec.plateLength,
    spec.plateWidth,
    spec.plateCornerRadius,
    model.geometry.cornerSegments,
  );
  const holes = [
    capsuleRing(
      spec.openingLength,
      spec.openingWidth,
      "x",
      model.geometry.slotArcSegments,
    ),
    ...getAdjustmentSlotRings(model),
    ...getPresetMarkerRings(model, spec.workpieceWiggle),
  ];
  const positions: number[] = [];
  addHorizontalFace(positions, outer, holes, 0, false);
  addRingBridge(positions, outer, outer, 0, spec.plateThickness);
  holes.forEach((hole) =>
    addRingBridge(positions, hole, hole, 0, spec.plateThickness, true),
  );
  addHorizontalFace(positions, outer, holes, spec.plateThickness, true);
  return buildGeometry(positions);
}

export function createRouterMortiseJigFenceGeometry(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
) {
  const spec = getRouterMortiseJigSpec(params, model);
  const outer = roundedRectangleRing(
    spec.jawLength,
    spec.jawThickness,
    model.geometry.jawCornerRadius,
    model.geometry.cornerSegments,
  );
  const nominalHoles = [-1, 1].map((sign) =>
    circleRing(
      spec.insertPocketDiameter / 2,
      model.geometry.radialSegments,
      sign * spec.boltStationX,
    ),
  );
  const entryHoles = [-1, 1].map((sign) =>
    circleRing(
      spec.insertPocketDiameter / 2 + model.geometry.insertLeadIn,
      model.geometry.radialSegments,
      sign * spec.boltStationX,
    ),
  );
  const leadInHeight = Math.min(
    model.geometry.insertLeadIn,
    spec.insertDepth / 2,
  );
  const positions: number[] = [];
  addHorizontalFace(positions, outer, [], 0, false);
  addRingBridge(positions, outer, outer, 0, spec.jawDepth);
  addHorizontalFace(positions, outer, entryHoles, spec.jawDepth, true);
  nominalHoles.forEach((hole, index) => {
    addHorizontalFace(positions, hole, [], spec.insertFloor, true);
    addRingBridge(
      positions,
      hole,
      hole,
      spec.insertFloor,
      spec.jawDepth - leadInHeight,
      true,
    );
    addRingBridge(
      positions,
      hole,
      entryHoles[index],
      spec.jawDepth - leadInHeight,
      spec.jawDepth,
      true,
    );
  });
  return buildGeometry(positions);
}

export function createRouterMortiseJigPartGeometries(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
): RouterMortiseJigPart[] {
  return [
    {
      key: "guide-plate",
      label: "Guide plate",
      quantity: 1,
      geometry: createRouterMortiseJigGuideGeometry(params, model),
    },
    {
      key: "left-fence",
      label: "Left fence jaw",
      quantity: 1,
      geometry: createRouterMortiseJigFenceGeometry(params, model),
    },
    {
      key: "right-fence",
      label: "Right fence jaw",
      quantity: 1,
      geometry: createRouterMortiseJigFenceGeometry(params, model),
    },
  ];
}

function orientCylinderAlongZ(geometry: THREE.BufferGeometry) {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function createRouterMortiseJigPreviewParts(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
): RouterMortiseJigPreviewPart[] {
  const spec = getRouterMortiseJigSpec(params, model);
  const leftFence = createRouterMortiseJigFenceGeometry(params, model);
  leftFence.translate(0, -spec.jawCenterY, -spec.jawDepth);
  const rightFence = createRouterMortiseJigFenceGeometry(params, model);
  rightFence.translate(0, spec.jawCenterY, -spec.jawDepth);

  const workpiece = new THREE.BoxGeometry(
    model.geometry.workpiecePreviewLength,
    spec.workpieceWidth,
    spec.stockThickness,
  );
  workpiece.translate(0, 0, -spec.stockThickness / 2);

  const baseThickness = model.geometry.routerBaseThickness;
  const routerBase = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.routerBaseDiameter / 2,
      spec.routerBaseDiameter / 2,
      baseThickness,
      model.geometry.radialSegments,
    ),
  );
  routerBase.translate(0, 0, spec.plateThickness + baseThickness / 2);

  const motorHeight = model.geometry.routerMotorHeight;
  const routerMotor = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      model.geometry.routerMotorDiameter / 2,
      model.geometry.routerMotorDiameter / 2,
      motorHeight,
      model.geometry.radialSegments,
    ),
  );
  routerMotor.translate(
    0,
    0,
    spec.plateThickness + baseThickness + motorHeight / 2,
  );

  const bushingHeight = model.geometry.bushingProjection;
  const guideBushing = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.guideBushingDiameter / 2,
      spec.guideBushingDiameter / 2,
      bushingHeight,
      model.geometry.radialSegments,
    ),
  );
  guideBushing.translate(
    0,
    0,
    spec.plateThickness - bushingHeight / 2,
  );

  const bitHeight =
    spec.plateThickness + Math.min(spec.stockThickness, model.geometry.bitPreviewDepth);
  const routerBit = orientCylinderAlongZ(
    new THREE.CylinderGeometry(
      spec.routerBitDiameter / 2,
      spec.routerBitDiameter / 2,
      bitHeight,
      model.geometry.radialSegments,
    ),
  );
  routerBit.translate(
    0,
    0,
    spec.plateThickness - bitHeight / 2,
  );

  return [
    { key: "left-fence", material: "printed", geometry: leftFence },
    { key: "right-fence", material: "printed", geometry: rightFence },
    { key: "workpiece", material: "workpiece", geometry: workpiece },
    { key: "router-base", material: "router", geometry: routerBase },
    { key: "router-motor", material: "router", geometry: routerMotor },
    { key: "guide-bushing", material: "metal", geometry: guideBushing },
    { key: "router-bit", material: "bit", geometry: routerBit },
  ];
}

export function getRouterMortiseJigDimensions(
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
): ModelDimensions {
  const spec = getRouterMortiseJigSpec(params, model);
  return {
    length: spec.plateLength,
    width: Math.max(spec.plateWidth, spec.routerBaseDiameter),
    height:
      spec.stockThickness +
      spec.plateThickness +
      model.geometry.routerBaseThickness +
      model.geometry.routerMotorHeight,
  };
}

export function updateRouterMortiseJigGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
  model: RouterMortiseJigModelDefinition,
) {
  const spec = getRouterMortiseJigSpec(params, model);
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(
    spec.plateLength,
    spec.plateWidth,
    spec.plateThickness,
  );
  mesh.position.z = spec.plateThickness / 2;
}

export function getRouterMortiseJigParameterLimits(
  model: RouterMortiseJigModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };
  if (key === "mortiseWidth") {
    limits.min = Math.max(limits.min, getParam(params, "routerBitDiameter"));
    limits.max = Math.min(limits.max, getParam(params, "mortiseLength"));
  } else if (key === "mortiseLength") {
    limits.min = Math.max(limits.min, getParam(params, "mortiseWidth"));
    const maximumOpening =
      model.geometry.boltStationX * 2 -
      model.geometry.boltSlotWidth -
      model.geometry.minimumPlateWeb * 2;
    limits.max = Math.min(
      limits.max,
      maximumOpening -
        getParam(params, "guideBushingDiameter") +
        getParam(params, "routerBitDiameter") -
        getParam(params, "templateWiggle"),
    );
  } else if (key === "routerBitDiameter") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "mortiseWidth"),
      getParam(params, "guideBushingDiameter") -
        model.geometry.minimumBushingRadialClearance * 2,
    );
  } else if (key === "guideBushingDiameter") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "routerBitDiameter") +
        model.geometry.minimumBushingRadialClearance * 2,
    );
  } else if (key === "workpieceWidth") {
    limits.min = Math.max(limits.min, model.geometry.minimumWorkpieceWidth);
    limits.max = Math.min(limits.max, model.geometry.maximumWorkpieceWidth);
  } else if (key === "workpieceWiggle") {
    limits.max = Math.min(
      limits.max,
      model.geometry.maximumWorkpieceWiggle,
    );
  } else if (key === "insertPocketDiameter") {
    limits.max = Math.min(
      limits.max,
      model.geometry.jawThickness - model.geometry.minimumInsertSideWall * 2,
    );
  } else if (key === "insertDepth") {
    limits.max = Math.min(
      limits.max,
      getParam(params, "jawDepth") - model.geometry.minimumInsertFloor,
    );
  } else if (key === "jawDepth") {
    limits.min = Math.max(
      limits.min,
      getParam(params, "insertDepth") + model.geometry.minimumInsertFloor,
    );
  }
  limits.max = Math.max(limits.min, limits.max);
  return limits;
}

export function getRouterMortiseJigAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: RouterMortiseJigModelDefinition,
): AuditItem {
  const spec = getRouterMortiseJigSpec(params, model);
  const mortiseLength = getParam(params, "mortiseLength");
  const mortiseWidth = getParam(params, "mortiseWidth");
  const pass = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "pass",
  });
  const warn = (value: string): AuditItem => ({
    label: check.label,
    value,
    status: "warn",
  });

  switch (check.key) {
    case "mortiseTarget":
      return pass(
        `${formatLength(mortiseWidth, unit)} × ${formatLength(mortiseLength, unit)} target`,
      );
    case "templateOpening":
      return pass(
        `${formatLength(spec.openingWidth, unit)} × ${formatLength(spec.openingLength, unit)} · includes ${formatLength(spec.templateWiggle, unit)} total wiggle room`,
      );
    case "routerInterface":
      return spec.guideBushingDiameter - spec.routerBitDiameter >=
        model.geometry.minimumBushingRadialClearance * 2
        ? pass(
            `${formatLength(spec.routerBitDiameter, unit)} cutter · ${formatLength(spec.guideBushingDiameter, unit)} guide bushing · ${formatLength(spec.routerBaseDiameter, unit)} base`,
          )
        : warn("Guide bushing does not safely clear the cutter");
    case "workpieceFit":
      return pass(
        `${formatLength(spec.workpieceWidth, unit)} stock · ${formatLength(spec.workpieceWiggle, unit)} total jaw wiggle room`,
      );
    case "heatSetInserts":
      return spec.insertSideWall >= model.geometry.minimumInsertSideWall &&
        spec.insertFloor >= model.geometry.minimumInsertFloor
        ? pass(
            `4 × M5 · ${formatLength(spec.insertPocketDiameter, unit)} Ø × ${formatLength(spec.insertDepth, unit)} deep pockets`,
          )
        : warn(
            `${formatLength(spec.insertSideWall, unit)} side wall · ${formatLength(spec.insertFloor, unit)} floor`,
          );
    case "adjustmentRange":
      return pass(
        `${formatLength(model.geometry.minimumWorkpieceWidth, unit)}–${formatLength(model.geometry.maximumWorkpieceWidth, unit)} · ${model.geometry.presetWorkpieceWidthsMm.map((value) => formatLength(value, unit)).join(" · ")} witness marks`,
      );
    case "minimumPlateWeb":
      return spec.minimumPlateWeb >= model.geometry.minimumPlateWeb
        ? pass(formatLength(spec.minimumPlateWeb, unit))
        : warn(`${formatLength(spec.minimumPlateWeb, unit)} around openings`);
    case "printSet":
      return pass("3 individual STLs · 1 guide plate + 2 fence jaws");
    case "previewStandIn":
      return pass("Router base, guide bushing, cutter, and sample stock · preview only");
    case "printOrientation":
      return pass("Plate flat · jaws flat with insert pockets facing up · no supports");
    default:
      return warn("Unsupported audit check");
  }
}
