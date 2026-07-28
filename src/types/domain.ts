import type { PlannedFilament, PlannedPrototype, DesignPlanningRecord, RealmMaterialReference } from "./planning";

export type DesignTier = "Hero" | "Utility";
export type DesignLine = "ForgeTech" | "Foundry" | "Relics of the Nine Realms" | "Runehallow Relics";
export type DesignStatus = "Concept" | "Prototype" | "Active" | "Production" | "Archived";
export type ProductionStatus = "Queued" | "Printing" | "Finishing" | "Complete" | "Cancelled";
export type ProductionPriority = "Low" | "Normal" | "High" | "Rush";
export type ProductionBatchStatus = "Planned" | "Ready" | "Running" | "Complete" | "Cancelled";
export type ReleaseStatus = "Planning" | "Scheduled" | "Live";
export type FilamentMaterial =
  | "PLA"
  | "PLA+"
  | "PLA-CF"
  | "PETG"
  | "PETG-CF"
  | "PET"
  | "ABS"
  | "ASA"
  | "TPU"
  | "PVA"
  | "PC"
  | "PC-CF/GF"
  | "PA"
  | "PA6-CF"
  | "PET-CF"
  | "Nylon";
export type PrinterStatus = "Available" | "Printing" | "Maintenance" | "Offline";
export type PrinterConnectionType = "Anycubic Cloud / LAN" | "Moonraker / Fluidd" | "Local / USB";
export type MaterialMovementType = "Purchase" | "Adjustment" | "Production" | "Waste" | "Correction";
export type ActivityKind = "create" | "update" | "complete" | "inventory" | "maintenance" | "import" | "system";
export type DesignTab = "overview" | "stls" | "concepts" | "variants" | "jobs";
export type AssetStatus = "Planned" | "Linked" | "Needs Update" | "Archived";
export type SlicerKey = "orca" | "anycubic";
export type ForgepackStage =
  | "Planning"
  | "Concept Approved"
  | "Engineering"
  | "Prototype"
  | "Print Trial"
  | "Production Approved"
  | "Released";
export type ForgepackGateStatus = "Pending" | "Approved" | "Changes Required" | "Blocked";
export type ForgepackTrialStatus = "Not Started" | "In Progress" | "Passed" | "Failed";
export type ForgepackAssetKind =
  | "concept-image"
  | "measurement-image"
  | "reference"
  | "stl"
  | "3mf"
  | "document"
  | "other";
export type ViewKey = "dashboard" | "designs" | "collections" | "releases" | "production" | "filament" | "printers" | "planning" | "reports" | "settings";
export type QuickActionKey = "newDesign" | "newJob" | "newFilament" | "newPrinter";

export type RealmVariant =
  | "Midgard"
  | "Alfheim"
  | "Svartalfheim"
  | "Vanaheim"
  | "Asgard"
  | "Jotunheim"
  | "Muspelheim"
  | "Niflheim"
  | "Helheim";

export type DesignProject = {
  id: string;
  name: string;
  tier: DesignTier;
  line: DesignLine;
  category: string;
  collection: string;
  status: DesignStatus;
  targetPrice: number;
  estimatedFilamentGrams: number;
  estimatedPrintHours: number;
  available: number;
  reorderPoint: number;
  designImagePath: string;
  conceptImagePath: string;
  supportedRealmVariants: RealmVariant[];
  notes: string;
};

export type STLRecord = {
  id: string;
  designProjectId: string;
  name: string;
  fileName: string;
  filePath?: string;
  folderPath?: string;
  libraryPath?: string;
  version: string;
  isPrimary: boolean;
  defaultPrinterId?: string;
  defaultSlicer?: SlicerKey;
  linkedConceptId?: string;
  assetStatus?: AssetStatus;
  notes: string;
};

export type ConceptSpec = {
  id: string;
  designProjectId: string;
  title: string;
  imageName: string;
  imagePath?: string;
  measurementImagePath?: string;
  referenceFolderPath?: string;
  measurements: string;
  description: string;
  notes: string;
  linkedStlId?: string;
  linkedStlIds?: string[];
};

export type DesignVariant = {
  id: string;
  designProjectId: string;
  realm: RealmVariant;
  name: string;
  designImagePath: string;
  conceptImagePath: string;
  stlId?: string;
  conceptId?: string;
  filamentId?: string;
  priceModifier: number;
  estimatedFilamentGrams?: number;
  estimatedPrintHours?: number;
  isActive: boolean;
  notes: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
  line: DesignLine;
  description: string;
  heroDesignProjectId?: string;
};

export type ReleaseRecord = {
  id: string;
  name: string;
  wave: string;
  targetDate: string;
  status: ReleaseStatus;
  designProjectIds: string[];
  notes: string;
};

export type ProductionJob = {
  id: string;
  name: string;
  designProjectId: string;
  filamentId?: string;
  materialGrams?: number;
  quantity: number;
  targetDate: string;
  status: ProductionStatus;
  priority: ProductionPriority;
  printerId?: string;
  materialConsumed?: boolean;
  estimatedPrintHours: number;
  laborHours: number;
  laborRate: number;
  machineWatts: number;
  electricityRate: number;
  packagingCost: number;
  otherCost: number;
  batchId?: string;
  startedAt?: string;
  completedAt?: string;
  unitsCompleted?: number;
  actualPrintHours?: number;
  actualMaterialGrams?: number;
  outcome?: "Success" | "Partial" | "Failed";
  failureReason?: string;
  costSnapshotId?: string;
  notes: string;
};

export type ProductionBatch = {
  id: string;
  name: string;
  status: ProductionBatchStatus;
  printerId?: string;
  scheduledStart: string;
  completedAt?: string;
  notes: string;
};

