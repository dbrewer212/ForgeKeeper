import type { AppData } from "../types/domain";
import { migrateLegacyAppDataToWorkbench, type LegacyWorkbenchMigration } from "./migration";
import { WorkbenchMetaStore } from "./meta";
import { WorkbenchRepository } from "./repository";

const LEGACY_BOOTSTRAP_KEY = "legacy_bootstrap_v1";

type LegacyBootstrapMarker = {
  status: "in-progress" | "completed" | "adopted-existing";
  migrationTimestamp: string;
  startedAt: string;
  completedAt?: string;
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

  if (marker && marker.status !== "in-progress") {
    const existing = await repository.loadState();
    return {
      status: "existing",
      assetCount: existing.assets.length,
      revisionCount: existing.revisions.length,
      preparationCount: existing.preparations.length,
      pendingIntakeStlIds: marker.pendingIntakeStlIds ?? [],
    };
  }

  if (!marker) {
    const existing = await repository.loadState();
    if (existing.assets.length > 0) {
      const now = new Date().toISOString();
      const adopted: LegacyBootstrapMarker = {
        status: "adopted-existing",
        migrationTimestamp: now,
        startedAt: now,
        completedAt: now,
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
  }

  const migrationTimestamp = marker?.migrationTimestamp ?? new Date().toISOString();
  const startedAt = marker?.startedAt ?? new Date().toISOString();
  const inProgress: LegacyBootstrapMarker = {
    status: "in-progress",
    migrationTimestamp,
    startedAt,
    assetCount: marker?.assetCount ?? 0,
    revisionCount: marker?.revisionCount ?? 0,
    preparationCount: marker?.preparationCount ?? 0,
    pendingIntakeStlIds: marker?.pendingIntakeStlIds ?? [],
  };
  await meta.setJson(LEGACY_BOOTSTRAP_KEY, inProgress);

  const migration: LegacyWorkbenchMigration = migrateLegacyAppDataToWorkbench(legacyData, migrationTimestamp);
  await repository.persistState(migration.state);

  const completed: LegacyBootstrapMarker = {
    status: "completed",
    migrationTimestamp,
    startedAt,
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
