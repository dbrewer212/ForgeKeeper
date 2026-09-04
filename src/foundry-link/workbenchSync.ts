import type Database from "@tauri-apps/plugin-sql";
import type { WorkbenchState } from "../workbench/contracts";
import { WorkbenchRepository } from "../workbench/repository";

const DATABASE_URL = "sqlite:forgekeeper-workbench.db";
const RETAINED_RECOVERY_SNAPSHOTS = 6;

async function openDatabase(): Promise<Database> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load(DATABASE_URL);
}

export async function replaceWorkbenchStateFromFoundryLink(
  next: WorkbenchState,
  revision: number,
  sourceLabel: string,
): Promise<void> {
  const repository = new WorkbenchRepository();
  await repository.initialize();
  const current = await repository.loadState();
  const db = await openDatabase();

  await db.execute(`CREATE TABLE IF NOT EXISTS workbench_link_recovery (
    recovery_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    revision INTEGER NOT NULL,
    source_label TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`);

  const recoveryId = `WB-LINK-${Date.now()}`;
  await db.execute(
    "INSERT INTO workbench_link_recovery(recovery_id,created_at,revision,source_label,payload_json) VALUES($1,$2,$3,$4,$5)",
    [recoveryId, new Date().toISOString(), revision, sourceLabel, JSON.stringify(current)],
  );
  await db.execute(
    `DELETE FROM workbench_link_recovery
     WHERE recovery_id NOT IN (
       SELECT recovery_id FROM workbench_link_recovery ORDER BY created_at DESC LIMIT ${RETAINED_RECOVERY_SNAPSHOTS}
     )`,
  );

  // Workbench files on disk are never deleted by synchronization. This replaces only
  // the authoritative database records, preserving local managed bytes for recovery/reuse.
  const tables = [
    "workbench_print_records",
    "workbench_preparations",
    "workbench_inspections",
    "workbench_manufacturing_specs",
    "workbench_assemblies",
    "workbench_variants",
    "workbench_relationships",
    "workbench_revisions",
    "workbench_files",
    "workbench_assets",
  ];
  for (const table of tables) {
    await db.execute(`DELETE FROM ${table}`);
  }

  await repository.persistState(next);
}
