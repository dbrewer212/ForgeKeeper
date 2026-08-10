import type { AppData } from "../types/domain";
import type Database from "@tauri-apps/plugin-sql";

export const STORAGE_KEY = "forgekeeper.app.v1";
export const DATABASE_URL = "sqlite:forgekeeper.db";
const WORKSPACE_SCHEMA_VERSION = 2;
const WORKSPACE_TABLE = "forgekeeper_workspace_state";
const LEGACY_WORKSPACE_ID = "local-foundry";

type WorkspaceRow = { payload: string };
type LegacyWorkspaceRow = { payload_json: string };
type TableInfoRow = { name: string };
type ReadableDatabase = Pick<Database, "select">;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let databasePromise: Promise<Database> | null = null;

async function getDatabase() {
  if (!isTauriRuntime()) return null;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql").then(async ({ default: Database }) => {
      const database = await Database.load(DATABASE_URL);
      // Use a uniquely named table. Historical Foundry builds already own `workspace_state`
      // with a different primary key and payload column; reusing that name cannot upgrade it.
      await database.execute(`
        CREATE TABLE IF NOT EXISTS ${WORKSPACE_TABLE} (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return database;
    });
  }
  return databasePromise;
}

export function loadStoredData(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch (error) {
    console.warn("Forgekeeper storage failed to load", error);
    return null;
  }
}

export function saveStoredData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Forgekeeper storage failed to save", error);
  }
}

export function selectStartupWorkspace(fallbackData: AppData | null, nativeData: AppData | null): AppData | null {
  return fallbackData ?? nativeData;
}

export async function loadHistoricalWorkspace(database: ReadableDatabase): Promise<AppData | null> {
  const legacyColumns = await database.select<TableInfoRow[]>("PRAGMA table_info(workspace_state)");
  const columnNames = new Set(legacyColumns.map((column) => column.name));
  if (columnNames.has("payload_json") && columnNames.has("workspace_id")) {
    const legacyRows = await database.select<LegacyWorkspaceRow[]>(
      "SELECT payload_json FROM workspace_state WHERE workspace_id = $1 LIMIT 1",
      [LEGACY_WORKSPACE_ID],
    );
    return legacyRows.length ? (JSON.parse(legacyRows[0].payload_json) as AppData) : null;
  }
  if (columnNames.has("payload") && columnNames.has("id")) {
    const censusRows = await database.select<WorkspaceRow[]>("SELECT payload FROM workspace_state WHERE id = 1");
    return censusRows.length ? (JSON.parse(censusRows[0].payload) as AppData) : null;
  }
  return null;
}

export async function loadNativeStoredData(): Promise<AppData | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<WorkspaceRow[]>(`SELECT payload FROM ${WORKSPACE_TABLE} WHERE id = 1`);
  if (rows.length) return JSON.parse(rows[0].payload) as AppData;

  // Import the authoritative JSON record from the pre-census Foundry schema without
  // modifying or renaming its tables. The caller persists the hydrated result afterward.
  return loadHistoricalWorkspace(database);
}

export async function saveNativeStoredData(data: AppData): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    saveStoredData(data);
    return;
  }
  await database.execute(
    `INSERT INTO ${WORKSPACE_TABLE} (id, schema_version, payload, updated_at)
     VALUES (1, $1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [WORKSPACE_SCHEMA_VERSION, JSON.stringify(data), new Date().toISOString()],
  );
}

export async function clearNativeStoredData(): Promise<void> {
  const database = await getDatabase();
  if (database) {
    await database.execute(`DELETE FROM ${WORKSPACE_TABLE} WHERE id = 1`);
    const legacyColumns = await database.select<TableInfoRow[]>("PRAGMA table_info(workspace_state)");
    const columnNames = new Set(legacyColumns.map((column) => column.name));
    if (columnNames.has("workspace_id")) {
      await database.execute("DELETE FROM workspace_state WHERE workspace_id = $1", [LEGACY_WORKSPACE_ID]);
    } else if (columnNames.has("id")) {
      await database.execute("DELETE FROM workspace_state WHERE id = 1");
    }
  }
  clearStoredData();
}

export function clearStoredData(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
