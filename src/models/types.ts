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
  dividerThickness: number;
  dividerWallInset: number;
  dividerTopClearance: number;
  dividerFloorOverlap: number;
};

export type SupportedViewer =
  | "weighted-paper-towel-holder-v1"
  | "japandi-tray-v1"
  | "simple-box-v1";

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

export type ModelDefinition =
  | HolderModelDefinition
  | TrayModelDefinition
  | SimpleBoxModelDefinition;

export type ModelDimensions = {
  length: number;
  width: number;
  height: number;
};
