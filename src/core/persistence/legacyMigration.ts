import { defaultExternalTools } from "../../lib/externalTools";
import { defaultSettings } from "../../data/seed";
import type {
  AppData,
  CollectionRecord,
  DesignProject,
  ProductionJob,
  ProductionStatus,
  ReleaseRecord,
} from "../../types/domain";

export const LEGACY_STORAGE_KEY = "forgekeeper.app.v1";
export const LEGACY_RECOVERY_KEY = "forgekeeper.app.v1.backup";
export const LEGACY_BACKUP_KEY = "forgekeeper.app.v1.migrated-backup";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {};
}

function list(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapStatus(value: unknown): ProductionStatus {
  if (value === "Printing" || value === "Finishing" || value === "Queued") return value;
  if (value === "Packed" || value === "Shipped" || value === "Complete") return "Complete";
  if (value === "Cancelled") return "Cancelled";
  return "Queued";
}

function unwrap(raw: unknown): UnknownRecord {
  const source = record(raw);
  return "data" in source ? record(source.data) : source;
}

function migrateDesignProject(source: UnknownRecord): DesignProject {
  return {
    id: text(source.id),
    name: text(source.name, "Untitled Design"),
    tier: source.tier === "Utility" ? "Utility" : "Hero",
    line: ["ForgeTech", "Foundry", "Relics of the Nine Realms", "Runehallow Relics"].includes(text(source.line))
      ? source.line as DesignProject["line"]
      : "Foundry",
    category: text(source.category),
    collection: text(source.collection, "Unassigned"),
    status: ["Concept", "Prototype", "Active", "Production", "Archived"].includes(text(source.status))
      ? source.status as DesignProject["status"]
      : "Concept",
    targetPrice: numberValue(source.targetPrice),
    estimatedFilamentGrams: numberValue(source.estimatedFilamentGrams),
    estimatedPrintHours: numberValue(source.estimatedPrintHours),
    available: numberValue(source.available),
    reorderPoint: numberValue(source.reorderPoint),
    designImagePath: text(source.designImagePath ?? source.productImagePath),
    conceptImagePath: text(source.conceptImagePath),
    supportedRealmVariants: Array.isArray(source.supportedRealmVariants)
      ? source.supportedRealmVariants as DesignProject["supportedRealmVariants"]
      : [],
    notes: text(source.notes),
  };
}

function migrateProductionJob(source: UnknownRecord, projects: DesignProject[]): ProductionJob {
  const designProjectId = text(source.designProjectId ?? source.productId);
  const designName = projects.find((project) => project.id === designProjectId)?.name;
  return {
    id: text(source.id),
    name: text(source.name, designName ? `${designName} production` : `Imported job ${text(source.id)}`),
    designProjectId,
    filamentId: text(source.filamentId) || undefined,
    materialGrams: numberValue(source.materialGrams),
    quantity: Math.max(1, numberValue(source.quantity, 1)),
    targetDate: text(source.targetDate ?? source.dueDate),
    status: mapStatus(source.status),
    priority: ["Low", "Normal", "High", "Rush"].includes(text(source.priority))
      ? source.priority as ProductionJob["priority"]
      : "Normal",
    printerId: text(source.printerId) || undefined,
    materialConsumed: Boolean(source.materialConsumed),
    batchId: text(source.batchId) || undefined,
    startedAt: text(source.startedAt) || undefined,
    completedAt: text(source.completedAt) || undefined,
    unitsCompleted: source.unitsCompleted === undefined ? undefined : numberValue(source.unitsCompleted),
    actualPrintHours: source.actualPrintHours === undefined ? undefined : numberValue(source.actualPrintHours),
    actualMaterialGrams: source.actualMaterialGrams === undefined ? undefined : numberValue(source.actualMaterialGrams),
    outcome: ["Success", "Partial", "Failed"].includes(text(source.outcome))
      ? source.outcome as ProductionJob["outcome"]
      : undefined,
    failureReason: text(source.failureReason) || undefined,
    costSnapshotId: text(source.costSnapshotId) || undefined,
    estimatedPrintHours: numberValue(source.estimatedPrintHours),
    laborHours: numberValue(source.laborHours),
    laborRate: numberValue(source.laborRate, defaultSettings.laborRate),
    machineWatts: numberValue(source.machineWatts, defaultSettings.machineWatts),
    electricityRate: numberValue(source.electricityRate, defaultSettings.electricityRate),
    packagingCost: numberValue(source.packagingCost, defaultSettings.packagingCost),
    otherCost: numberValue(source.otherCost, defaultSettings.otherCost),
    notes: text(source.notes),
  };
}

export function migrateWorkspaceData(raw: unknown): AppData {
  const source = unwrap(raw);
  const sourceSettings = record(source.settings);
  const projects = list(source.designProjects ?? source.products).map(migrateDesignProject);
  const mapProjectId = (item: UnknownRecord) => ({
    ...item,
    designProjectId: text(item.designProjectId ?? item.productId),
  });

  const collections = list(source.collections).map((item) => ({
    ...item,
    heroDesignProjectId: text(item.heroDesignProjectId ?? item.heroProductId) || undefined,
  })) as CollectionRecord[];
  const releases = list(source.releases).map((item) => ({
    ...item,
    designProjectIds: Array.isArray(item.designProjectIds)
      ? item.designProjectIds
      : Array.isArray(item.productIds) ? item.productIds : [],
  })) as ReleaseRecord[];

  return {
    designProjects: projects,
    stls: list(source.stls).map(mapProjectId) as AppData["stls"],
    concepts: list(source.concepts).map(mapProjectId) as AppData["concepts"],
    variants: list(source.variants).map((item) => ({
      ...mapProjectId(item),
      designImagePath: text(item.designImagePath ?? item.productImagePath),
    })) as AppData["variants"],
    collections,
    releases,
    productionJobs: list(source.productionJobs ?? source.orders).map((item) => migrateProductionJob(item, projects)),
    productionBatches: list(source.productionBatches) as AppData["productionBatches"],
    filament: list(source.filament) as AppData["filament"],
    materialMovements: list(source.materialMovements) as AppData["materialMovements"],
    printers: list(source.printers) as AppData["printers"],
    maintenance: list(source.maintenance) as AppData["maintenance"],
    costSnapshots: list(source.costSnapshots) as AppData["costSnapshots"],
    activityLog: list(source.activityLog) as AppData["activityLog"],
    settings: {
      ...defaultExternalTools,
      ...defaultSettings,
      ...sourceSettings,
      workshopPrinterProfileRevision: numberValue(sourceSettings.workshopPrinterProfileRevision, 0),
    },
    prototypes: list(source.prototypes).map((item) => ({
      ...item,
      designName: text(item.designName ?? item.productName, "Untitled Prototype"),
    })) as AppData["prototypes"],
    plannedFilament: list(source.plannedFilament) as AppData["plannedFilament"],
    designPlanning: list(source.designPlanning ?? source.productPlanning).map((item) => ({
      ...item,
      designFamily: text(item.designFamily ?? item.productFamily),
      baseDesign: text(item.baseDesign ?? item.baseProduct),
    })) as AppData["designPlanning"],
    realmMaterials: list(source.realmMaterials) as AppData["realmMaterials"],
  };
}

export function readLegacyWorkspace(): unknown | null {
  if (typeof window === "undefined") return null;
  const candidates = [
    window.localStorage.getItem(LEGACY_STORAGE_KEY),
    window.localStorage.getItem(LEGACY_RECOVERY_KEY),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("ForgeKeeper skipped an unreadable legacy workspace", error);
    }
  }
  return null;
}

export function archiveLegacyWorkspace(): void {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    ?? window.localStorage.getItem(LEGACY_RECOVERY_KEY);
  if (!raw) return;
  window.localStorage.setItem(LEGACY_BACKUP_KEY, raw);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_RECOVERY_KEY);
}
