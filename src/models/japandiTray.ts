import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { formatLength } from "../units";
import { getParam, getParameter, smoothStep } from "./shared";
import type {
  AuditCheckDefinition,
  AuditItem,
  LengthUnit,
  ModelDimensions,
  ModelParams,
  NumberLimits,
  SimpleBoxModelDefinition,
  TrayModelDefinition,
} from "./types";

type ContainerModelDefinition = TrayModelDefinition | SimpleBoxModelDefinition;

export function getGridfinityUnitCount(
  value: number,
  min: number,
  max: number,
  gridSize = 42,
) {
  const minimumUnits = Math.ceil((min + 0.5) / gridSize);
  const maximumUnits = Math.floor((max + 0.5) / gridSize);
  return Math.min(
    maximumUnits,
    Math.max(minimumUnits, Math.round((value + 0.5) / gridSize)),
  );
}

export function snapGridfinityDimension(
  value: number,
  min: number,
  max: number,
  gridSize = 42,
) {
  return getGridfinityUnitCount(value, min, max, gridSize) * gridSize - 0.5;
}

export function getTrayParameterLimits(
  model: ContainerModelDefinition,
  params: ModelParams,
  key: string,
): NumberLimits {
  const limits = { ...getParameter(model, key).limits };

  if (key === "floorThickness") {
    limits.max = Math.min(limits.max, getParam(params, "height") - 1);
  } else if (key.startsWith("dividerPosition")) {
    limits.max = Math.max(limits.min, getParam(params, "length") - 5);
  }

  return limits;
}

export function getTrayDimensions(params: ModelParams): ModelDimensions {
  return {
    length: getParam(params, "length"),
    width: getParam(params, "width"),
    height: getParam(params, "height"),
  };
}

export function applyTrayMorph(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  params: ModelParams,
  model: ContainerModelDefinition,
) {
  const settings = model.geometry;
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const target = position.array as Float32Array;
  const footprintRotation = THREE.MathUtils.degToRad(
    settings.footprintRotationDegrees,
  );
  const rotationCos = Math.cos(footprintRotation);
  const rotationSin = Math.sin(footprintRotation);
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = Math.min(
    getParam(params, "floorThickness"),
    height - 1,
  );
  const ribRelief = params.ribRelief ?? settings.originalRibRelief;
  const outputRotation = THREE.MathUtils.degToRad(-getParam(params, "rotation"));
  const outputRotationCos = Math.cos(outputRotation);
  const outputRotationSin = Math.sin(outputRotation);
  const lengthScale = length / settings.originalLength;
  const widthScale = width / settings.originalWidth;
  const originalFloor = settings.originalFloorThickness;
  const wallSourceHeight = settings.originalHeight - originalFloor;
  const wallTargetHeight = height - floorThickness;
  const halfLength = settings.originalLength / 2;
  const halfWidth = settings.originalWidth / 2;
  const reliefScale =
    settings.originalRibRelief === 0
      ? 1
      : ribRelief / settings.originalRibRelief;

  for (let index = 0; index < position.count; index += 1) {
    const x = basePositions[index * 3];
    const y = basePositions[index * 3 + 1];
    const z = basePositions[index * 3 + 2];
    const widthCoord =
      model.viewer === "simple-box-v1"
        ? y
        : x * rotationCos + y * rotationSin;
    const lengthCoord =
      model.viewer === "simple-box-v1"
        ? x
        : -x * rotationSin + y * rotationCos;
    const edgeRatio = Math.max(
      Math.abs(lengthCoord) / halfLength,
      Math.abs(widthCoord) / halfWidth,
    );
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

    const nextLengthCoord =
      (lengthCoord + Math.sign(lengthCoord) * reliefOffset) * lengthScale;
    const nextWidthCoord =
      (widthCoord + Math.sign(widthCoord) * reliefOffset) * widthScale;

    target[index * 3] =
      nextLengthCoord * outputRotationCos - nextWidthCoord * outputRotationSin;
    target[index * 3 + 1] =
      nextLengthCoord * outputRotationSin + nextWidthCoord * outputRotationCos;
    target[index * 3 + 2] = nextZ;
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function updateTrayGuide(
  mesh: THREE.Mesh,
  params: ModelParams,
) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const rotation = getParam(params, "rotation");
  mesh.geometry.dispose();
  mesh.geometry = new THREE.BoxGeometry(length, width, height);
  mesh.rotation.set(0, 0, THREE.MathUtils.degToRad(-rotation));
  mesh.position.set(0, 0, height / 2);
}

function roundedRectanglePath(
  path: THREE.Shape | THREE.Path,
  length: number,
  width: number,
  radius: number,
) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const cornerRadius = Math.min(radius, halfLength, halfWidth);

  path.moveTo(-halfLength + cornerRadius, -halfWidth);
  path.lineTo(halfLength - cornerRadius, -halfWidth);
  path.quadraticCurveTo(halfLength, -halfWidth, halfLength, -halfWidth + cornerRadius);
  path.lineTo(halfLength, halfWidth - cornerRadius);
  path.quadraticCurveTo(halfLength, halfWidth, halfLength - cornerRadius, halfWidth);
  path.lineTo(-halfLength + cornerRadius, halfWidth);
  path.quadraticCurveTo(-halfLength, halfWidth, -halfLength, halfWidth - cornerRadius);
  path.lineTo(-halfLength, -halfWidth + cornerRadius);
  path.quadraticCurveTo(-halfLength, -halfWidth, -halfLength + cornerRadius, -halfWidth);
}

