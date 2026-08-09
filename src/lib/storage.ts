import type { AppData } from "../types/domain";
import type Database from "@tauri-apps/plugin-sql";

export const STORAGE_KEY = "forgekeeper.app.v1";
export const DATABASE_URL = "sqlite:forgekeeper.db";
const WORKSPACE_SCHEMA_VERSION = 2;

type WorkspaceRow = { payload: string };

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let databasePromise: Promise<Database> | null = null;

async function getDatabase() {
  if (!isTauriRuntime()) return null;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql").then(async ({ default: Database }) => {
      const database = await Database.load(DATABASE_URL);
      // Defensive creation keeps Windows production builds safe even if a plugin preload migration is delayed.
      await database.execute(`
        CREATE TABLE IF NOT EXISTS workspace_state (
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

export async function loadNativeStoredData(): Promise<AppData | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<WorkspaceRow[]>("SELECT payload FROM workspace_state WHERE id = 1");
  if (!rows.length) return null;
  return JSON.parse(rows[0].payload) as AppData;
}

export async function saveNativeStoredData(data: AppData): Promise<void> {
  const database = await getDatabase();
  if (!database) {
    saveStoredData(data);
    return;
  }
  await database.execute(
    `INSERT INTO workspace_state (id, schema_version, payload, updated_at)
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
  if (database) await database.execute("DELETE FROM workspace_state WHERE id = 1");
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
