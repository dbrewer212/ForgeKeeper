import type { AppData } from "../types/domain";
import { migrateLegacyAppDataToWorkbench, type LegacyWorkbenchMigration } from "./migration";
import { WorkbenchRepository } from "./repository";

export type WorkbenchBootstrapResult = {
  status: "unavailable" | "existing" | "migrated";
  assetCount: number;
  revisionCount: number;
  preparationCount: number;
  pendingIntakeStlIds: string[];
};

let bootstrapPromise: Promise<WorkbenchBootstrapResult> | null = null;

export function ensureWorkbenchBootstrap(legacyData: AppData): Promise<WorkbenchBootstrapResult> {
  bootstrapPromise ??= runBootstrap(legacyData);
  return bootstrapPromise;
}

async function runBootstrap(legacyData: AppData): Promise<WorkbenchBootstrapResult> {
  const repository = new WorkbenchRepository();
  const available = await repository.initialize();
  if (!available) return { status: "unavailable", assetCount: 0, revisionCount: 0, preparationCount: 0, pendingIntakeStlIds: [] };

  const existing = await repository.loadState();
  if (existing.assets.length > 0) {
    return {
      status: "existing",
      assetCount: existing.assets.length,
      revisionCount: existing.revisions.length,
      preparationCount: existing.preparations.length,
      pendingIntakeStlIds: [],
    };
  }

  const migration: LegacyWorkbenchMigration = migrateLegacyAppDataToWorkbench(legacyData);
  await repository.persistState(migration.state);
  return {
    status: "migrated",
    assetCount: migration.state.assets.length,
    revisionCount: migration.state.revisions.length,
    preparationCount: migration.state.preparations.length,
    pendingIntakeStlIds: migration.pendingIntakeStlIds,
  };
}
