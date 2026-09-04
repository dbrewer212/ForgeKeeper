import { saveRecoveryCheckpoint } from "../lib/recovery";
import { saveNativeStoredData } from "../lib/storage";
import { getFoundryMeshRuntime } from "../mesh";
import type { FoundryDomainState } from "../mesh/domainState";
import type { Checkpoint } from "../mesh/types";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import type { AppData } from "../types/domain";
import type { WorkbenchState } from "../workbench/contracts";
import { getWorkbenchStateForFoundryLink } from "../workbench/useWorkbenchVault";
import {
  canonicalFoundryLinkPayload,
  FOUNDRY_LINK_FORMAT,
  FOUNDRY_LINK_SCHEMA_VERSION,
} from "./protocol";
import { replaceWorkbenchStateFromFoundryLink } from "./workbenchSync";

export { canonicalFoundryLinkPayload } from "./protocol";

export type FoundryLinkWorkspaceEnvelope = {
  revision: number;
  payload: string;
  updatedAtMs: number;
  sourceDeviceId?: string | null;
};

type FoundryLinkWorkspaceBundle = {
  format: typeof FOUNDRY_LINK_FORMAT;
  schemaVersion: 2 | 3 | 4;
  appData: AppData;
  meshDomain: FoundryDomainState;
  workbench?: WorkbenchState;
};

type ParsedLinkedWorkspace = {
  appData: AppData;
  meshDomain?: FoundryDomainState;
  workbench?: WorkbenchState;
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
  const mesh = getFoundryMeshRuntime();
  const bundle: FoundryLinkWorkspaceBundle = {
    format: FOUNDRY_LINK_FORMAT,
    schemaVersion: FOUNDRY_LINK_SCHEMA_VERSION,
    appData: snapshotForgekeeperState(state),
    meshDomain: mesh.snapshot().domain,
    workbench: getWorkbenchStateForFoundryLink() ?? undefined,
  };
  return JSON.stringify(bundle);
}

function validateAppData(parsed: Partial<AppData>): AppData {
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

export function parseLinkedWorkspace(payload: string): ParsedLinkedWorkspace {
  const parsed = JSON.parse(payload) as Partial<FoundryLinkWorkspaceBundle> & Partial<AppData>;

  if (parsed.format === FOUNDRY_LINK_FORMAT) {
    if (parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3 && parsed.schemaVersion !== 4) {
      throw new Error(`Unsupported Foundry Link workspace schema ${String(parsed.schemaVersion)}.`);
    }
    if (!parsed.appData || !parsed.meshDomain) {
      throw new Error("Foundry Link workspace bundle is missing AppData or Mesh domain state.");
    }
    return {
      appData: validateAppData(parsed.appData),
      meshDomain: parsed.meshDomain,
      workbench: parsed.schemaVersion >= 3 ? parsed.workbench : undefined,
    };
  }

  // Backward compatibility for the first Mobile Foundry branch, which synchronized
  // AppData directly before the Mesh and Workbench domains were included.
  return { appData: validateAppData(parsed as Partial<AppData>) };
}

export async function commitLinkedWorkspace(
  state: ForgekeeperState,
  envelope: FoundryLinkWorkspaceEnvelope,
  sourceLabel: string,
): Promise<void> {
  const next = parseLinkedWorkspace(envelope.payload);
  const incomingDurable = canonicalFoundryLinkPayload(envelope.payload);
  const currentDurable = canonicalFoundryLinkPayload(serializeForgekeeperState(state));
  if (incomingDurable === currentDurable) return;

  const current = snapshotForgekeeperState(state);
  await saveRecoveryCheckpoint(
    current,
    `Automatic checkpoint before Foundry Link revision ${envelope.revision} from ${sourceLabel}`,
  );

  if (next.workbench) {
    await replaceWorkbenchStateFromFoundryLink(next.workbench, envelope.revision, sourceLabel);
  }

  const mesh = getFoundryMeshRuntime();
  await mesh.initialize();
  if (next.meshDomain) {
    const currentMesh = mesh.snapshot();
    const domainCheckpoint: Checkpoint<FoundryDomainState> = {
      id: `LINK-DOMAIN-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdByWorkerId: "foundry-core",
      scope: "foundry-link-domain",
      summary: `Mesh domain before Foundry Link revision ${envelope.revision} from ${sourceLabel}`,
      state: currentMesh.domain,
      metadata: { revision: envelope.revision, sourceLabel },
    };
    const retainedCheckpoints = [...currentMesh.checkpoints, domainCheckpoint].slice(-100);
    await mesh.persistence.saveSnapshot({
      ...currentMesh,
      savedAt: new Date().toISOString(),
      checkpoints: retainedCheckpoints,
      domain: next.meshDomain,
    });
  }

  await saveNativeStoredData(next.appData);
  window.location.reload();
}
