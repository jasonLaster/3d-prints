export type ModelParams = Record<string, number>;

export type LengthUnit = "mm" | "cm" | "in";

export type AuditStatus = "pass" | "warn";

export type AuditItem = {
  label: string;
  value: string;
  status: AuditStatus;
};

export type NumberLimits = {
  min: number;
  max: number;
  step: number;
};

export type ModelParameter = {
  key: string;
  label: string;
  group?: string;
  statusLabel?: string;
  default: number;
  limits: NumberLimits;
};

export type AuditCheckDefinition = {
  key: string;
  label: string;
  minMiddleHeightMm?: number;
  minSandMassKg?: number;
  minSandVolumeCc?: number;
};

export type ModelScript = {
  name: string;
  path: string;
  command: string;
  description?: string;
};

export type HolderGeometry = {
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

export type TrayGeometry = {
  originalLength: number;
  originalWidth: number;
  originalHeight: number;
  footprintRotationDegrees: number;
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

export type SimpleBoxGeometry = TrayGeometry & {
  stackingLipThickness: number;
  stackingLipWallInset: number;
  stackingLipCornerRadius: number;
  stackingLipFloorOverlap: number;
  stackingLipChamferHeight: number;
  dividerThickness: number;
  dividerWallInset: number;
  dividerTopClearance: number;
  dividerFloorOverlap: number;
  gridfinityGridSize: number;
  gridfinityFootTopSize: number;
  gridfinityFootCornerRadius: number;
  gridfinityBottomChamfer: number;
  gridfinityStraightHeight: number;
  gridfinityTopChamfer: number;
  gridfinityFootOverlap: number;
  gridfinityLipInnerChamfer: number;
  gridfinityLipStraightHeight: number;
  gridfinityLipOuterChamfer: number;
  gridfinityLipSupportHeight: number;
};

export type DoorLockAdapterGeometry = {
  mainAxis: {
    x: number;
    y: number;
    z: number;
  };
  radialSegments: number;
  minimumWallThickness: number;
};

export type ConcentricTubeJigGeometry = {
  mainAxis: { x: number; y: number; z: number };
  radialSegments: number;
  minimumWallThickness: number;
  tubeCount: number;
};

export type DrillBitHolderGeometry = {
  mainAxis: { x: number; y: number; z: number };
  defaultBitDiametersMm: number[];
  minimumBitDiameter: number;
  maximumBitDiameter: number;
  maximumBitCount: number;
  radialSegments: number;
  cornerSegments: number;
  minimumFloorThickness: number;
  minimumWallThickness: number;
};

export type RouterMortiseJigGeometry = {
  mainAxis: { x: number; y: number; z: number };
  radialSegments: number;
  cornerSegments: number;
  slotArcSegments: number;
  markerArcSegments: number;
  plateLength: number;
  plateWidth: number;
  plateCornerRadius: number;
  jawLength: number;
  jawThickness: number;
  jawCornerRadius: number;
  boltStationX: number;
  boltSlotWidth: number;
  insertLeadIn: number;
  minimumInsertSideWall: number;
  minimumInsertFloor: number;
  minimumBushingRadialClearance: number;
  minimumPlateWeb: number;
  minimumWorkpieceWidth: number;
  maximumWorkpieceWidth: number;
  maximumWorkpieceWiggle: number;
  presetWorkpieceWidthsMm: number[];
  markerOffsetX: number;
  markerLength: number;
  markerWidth: number;
  workpiecePreviewLength: number;
  routerBaseThickness: number;
  routerMotorDiameter: number;
  routerMotorHeight: number;
  bushingProjection: number;
  bitPreviewDepth: number;
};

export type RouterTenonJigGeometry = {
  mainAxis: { x: number; y: number; z: number };
  radialSegments: number;
  cornerSegments: number;
  slotArcSegments: number;
  markerArcSegments: number;
  baseLength: number;
  baseWidth: number;
  baseCornerRadius: number;
  throatWidth: number;
  throatThickness: number;
  throatCornerRadius: number;
  horizontalRecessLength: number;
  horizontalRecessWidth: number;
  verticalRecessLength: number;
  verticalRecessWidth: number;
  cheekPlateLength: number;
  cheekPlateWidth: number;
  edgePlateLength: number;
  edgePlateWidth: number;
  plateCornerRadius: number;
  cheekInsertX: number;
  cheekInsertY: number;
  edgeInsertX: number;
  edgeInsertY: number;
  cheekSlotCenterLocalX: number;
  edgeSlotCenterLocalY: number;
  adjustmentSlotLength: number;
  edgeAdjustmentSlotLength: number;
  boltSlotWidth: number;
  insertLeadIn: number;
  minimumInsertSideWall: number;
  minimumInsertFloor: number;
  minimumInsertEngagement: number;
  minimumPocketTipClearance: number;
  washerThickness: number;
  washerDiameter: number;
  minimumGuideOpening: number;
  maximumGuideOpeningWidth: number;
  maximumGuideOpeningThickness: number;
  minimumRouterSupportOverlap: number;
  screenLoadN: number;
  screenModulusMpa: number;
  screenAllowableStressMpa: number;
  maximumScreenDeflection: number;
  minimumScreenSafetyFactor: number;
  minimumClampLedge: number;
  presetTenonWidthsMm: number[];
  presetTenonThicknessesMm: number[];
  markerLength: number;
  markerWidth: number;
  workpiecePreviewHeight: number;
  routerBaseThickness: number;
  routerMotorDiameter: number;
  routerMotorHeight: number;
  bearingHeight: number;
  cutterPreviewLength: number;
  hoseBandHeight: number;
};

export type DiningTableGeometry = {
  mainAxis: { x: number; y: number; z: number };
  cornerSegments: number;
  edgeProfileSegments: number;
  channelCount: 0 | 3;
  legSplayDegrees?: number;
  longApronEndAngleDegrees?: number;
  sideApronEdgeAngleDegrees?: number;
  sideApronBottomChamferDegrees?: number;
};

export type HoverDiningTableGeometry = {
  mainAxis: { x: number; y: number; z: number };
  curveSegments: number;
  bevelSegments: number;
  braceRoundoverSegments: number;
  channelCount: 3;
};

export type SupportedViewer =
  | "weighted-paper-towel-holder-v1"
  | "japandi-tray-v1"
  | "simple-box-v1"
  | "door-lock-adapter-v1"
  | "concentric-tube-jig-v1"
  | "drill-bit-holder-v1"
  | "router-mortise-jig-v1"
  | "router-tenon-jig-v1"
  | "dining-table-v1"
  | "hover-dining-table-v1";

export type BaseModelDefinition = {
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

export type HolderModelDefinition = BaseModelDefinition & {
  viewer: "weighted-paper-towel-holder-v1";
  geometry: HolderGeometry;
};

export type TrayModelDefinition = BaseModelDefinition & {
  viewer: "japandi-tray-v1";
  geometry: TrayGeometry;
};

export type SimpleBoxModelDefinition = BaseModelDefinition & {
  viewer: "simple-box-v1";
  geometry: SimpleBoxGeometry;
};

export type DoorLockAdapterModelDefinition = BaseModelDefinition & {
  viewer: "door-lock-adapter-v1";
  geometry: DoorLockAdapterGeometry;
};

export type ConcentricTubeJigModelDefinition = BaseModelDefinition & {
  viewer: "concentric-tube-jig-v1";
  geometry: ConcentricTubeJigGeometry;
};

export type DrillBitHolderModelDefinition = BaseModelDefinition & {
  viewer: "drill-bit-holder-v1";
  geometry: DrillBitHolderGeometry;
};

export type RouterMortisePreset = {
  label: string;
  mortiseWidth: number;
  mortiseLength: number;
  routerBitDiameter: number;
};

export type RouterMortiseJigPartDefinition = {
  key: "guide-plate" | "left-fence" | "right-fence";
  label: string;
  quantity: number;
  fileName: string;
  url: string;
};

export type RouterMortiseJigModelDefinition = BaseModelDefinition & {
  viewer: "router-mortise-jig-v1";
  geometry: RouterMortiseJigGeometry;
  presets: RouterMortisePreset[];
  parts: RouterMortiseJigPartDefinition[];
};

export type RouterTenonPreset = {
  label: string;
  tenonThickness: number;
  tenonWidth: number;
  tenonLength: number;
};

export type RouterTenonJigPartDefinition = {
  key: "base-bridge" | "left-cheek-guide" | "right-cheek-guide" | "front-edge-guide" | "rear-edge-guide";
  label: string;
  quantity: number;
  fileName: string;
  url: string;
};

export type RouterTenonJigModelDefinition = BaseModelDefinition & {
  viewer: "router-tenon-jig-v1";
  geometry: RouterTenonJigGeometry;
  presets: RouterTenonPreset[];
  parts: RouterTenonJigPartDefinition[];
};

export type DiningTableModelDefinition = BaseModelDefinition & {
  viewer: "dining-table-v1";
  geometry: DiningTableGeometry;
};

export type HoverDiningTableModelDefinition = BaseModelDefinition & {
  viewer: "hover-dining-table-v1";
  geometry: HoverDiningTableGeometry;
};

export type ModelDefinition =
  | HolderModelDefinition
  | TrayModelDefinition
  | SimpleBoxModelDefinition
  | DoorLockAdapterModelDefinition
  | ConcentricTubeJigModelDefinition
  | DrillBitHolderModelDefinition
  | RouterMortiseJigModelDefinition
  | RouterTenonJigModelDefinition
  | DiningTableModelDefinition
  | HoverDiningTableModelDefinition;

export type ModelDimensions = {
  length: number;
  width: number;
  height: number;
};
