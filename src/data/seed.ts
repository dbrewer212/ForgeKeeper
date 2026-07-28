import type {
  AppSettings,
  CollectionRecord,
  ConceptSpec,
  DesignProject,
  DesignVariant,
  FilamentRecord,
  PrinterRecord,
  ProductionJob,
  ReleaseRecord,
  STLRecord,
} from "../types/domain";

export const defaultSettings: AppSettings = {
  workspaceName: "Fenrir Forgeworks",
  ownerName: "",
  setupCompleted: false,
  laborRate: 18,
  electricityRate: 0.203,
  machineWatts: 250,
  packagingCost: 1.25,
  otherCost: 0.5,
  materialMarkupPercent: 10,
  targetMarginPercent: 50,
  assetRootPath: "",
  productionHoursPerDay: 8,
};

// A new ForgeKeeper workspace belongs entirely to its user. Starter records
// are never injected. Prototype data is handled only by the legacy importer.
export const seedDesignProjects: DesignProject[] = [];
export const seedStls: STLRecord[] = [];
export const seedConcepts: ConceptSpec[] = [];
export const seedVariants: DesignVariant[] = [];
export const seedCollections: CollectionRecord[] = [];
export const seedReleases: ReleaseRecord[] = [];
export const seedProductionJobs: ProductionJob[] = [];
export const seedFilament: FilamentRecord[] = [];
export const seedPrinters: PrinterRecord[] = [];
