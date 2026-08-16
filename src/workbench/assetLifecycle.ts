import type Database from "@tauri-apps/plugin-sql";
import type { AssetLifecycleStatus, FoundryAsset, WorkbenchId } from "./contracts";
import { WorkbenchRepository } from "./repository";

const DATABASE_URL = "sqlite:forgekeeper-workbench.db";

export type AssetDependencySummary = {
  revisions: number;
  relationships: number;
  variants: number;
  assemblies: number;
  manufacturingSpecs: number;
  inspections: number;
  preparations: number;
  submittedPreparations: number;
  printRecords: number;
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function database(): Promise<Database> {
  if (!isTauriRuntime()) throw new Error("Asset lifecycle changes are available only in the Forgekeeper desktop app.");
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load(DATABASE_URL);
}

export class WorkbenchAssetLifecycleService {
  constructor(private readonly repository = new WorkbenchRepository()) {}

  async dependencySummary(assetId: WorkbenchId): Promise<AssetDependencySummary> {
    const state = await this.repository.loadState();
    return {
      revisions: state.revisions.filter((item) => item.assetId === assetId).length,
      relationships: state.relationships.filter((item) => item.fromAssetId === assetId || item.toAssetId === assetId).length,
      variants: state.variants.filter((item) => item.assetId === assetId || item.parentAssetId === assetId).length,
      assemblies: state.assemblies.filter((item) => item.assetId === assetId).length,
      manufacturingSpecs: state.manufacturingSpecs.filter((item) => item.assetId === assetId).length,
      inspections: state.inspections.filter((item) => item.assetId === assetId).length,
      preparations: state.preparations.filter((item) => item.assetId === assetId).length,
      submittedPreparations: state.preparations.filter((item) => item.assetId === assetId && item.status === "submitted").length,
      printRecords: state.printRecords.filter((item) => item.assetId === assetId).length,
    };
  }

  async setLifecycle(assetId: WorkbenchId, lifecycleStatus: Extract<AssetLifecycleStatus, "retired" | "archived">): Promise<FoundryAsset> {
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === assetId);
    if (!asset) throw new Error("The selected Workbench asset no longer exists.");

    const updated: FoundryAsset = {
      ...asset,
      lifecycleStatus,
      updatedAt: new Date().toISOString(),
    };
    await this.repository.upsertAsset(updated);
    return updated;
  }

  async remove(assetId: WorkbenchId): Promise<AssetDependencySummary> {
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === assetId);
    if (!asset) throw new Error("The selected Workbench asset no longer exists.");

    const summary = await this.dependencySummary(assetId);
    if (summary.printRecords > 0) {
      throw new Error("This asset has permanent physical print evidence. Retire or archive it instead of deleting its manufacturing history.");
    }
    if (summary.submittedPreparations > 0) {
      throw new Error("This asset has a preparation already released to production. Resolve that production record before deleting the asset.");
    }

    const db = await database();
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute("DELETE FROM workbench_preparations WHERE asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_inspections WHERE asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_manufacturing_specs WHERE asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_assemblies WHERE asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_variants WHERE asset_id = $1 OR parent_asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_relationships WHERE from_asset_id = $1 OR to_asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_revisions WHERE asset_id = $1", [assetId]);
      await db.execute("DELETE FROM workbench_assets WHERE asset_id = $1", [assetId]);
      await db.execute("COMMIT");
    } catch (error) {
      try { await db.execute("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    }

    return summary;
  }
}

let singleton: WorkbenchAssetLifecycleService | null = null;
export function getWorkbenchAssetLifecycleService(): WorkbenchAssetLifecycleService {
  singleton ??= new WorkbenchAssetLifecycleService();
  return singleton;
}