export type FilamentRecord = {
  id: string;
  brand: string;
  material: FilamentMaterial;
  colorName: string;
  colorFamily: string;
  gramsAvailable: number;
  reorderPointGrams: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  notes: string;
};

export type MaterialMovement = {
  id: string;
  filamentId: string;
  type: MaterialMovementType;
  grams: number;
  occurredAt: string;
  productionJobId?: string;
  notes: string;
};

export type PrinterRecord = {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  profileId?: string;
  profileRevision?: number;
  status: PrinterStatus;
  buildVolume: string;
  buildVolumeX: number;
  buildVolumeY: number;
  buildVolumeZ: number;
  machineDimensions: string;
  watts: number;
  ratedPowerWatts: number;
  accessoryPowerWatts: number;
  nozzleDiameter: number;
  nozzleOptions: number[];
  nozzleMaterial: string;
  maxNozzleTemperatureC: number;
  maxBedTemperatureC: number;
  maxChamberTemperatureC: number;
  recommendedPrintSpeedMmS: number;
  maxPrintSpeedMmS: number;
  maxAccelerationMmS2: number;
  supportedMaterials: FilamentMaterial[];
  motionSystem: string;
  extruder: string;
  firmware: string;
  levelingSystem: string;
  enclosed: boolean;
  heatedChamber: boolean;
  multicolorSystem: string;
  includedColorCount: number;
  maxColorCount: number;
  filamentDrying: boolean;
  camera: string;
  preferredSlicer: SlicerKey;
  connectionType: PrinterConnectionType;
  connectionEndpoint: string;
  profileSource: string;
  profileUpdatedAt: string;
  maintenanceIntervalDays: number;
  activeJob: string;
  notes: string;
};

export type MaintenanceRecord = {
  id: string;
  printerId: string;
  title: string;
  performedOn: string;
  notes: string;
};

export type CostSnapshot = {
  id: string;
  productionJobId: string;
  capturedAt: string;
  materialCost: number;
  electricityCost: number;
  laborCost: number;
  finishingCost: number;
  totalCost: number;
  gramsUsed: number;
  printHours: number;
};

export type ActivityEvent = {
  id: string;
  occurredAt: string;
  kind: ActivityKind;
  station: "command" | "design-library" | "planning" | "production" | "materials" | "printer-pool" | "reports" | "administration";
  summary: string;
  recordId?: string;
};

export type ForgepackAsset = {
  id: string;
  kind: ForgepackAssetKind;
  label: string;
  archivePath: string;
  importedPath: string;
  sha256: string;
  version: string;
  primary: boolean;
};

export type ForgepackGate = {
  status: ForgepackGateStatus;
  summary: string;
  approvedBy?: string;
  approvedAt?: string;
};

export type ForgepackEngineeringReview = ForgepackGate & {
  assessedAt?: string;
  risks: string[];
  requirements: string[];
  unknowns: string[];
};

export type ForgepackPipeline = {
  nextGate: string;
  nextAction: string;
  blockedBy: string[];
  physicalTestStatus: ForgepackTrialStatus;
  targetPrinters: string[];
  intendedMaterials: string[];
};

export type ForgepackImportRecord = {
  packetId: string;
  formatVersion: number;
  productId: string;
  productName: string;
  stage: ForgepackStage;
  sourcePackagePath: string;
  assetRoot: string;
  importedAt: string;
  conceptRevision: string;
  canonGate: ForgepackGate;
  forgeability: ForgepackEngineeringReview;
  pipeline: ForgepackPipeline;
  assets: ForgepackAsset[];
  provenance: {
    createdAt: string;
    createdBy: string;
    conversationRef: string;
    notes: string;
  };
};

export type AppSettings = {
  workspaceName: string;
  ownerName: string;
  setupCompleted: boolean;
  laborRate: number;
  electricityRate: number;
  machineWatts: number;
  packagingCost: number;
  otherCost: number;
  materialMarkupPercent: number;
  targetMarginPercent: number;
  assetRootPath: string;
  productionHoursPerDay: number;
  forgekeeperLibraryPath?: string;
  orcaSlicerPath?: string;
  anycubicSlicerPath?: string;
  blenderPath?: string;
  meshyUrl?: string;
  defaultSlicer?: "orca" | "anycubic";
  workshopPrinterProfileRevision: number;
};

export type AppData = {
  designProjects: DesignProject[];
  stls: STLRecord[];
  concepts: ConceptSpec[];
  variants: DesignVariant[];
  collections: CollectionRecord[];
  releases: ReleaseRecord[];
  productionJobs: ProductionJob[];
  productionBatches: ProductionBatch[];
  filament: FilamentRecord[];
  materialMovements: MaterialMovement[];
  printers: PrinterRecord[];
  maintenance: MaintenanceRecord[];
  costSnapshots: CostSnapshot[];
  activityLog: ActivityEvent[];
  intakePackets: ForgepackImportRecord[];
  settings: AppSettings;
  prototypes: PlannedPrototype[];
  plannedFilament: PlannedFilament[];
  designPlanning: DesignPlanningRecord[];
  realmMaterials: RealmMaterialReference[];
};


export type PrinterLoad = {
  printerId: string;
  name: string;
  hours: number;
  jobs: number;
  status: PrinterStatus;
};

export type FilamentDemand = {
  filamentId: string;
  name: string;
  neededGrams: number;
  availableGrams: number;
  shortageGrams: number;
};

export type ProductionMetrics = {
  totalQueueHours: number;
  assignedQueueHours: number;
  unassignedQueueHours: number;
  estimatedCompletionHours: number;
  estimatedCompletionDays: number;
  filamentNeededGrams: number;
  printerLoads: PrinterLoad[];
  filamentDemand: FilamentDemand[];
  bottlenecks: PrinterLoad[];
  unassignedJobs: number;
};
