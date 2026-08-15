import type { AppData } from "../types/domain";
import { migrateLegacyAppDataToWorkbench, type LegacyWorkbenchMigration } from "./migration";
import { WorkbenchMetaStore } from "./meta";
import { WorkbenchRepository } from "./repository";

const LEGACY_BOOTSTRAP_KEY = "legacy_bootstrap_v1";

type LegacyBootstrapMarker = {
  status: "completed" | "adopted-existing";
  completedAt: string;
  assetCount: number;
  revisionCount: number;
  preparationCount: number;
  pendingIntakeStlIds: string[];
};

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

  const meta = new WorkbenchMetaStore();
  const marker = await meta.getJson<LegacyBootstrapMarker>(LEGACY_BOOTSTRAP_KEY);
  if (marker) {
    const existing = await repository.loadState();
    return {
      status: "existing",
      assetCount: existing.assets.length,
      revisionCount: existing.revisions.length,
      preparationCount: existing.preparations.length,
      pendingIntakeStlIds: marker.pendingIntakeStlIds ?? [],
    };
  }

  const existing = await repository.loadState();
  if (existing.assets.length > 0) {
    const adopted: LegacyBootstrapMarker = {
      status: "adopted-existing",
      completedAt: new Date().toISOString(),
      assetCount: existing.assets.length,
      revisionCount: existing.revisions.length,
      preparationCount: existing.preparations.length,
      pendingIntakeStlIds: [],
    };
    await meta.setJson(LEGACY_BOOTSTRAP_KEY, adopted);
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

  const completed: LegacyBootstrapMarker = {
    status: "completed",
    completedAt: new Date().toISOString(),
    assetCount: migration.state.assets.length,
    revisionCount: migration.state.revisions.length,
    preparationCount: migration.state.preparations.length,
    pendingIntakeStlIds: migration.pendingIntakeStlIds,
  };
  await meta.setJson(LEGACY_BOOTSTRAP_KEY, completed);

  return {
    status: "migrated",
    assetCount: migration.state.assets.length,
    revisionCount: migration.state.revisions.length,
    preparationCount: migration.state.preparations.length,
    pendingIntakeStlIds: migration.pendingIntakeStlIds,
  };
}