function createRegistrationRingGeometry(
  length: number,
  width: number,
  height: number,
  thickness: number,
  wallInset: number,
  clearance: number,
  cornerRadius: number,
  attachmentOverlap: number,
) {
  const outerLength = Math.max(
    thickness * 2 + 1,
    length - 2 * (wallInset + clearance),
  );
  const outerWidth = Math.max(
    thickness * 2 + 1,
    width - 2 * (wallInset + clearance),
  );
  const innerLength = outerLength - thickness * 2;
  const innerWidth = outerWidth - thickness * 2;
  const shape = new THREE.Shape();
  roundedRectanglePath(shape, outerLength, outerWidth, cornerRadius);
  const hole = new THREE.Path();
  roundedRectanglePath(
    hole,
    innerLength,
    innerWidth,
    Math.max(0.5, cornerRadius - thickness),
  );
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
    steps: 1,
  });
  geometry.translate(0, 0, -height + attachmentOverlap);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedRectanglePoints(
  length: number,
  width: number,
  radius: number,
  segments = 8,
) {
  const points: THREE.Vector2[] = [];
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const cornerRadius = Math.min(radius, halfLength, halfWidth);
  for (const [centerX, centerY, startAngle] of [
    [halfLength - cornerRadius, halfWidth - cornerRadius, 0],
    [-halfLength + cornerRadius, halfWidth - cornerRadius, Math.PI / 2],
    [-halfLength + cornerRadius, -halfWidth + cornerRadius, Math.PI],
    [halfLength - cornerRadius, -halfWidth + cornerRadius, Math.PI * 1.5],
  ] as const) {
    for (let index = 0; index < segments; index += 1) {
      const angle = startAngle + (index / (segments - 1)) * (Math.PI / 2);
      points.push(
        new THREE.Vector2(
          centerX + Math.cos(angle) * cornerRadius,
          centerY + Math.sin(angle) * cornerRadius,
        ),
      );
    }
  }
  return points;
}

