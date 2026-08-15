export type WorkbenchId = string;
export type IsoTimestamp = string;

export type FoundryAssetType =
  | "component"
  | "assembly"
  | "product"
  | "character"
  | "fixture"
  | "tooling"
  | "reference"
  | "other";

export type AssetLifecycleStatus =
  | "unassigned"
  | "concept"
  | "registered"
  | "inspection-required"
  | "in-development"
  | "manufacturing-review"
  | "production-approved"
  | "retired"
  | "archived";

export type FileRole =
  | "source"
  | "geometry"
  | "preview"
  | "reference"
  | "slicer-project"
  | "gcode"
  | "documentation"
  | "other";

export type AssetRelationshipType =
  | "derived-from"
  | "component-of"
  | "variant-of"
  | "supersedes"
  | "references"
  | "generated-from"
  | "concept-for"
  | "production-master-of"
  | "accessory-for";

export type ManufacturingApprovalState =
  | "not-reviewed"
  | "changes-required"
  | "blocked"
  | "approved"
  | "retired";

export type PreparationStatus =
  | "draft"
  | "validated"
  | "approved"
  | "submitted"
  | "superseded";

export type PrintOutcome =
  | "success"
  | "partial-success"
  | "failed"
  | "cancelled"
  | "aborted";

export type FoundryAsset = {
  assetId: WorkbenchId;
  name: string;
  assetType: FoundryAssetType;
  owningProjectId?: WorkbenchId;
  collectionId?: WorkbenchId;
  lifecycleStatus: AssetLifecycleStatus;
  canonicalAssetId?: WorkbenchId;
  canonicalRevisionId?: WorkbenchId;
  provenance: AssetProvenance;
  tags: string[];
  currentRevisionId?: WorkbenchId;
  notes?: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type AssetProvenance = {
  sourceType:
    | "manual"
    | "meshy"
    | "printpal"
    | "blender"
    | "cad"
    | "scanner"
    | "download"
    | "forgepack"
    | "other";
  sourceLabel?: string;
  sourceUri?: string;
  creator?: string;
  license?: string;
  externalId?: string;
  importedAt?: IsoTimestamp;
};

export type FoundryFile = {
  fileId: WorkbenchId;
  sha256: string;
  fileName: string;
  storagePath: string;
  format: string;
  mimeType?: string;
  sizeBytes: number;
  role: FileRole;
  source: AssetProvenance;
  ownedByFoundry: boolean;
  license?: string;
  importedAt: IsoTimestamp;
};

export type AssetRevision = {
  revisionId: WorkbenchId;
  assetId: WorkbenchId;
  parentRevisionId?: WorkbenchId;
  revisionLabel: string;
  authorActorId: string;
  process?: string;
  reason: string;
  sourceFileIds: WorkbenchId[];
  outputFileIds: WorkbenchId[];
  inspectionResultIds: WorkbenchId[];
  manufacturingApproval: ManufacturingApprovalState;
  createdAt: IsoTimestamp;
};

export type AssetRelationship = {
  relationshipId: WorkbenchId;
  type: AssetRelationshipType;
  fromAssetId: WorkbenchId;
  fromRevisionId?: WorkbenchId;
  toAssetId: WorkbenchId;
  toRevisionId?: WorkbenchId;
  metadata?: Record<string, unknown>;
  createdBy: string;
  createdAt: IsoTimestamp;
};

export type FoundryVariant = {
  variantId: WorkbenchId;
  assetId: WorkbenchId;
  parentAssetId: WorkbenchId;
  parentRevisionId: WorkbenchId;
  name: string;
  family?: string;
  transformationGraph: WorkbenchOperation[];
  currentRevisionId?: WorkbenchId;
  reviewRequired: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type WorkbenchOperation = {
  operationId: WorkbenchId;
  type:
    | "scale"
    | "rotate"
    | "translate"
    | "mirror"
    | "split"
    | "combine"
    | "plane-cut"
    | "boolean"
    | "alignment-feature"
    | "clearance"
    | "unit-correction"
    | "other";
  parameters: Record<string, string | number | boolean | null>;
  inputRevisionId?: WorkbenchId;
  outputRevisionId?: WorkbenchId;
  createdAt: IsoTimestamp;
};

export type AssemblyComponent = {
  componentId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId?: WorkbenchId;
  quantity: number;
  optional: boolean;
  interfaceIds: WorkbenchId[];
  notes?: string;
};

export type AssemblyInterface = {
  interfaceId: WorkbenchId;
  name: string;
  fromComponentId: WorkbenchId;
  toComponentId: WorkbenchId;
  interfaceType?: string;
  nominalClearanceMm?: number;
  toleranceMm?: number;
  notes?: string;
};

export type FoundryAssembly = {
  assemblyId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId?: WorkbenchId;
  components: AssemblyComponent[];
  interfaces: AssemblyInterface[];
  assemblyNotes?: string;
  completenessRule?: string;
  updatedAt: IsoTimestamp;
};

export type ManufacturingSpec = {
  manufacturingSpecId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId: WorkbenchId;
  intendedProcess: string;
  approvedMaterialProfileIds: WorkbenchId[];
  targetDimensionsMm?: { x: number; y: number; z: number };
  toleranceRequirements: Array<{ feature: string; toleranceMm: number; note?: string }>;
  criticalFeatures: string[];
  preferredOrientations: string[];
  forbiddenOrientations: string[];
  machineConstraints: Array<{ key: string; operator: string; value: string | number | boolean }>;
  approvedPrinterIds: WorkbenchId[];
  approvedProfileRefs: string[];
  supportRules: string[];
  approvalState: ManufacturingApprovalState;
  approvedBy?: string;
  approvedAt?: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type GeometrySummary = {
  boundsMm?: { x: number; y: number; z: number };
  volumeMm3?: number;
  surfaceAreaMm2?: number;
  triangleCount?: number;
  shellCount?: number;
  manifold?: boolean;
  openEdgeCount?: number;
  disconnectedShellCount?: number;
};

export type InspectionResult = {
  inspectionResultId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId: WorkbenchId;
  engineId: string;
  engineVersion: string;
  geometry: GeometrySummary;
  findings: InspectionFinding[];
  machineCompatibility: Array<{ printerId: WorkbenchId; compatible: boolean; reasons: string[] }>;
  createdAt: IsoTimestamp;
};

export type InspectionFinding = {
  findingId: WorkbenchId;
  category: "geometry" | "integrity" | "printability" | "interface" | "compatibility" | "comparison";
  severity: "info" | "warning" | "error" | "critical";
  summary: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
  confidence?: number;
};

export type PreparationRecord = {
  preparationId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId: WorkbenchId;
  variantId?: WorkbenchId;
  manufacturingSpecId: WorkbenchId;
  productionJobId?: WorkbenchId;
  printerId?: WorkbenchId;
  materialProfileId?: WorkbenchId;
  physicalSpoolIds?: WorkbenchId[];
  slicerId?: string;
  slicerProfileRef?: string;
  orientation?: string;
  scale?: { x: number; y: number; z: number };
  supportIntent?: string;
  assumptions: string[];
  operationGraph: WorkbenchOperation[];
  generatedFileIds: WorkbenchId[];
  status: PreparationStatus;
  createdBy: string;
  createdAt: IsoTimestamp;
  approvedBy?: string;
  approvedAt?: IsoTimestamp;
};

export type PrintObservation = {
  observationId: WorkbenchId;
  authorActorId: string;
  category: string;
  text: string;
  createdAt: IsoTimestamp;
};

export type PrintRecord = {
  printRecordId: WorkbenchId;
  assetId: WorkbenchId;
  revisionId: WorkbenchId;
  preparationId: WorkbenchId;
  productionJobId: WorkbenchId;
  printerId: WorkbenchId;
  materialProfileId?: WorkbenchId;
  physicalSpoolIds?: WorkbenchId[];
  slicerId?: string;
  slicerVersion?: string;
  profileRef?: string;
  startedAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
  elapsedSeconds?: number;
  measuredMaterialGrams?: number;
  outcome: PrintOutcome;
  telemetryRefIds: WorkbenchId[];
  observations: PrintObservation[];
  failureMode?: string;
  evidenceFileIds: WorkbenchId[];
  createdAt: IsoTimestamp;
};

export type WorkbenchState = {
  assets: FoundryAsset[];
  files: FoundryFile[];
  revisions: AssetRevision[];
  relationships: AssetRelationship[];
  variants: FoundryVariant[];
  assemblies: FoundryAssembly[];
  manufacturingSpecs: ManufacturingSpec[];
  inspections: InspectionResult[];
  preparations: PreparationRecord[];
  printRecords: PrintRecord[];
};
