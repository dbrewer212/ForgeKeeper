import type { PlannedFilament, PlannedPrototype, DesignPlanningRecord, RealmMaterialReference } from "./planning";

export type DesignTier = "Hero" | "Utility";
export type DesignLine = "ForgeTech" | "Foundry" | "Relics of the Nine Realms" | "Runehallow Relics";
export type DesignStatus = "Concept" | "Prototype" | "Active" | "Production" | "Archived";
export type ProductionStatus = "Queued" | "Printing" | "Finishing" | "Complete" | "Cancelled";
export type ProductionPriority = "Low" | "Normal" | "High" | "Rush";
export type ReleaseStatus = "Planning" | "Scheduled" | "Live";
export type FilamentMaterial = "PLA" | "PLA+" | "PETG" | "ABS" | "TPU";
export type PrinterStatus = "Available" | "Printing" | "Maintenance" | "Offline";
export type DesignTab = "overview" | "stls" | "concepts" | "variants" | "jobs";
export type AssetStatus = "Planned" | "Linked" | "Needs Update" | "Archived";
export type SlicerKey = "orca" | "anycubic";
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

export type PrinterRecord = {
  id: string;
  name: string;
  model: string;
  status: PrinterStatus;
  buildVolume: string;
  watts: number;
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
};

export type AppData = {
  designProjects: DesignProject[];
  stls: STLRecord[];
  concepts: ConceptSpec[];
  variants: DesignVariant[];
  collections: CollectionRecord[];
  releases: ReleaseRecord[];
  productionJobs: ProductionJob[];
  filament: FilamentRecord[];
  printers: PrinterRecord[];
  maintenance: MaintenanceRecord[];
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