function createStackingFootGeometry(
  length: number,
  width: number,
  height: number,
  wallInset: number,
  clearance: number,
  cornerRadius: number,
  attachmentOverlap: number,
  chamferHeight: number,
) {
  const footLength = length - 2 * (wallInset + clearance);
  const footWidth = width - 2 * (wallInset + clearance);
  const bottomZ = -height + attachmentOverlap;
  const shoulderZ = -chamferHeight + attachmentOverlap;
  const topZ = attachmentOverlap;
  const layers = [
    { points: roundedRectanglePoints(footLength, footWidth, cornerRadius), z: bottomZ },
    { points: roundedRectanglePoints(footLength, footWidth, cornerRadius), z: shoulderZ },
    { points: roundedRectanglePoints(length, width, cornerRadius), z: topZ },
  ];
  const positions: number[] = [];
  const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const vertex = (layer: (typeof layers)[number], index: number) =>
    new THREE.Vector3(layer.points[index].x, layer.points[index].y, layer.z);
  const pointCount = layers[0].points.length;

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const lower = layers[layerIndex];
    const upper = layers[layerIndex + 1];
    for (let index = 0; index < pointCount; index += 1) {
      const next = (index + 1) % pointCount;
      const a = vertex(lower, index);
      const b = vertex(lower, next);
      const c = vertex(upper, next);
      const d = vertex(upper, index);
      pushTriangle(a, b, c);
      pushTriangle(a, c, d);
    }
  }
  const bottomCenter = new THREE.Vector3(0, 0, bottomZ);
  const topCenter = new THREE.Vector3(0, 0, topZ);
  for (let index = 0; index < pointCount; index += 1) {
    const next = (index + 1) % pointCount;
    pushTriangle(bottomCenter, vertex(layers[0], next), vertex(layers[0], index));
    pushTriangle(topCenter, vertex(layers[2], index), vertex(layers[2], next));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

type GridfinityProfileLayer = {
  z: number;
  size: number;
  radius: number;
};

function createRoundedSquareProfileGeometry(
  centerX: number,
  centerY: number,
  layers: GridfinityProfileLayer[],
) {
  const cornerSegments = 6;
  const pointsPerRing = cornerSegments * 4;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const layer of layers) {
    const halfSize = layer.size / 2;
    const cornerOffset = halfSize - layer.radius;
    for (let corner = 0; corner < 4; corner += 1) {
      const angleStart = corner * Math.PI / 2;
      const cornerX =
        Math.cos(angleStart + Math.PI / 4) > 0
          ? cornerOffset
          : -cornerOffset;
      const cornerY =
        Math.sin(angleStart + Math.PI / 4) > 0
          ? cornerOffset
          : -cornerOffset;
      for (let step = 0; step < cornerSegments; step += 1) {
        const angle =
          angleStart + (step / (cornerSegments - 1)) * Math.PI / 2;
        positions.push(
          centerX + cornerX + Math.cos(angle) * layer.radius,
          centerY + cornerY + Math.sin(angle) * layer.radius,
          layer.z,
        );
      }
    }
  }

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    const lowerStart = layerIndex * pointsPerRing;
    const upperStart = (layerIndex + 1) * pointsPerRing;
    for (let pointIndex = 0; pointIndex < pointsPerRing; pointIndex += 1) {
      const next = (pointIndex + 1) % pointsPerRing;
      indices.push(
        lowerStart + pointIndex,
        lowerStart + next,
        upperStart + next,
        lowerStart + pointIndex,
        upperStart + next,
        upperStart + pointIndex,
      );
    }
  }

  const bottomCenter = positions.length / 3;
  positions.push(centerX, centerY, layers[0].z);
  const topCenter = positions.length / 3;
  positions.push(centerX, centerY, layers[layers.length - 1].z);
  const topStart = (layers.length - 1) * pointsPerRing;
  for (let pointIndex = 0; pointIndex < pointsPerRing; pointIndex += 1) {
    const next = (pointIndex + 1) % pointsPerRing;
    indices.push(bottomCenter, next, pointIndex);
    indices.push(topCenter, topStart + pointIndex, topStart + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGridfinityStackingLipGeometry(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const innerChamfer = settings.gridfinityLipInnerChamfer;
  const outerChamfer = settings.gridfinityLipOuterChamfer;
  const lipDepth = innerChamfer + outerChamfer;
  const innerLength = length - lipDepth * 2;
  const innerWidth = width - lipDepth * 2;
  const innerRadius = settings.gridfinityFootCornerRadius - lipDepth;
  const supportDepth = settings.gridfinityLipSupportHeight + lipDepth;
  const profile = [
    { offset: 0, z: 0 },
    { offset: innerChamfer, z: innerChamfer },
    {
      offset: innerChamfer,
      z: innerChamfer + settings.gridfinityLipStraightHeight,
    },
    {
      offset: lipDepth,
      z:
        innerChamfer +
        settings.gridfinityLipStraightHeight +
        outerChamfer,
    },
    { offset: lipDepth, z: -supportDepth },
    { offset: 0, z: -settings.gridfinityLipSupportHeight },
  ];
  const rings = profile.map(({ offset, z }) => ({
    points: roundedRectanglePoints(
      innerLength + offset * 2,
      innerWidth + offset * 2,
      innerRadius + offset,
      8,
    ),
    z: height + z,
  }));
  const pointsPerRing = rings[0].points.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    for (const point of ring.points) {
      positions.push(point.x, point.y, ring.z);
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const nextRing = (ringIndex + 1) % rings.length;
    const ringStart = ringIndex * pointsPerRing;
    const nextRingStart = nextRing * pointsPerRing;
    for (let pointIndex = 0; pointIndex < pointsPerRing; pointIndex += 1) {
      const nextPoint = (pointIndex + 1) % pointsPerRing;
      indices.push(
        ringStart + pointIndex,
        ringStart + nextPoint,
        nextRingStart + nextPoint,
        ringStart + pointIndex,
        nextRingStart + nextPoint,
        nextRingStart + pointIndex,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createGridfinityBaseGeometry(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  const lengthUnits = Math.max(
    1,
    Math.round(
      (getParam(params, "length") + 0.5) / settings.gridfinityGridSize,
    ),
  );
  const widthUnits = Math.max(
    1,
    Math.round(
      (getParam(params, "width") + 0.5) / settings.gridfinityGridSize,
    ),
  );
  const topSize = settings.gridfinityFootTopSize;
  const middleSize = topSize - settings.gridfinityTopChamfer * 2;
  const bottomSize = middleSize - settings.gridfinityBottomChamfer * 2;
  const profileHeight =
    settings.gridfinityBottomChamfer +
    settings.gridfinityStraightHeight +
    settings.gridfinityTopChamfer;
  const layers: GridfinityProfileLayer[] = [
    {
      z: -profileHeight,
      size: bottomSize,
      radius:
        settings.gridfinityFootCornerRadius -
        settings.gridfinityTopChamfer -
        settings.gridfinityBottomChamfer,
    },
    {
      z: -profileHeight + settings.gridfinityBottomChamfer,
      size: middleSize,
      radius:
        settings.gridfinityFootCornerRadius - settings.gridfinityTopChamfer,
    },
    {
      z: -settings.gridfinityTopChamfer,
      size: middleSize,
      radius:
        settings.gridfinityFootCornerRadius - settings.gridfinityTopChamfer,
    },
    {
      z: 0,
      size: topSize,
      radius: settings.gridfinityFootCornerRadius,
    },
    {
      z: settings.gridfinityFootOverlap,
      size: topSize,
      radius: settings.gridfinityFootCornerRadius,
    },
  ];
  const feet: THREE.BufferGeometry[] = [];

  for (let xIndex = 0; xIndex < lengthUnits; xIndex += 1) {
    for (let yIndex = 0; yIndex < widthUnits; yIndex += 1) {
      const centerX =
        (xIndex - (lengthUnits - 1) / 2) * settings.gridfinityGridSize;
      const centerY =
        (yIndex - (widthUnits - 1) / 2) * settings.gridfinityGridSize;
      feet.push(createRoundedSquareProfileGeometry(centerX, centerY, layers));
    }
  }

  const footGeometry = mergeGeometries(feet, false);
  feet.forEach((foot) => foot.dispose());
  if (!footGeometry) {
    throw new Error("Unable to build Gridfinity base geometry");
  }
  const lipGeometry = createGridfinityStackingLipGeometry(params, model);
  const geometry = mergeGeometries([footGeometry, lipGeometry], false);
  footGeometry.dispose();
  lipGeometry.dispose();
  if (!geometry) {
    throw new Error("Unable to combine Gridfinity base and stacking lip");
  }
  geometry.rotateZ(THREE.MathUtils.degToRad(-getParam(params, "rotation")));
  geometry.computeVertexNormals();
  return geometry;
}

export function createTrayStackingLipGeometry(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  if (getParam(params, "gridfinityCompatible") >= 0.5) {
    return createGridfinityBaseGeometry(params, model);
  }
  const clearance = getParam(params, "lipClearance");
  const lipHeight = getParam(params, "lipHeight");
  const geometry = createStackingFootGeometry(
    getParam(params, "length"),
    getParam(params, "width"),
    lipHeight,
    settings.stackingLipWallInset,
    clearance,
    settings.stackingLipCornerRadius,
    settings.stackingLipFloorOverlap,
    settings.stackingLipChamferHeight,
  );
  geometry.rotateZ(THREE.MathUtils.degToRad(-getParam(params, "rotation")));
  return geometry;
}

export function createSimpleBoxLidGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const thickness = getParam(params, "lidThickness");
  const skirtHeight = getParam(params, "lidSkirtHeight");
  const clearance = getParam(params, "lidClearance");
  const plate = new THREE.BoxGeometry(length, width, thickness);
  plate.translate(0, 0, thickness / 2);
  const skirt = createRegistrationRingGeometry(
    length,
    width,
    skirtHeight,
    model.geometry.stackingLipThickness,
    model.geometry.stackingLipWallInset,
    clearance,
    model.geometry.stackingLipCornerRadius,
    model.geometry.stackingLipFloorOverlap,
  );
  return [plate, skirt];
}

export function createSimpleBoxLidPrintGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const thickness = getParam(params, "lidThickness");
  return createSimpleBoxLidGeometries(params, model).map((geometry) => {
    geometry.rotateX(Math.PI);
    geometry.translate(0, 0, thickness);
    geometry.computeVertexNormals();
    return geometry;
  });
}

export function createTrayDividerGeometries(
  params: ModelParams,
  model: SimpleBoxModelDefinition,
) {
  const settings = model.geometry;
  const count = Math.round(getParam(params, "dividerCount"));
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = getParam(params, "floorThickness");
  const dividerBottom = floorThickness - settings.dividerFloorOverlap;
  const dividerHeight = Math.max(
    1,
    height - dividerBottom - settings.dividerTopClearance,
  );
  const dividerWidth = Math.max(1, width - settings.dividerWallInset * 2);
  const rotation = THREE.MathUtils.degToRad(-getParam(params, "rotation"));

  return Array.from({ length: count }, (_, index) => {
    const position = Math.min(
      length - 5,
      Math.max(5, getParam(params, `dividerPosition${index + 1}`)),
    );
    const geometry = new THREE.BoxGeometry(
      settings.dividerThickness,
      dividerWidth,
      dividerHeight,
    );
    geometry.translate(
      -length / 2 + position,
      0,
      dividerBottom + dividerHeight / 2,
    );
    geometry.rotateZ(rotation);
    return geometry;
  });
}

export function getTrayAuditValue(
  check: AuditCheckDefinition,
  params: ModelParams,
  unit: LengthUnit,
  model: ContainerModelDefinition,
): AuditItem {
  const settings = model.geometry;
  const length = getParam(params, "length");
  const width = getParam(params, "width");
  const height = getParam(params, "height");
  const floorThickness = getParam(params, "floorThickness");
  const ribRelief = params.ribRelief ?? settings.originalRibRelief;
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
    case "trayStackingLip": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const lipHeight = getParam(params, "lipHeight");
      const lipClearance = getParam(params, "lipClearance");
      return {
        label: check.label,
        value: `${formatLength(lipHeight, unit)} high · ${formatLength(lipClearance, unit)} clearance`,
        status:
          lipHeight >= 1 &&
          lipClearance >= 0.15 &&
          model.geometry.stackingLipThickness >= 1.2
            ? "pass"
            : "warn",
      };
    }
    case "trayDividers": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const dividerCount = Math.round(getParam(params, "dividerCount"));
      return {
        label: check.label,
        value: `${dividerCount} divider${dividerCount === 1 ? "" : "s"}`,
        status:
          dividerCount >= 0 &&
          dividerCount <= 4 &&
          model.geometry.dividerThickness >= 1.2
            ? "pass"
            : "warn",
      };
    }
    case "trayStackingFit": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const clearance = getParam(params, "lipClearance");
      const engagement =
        getParam(params, "lipHeight") -
        model.geometry.stackingLipFloorOverlap -
        model.geometry.stackingLipChamferHeight;
      return {
        label: check.label,
        value: `${formatLength(clearance, unit)} / side · ${formatLength(engagement, unit)} engaged`,
        status: clearance > 0 && engagement >= 1 ? "pass" : "warn",
      };
    }
    case "trayLidFit": {
      if (model.viewer !== "simple-box-v1") {
        return { label: check.label, value: "Not applicable", status: "warn" };
      }
      const clearance = getParam(params, "lidClearance");
      const engagement =
        getParam(params, "lidSkirtHeight") -
        model.geometry.stackingLipFloorOverlap;
      return {
        label: check.label,
        value: `${formatLength(clearance, unit)} / side · ${formatLength(engagement, unit)} engaged`,
        status:
          clearance > 0 &&
          engagement >= 1 &&
          getParam(params, "lidThickness") >= 1.2
            ? "pass"
            : "warn",
      };
    }
    default:
      return {
        label: check.label,
        value: "Configured",
        status: "warn",
      };
  }
}
