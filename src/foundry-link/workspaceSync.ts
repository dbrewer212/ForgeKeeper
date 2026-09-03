import { saveRecoveryCheckpoint } from "../lib/recovery";
import { saveNativeStoredData } from "../lib/storage";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import type { AppData } from "../types/domain";

export type FoundryLinkWorkspaceEnvelope = {
  revision: number;
  payload: string;
  updatedAtMs: number;
  sourceDeviceId?: string | null;
};

export function snapshotForgekeeperState(state: ForgekeeperState): AppData {
  return {
    products: state.products,
    stls: state.stls,
    concepts: state.concepts,
    productionReferences: state.productionReferences,
    modelVerifications: state.modelVerifications,
    printTrials: state.printTrials,
    variants: state.variants,
    collections: state.collections,
    releases: state.releases,
    orders: state.orders,
    filamentProfiles: state.filamentProfiles,
    filament: state.filament,
    materialTransactions: state.materialTransactions,
    materialReservations: state.materialReservations,
    filamentDryingRecords: state.filamentDryingRecords,
    materialImportHistory: state.materialImportHistory,
    printers: state.printers,
    maintenance: state.maintenance,
    generationJobs: state.generationJobs,
    controlCenter: state.controlCenter,
    canonRecords: state.canonRecords,
    libraryAssets: state.libraryAssets,
    recovery: state.recovery,
    settings: state.settings,
    prototypes: state.prototypes,
    plannedFilament: state.plannedFilament,
    productPlanning: state.productPlanning,
    realmMaterials: state.realmMaterials,
  };
}

export function serializeForgekeeperState(state: ForgekeeperState): string {
  return JSON.stringify(snapshotForgekeeperState(state));
}

export function parseLinkedWorkspace(payload: string): AppData {
  const parsed = JSON.parse(payload) as Partial<AppData>;
  const requiredArrays: Array<keyof AppData> = [
    "products",
    "stls",
    "concepts",
    "orders",
    "filament",
    "printers",
  ];

  for (const key of requiredArrays) {
    if (!Array.isArray(parsed[key])) {
      throw new Error(`Foundry Link workspace is missing required ${String(key)} records.`);
    }
  }

  return parsed as AppData;
}

export async function commitLinkedWorkspace(
  state: ForgekeeperState,
  envelope: FoundryLinkWorkspaceEnvelope,
  sourceLabel: string,
): Promise<void> {
  const next = parseLinkedWorkspace(envelope.payload);
  const current = snapshotForgekeeperState(state);
  await saveRecoveryCheckpoint(
    current,
    `Automatic checkpoint before Foundry Link revision ${envelope.revision} from ${sourceLabel}`,
  );
  await saveNativeStoredData(next);
  window.location.reload();
}
