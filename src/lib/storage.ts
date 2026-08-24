import type { AppData, CanonRecord } from "../types/domain";
import { seedCanonRecords } from "../data/seed";
import { downloadText, type CsvDownloadResult } from "./csv";
import type Database from "@tauri-apps/plugin-sql";

export const STORAGE_KEY = "forgekeeper.app.v1";
export const DATABASE_URL = "sqlite:forgekeeper.db";
const WORKSPACE_SCHEMA_VERSION = 3;
const WORKSPACE_TABLE = "forgekeeper_workspace_state";
const LEGACY_WORKSPACE_ID = "local-foundry";
const NATIVE_SAVE_DEBOUNCE_MS = 350;
const IDLE_SAVE_TIMEOUT_MS = 1200;

type WorkspaceRow = { payload: string };
type LegacyWorkspaceRow = { payload_json: string };
type TableInfoRow = { name: string };
type ReadableDatabase = Pick<Database, "select">;
type SaveWaiter = { resolve: () => void; reject: (error: unknown) => void };

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let databasePromise: Promise<Database> | null = null;
let cachedStoredData: AppData | null | undefined;
let pendingNativeData: AppData | null = null;
let pendingWaiters: SaveWaiter[] = [];
let saveTimer: number | null = null;
let idleHandle: number | null = null;
let writeInFlight = false;
let latestWorkspaceSnapshot: AppData | null = null;
let closeJournalInstalled = false;

function mergeSeedCanonRecords(records?: CanonRecord[]): CanonRecord[] {
  const stored = records ?? [];
  return [
    ...seedCanonRecords.map((seed) => ({
      ...seed,
      ...(stored.find((record) => record.id === seed.id) ?? {}),
    })),
    ...stored.filter((record) => !seedCanonRecords.some((seed) => seed.id === record.id)),
  ];
}

function migrateWorkspaceData(data: AppData | null): AppData | null {
  if (!data) return null;
  return {
    ...data,
    canonRecords: mergeSeedCanonRecords(data.canonRecords),
  };
}

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
  if (cachedStoredData !== undefined) return cachedStoredData;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cachedStoredData = migrateWorkspaceData(raw ? (JSON.parse(raw) as AppData) : null);
    return cachedStoredData;
  } catch (error) {
    console.warn("Forgekeeper storage failed to load", error);
    cachedStoredData = null;
    return null;
  }
}

export function saveStoredData(data: AppData): void {
  cachedStoredData = data;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Forgekeeper storage failed to save", error);
  }
}

export function selectStartupWorkspace(fallbackData: AppData | null, nativeData: AppData | null): AppData | null {
  return migrateWorkspaceData(fallbackData ?? nativeData);
}

export async function loadHistoricalWorkspace(database: ReadableDatabase): Promise<AppData | null> {
  const legacyColumns = await database.select<TableInfoRow[]>("PRAGMA table_info(workspace_state)");
  const columnNames = new Set(legacyColumns.map((column) => column.name));
  if (columnNames.has("payload_json") && columnNames.has("workspace_id")) {
    const legacyRows = await database.select<LegacyWorkspaceRow[]>(
      "SELECT payload_json FROM workspace_state WHERE workspace_id = $1 LIMIT 1",
      [LEGACY_WORKSPACE_ID],
    );
    return legacyRows.length ? migrateWorkspaceData(JSON.parse(legacyRows[0].payload_json) as AppData) : null;
  }
  if (columnNames.has("payload") && columnNames.has("id")) {
    const censusRows = await database.select<WorkspaceRow[]>("SELECT payload FROM workspace_state WHERE id = 1");
    return censusRows.length ? migrateWorkspaceData(JSON.parse(censusRows[0].payload) as AppData) : null;
  }
  return null;
}

export async function loadNativeStoredData(): Promise<AppData | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<WorkspaceRow[]>(`SELECT payload FROM ${WORKSPACE_TABLE} WHERE id = 1`);
  if (rows.length) return migrateWorkspaceData(JSON.parse(rows[0].payload) as AppData);

  // Import the authoritative JSON record from the pre-census Foundry schema without
  // modifying or renaming its tables. The caller persists the hydrated result afterward.
  return loadHistoricalWorkspace(database);
}

function installCloseJournal() {
  if (closeJournalInstalled || typeof window === "undefined") return;
  closeJournalInstalled = true;
  const preserveLatest = () => {
    if (!latestWorkspaceSnapshot) return;
    // The synchronous browser journal is only a crash/close fallback for a SQLite write
    // that has not completed. Persisting it after a successful native save would let a
    // stale localStorage snapshot override newer SQLite data on the next startup.
    if (!pendingNativeData && !writeInFlight) return;
    saveStoredData(latestWorkspaceSnapshot);
  };
  window.addEventListener("pagehide", preserveLatest);
  window.addEventListener("beforeunload", preserveLatest);
}

function clearScheduledSave() {
  if (typeof window === "undefined") return;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  const idleWindow = window as IdleWindow;
  if (idleHandle !== null && idleWindow.cancelIdleCallback) {
    idleWindow.cancelIdleCallback(idleHandle);
    idleHandle = null;
  }
}

function scheduleNativeFlush() {
  if (typeof window === "undefined" || writeInFlight) return;
  clearScheduledSave();
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(() => {
        idleHandle = null;
        void flushQueuedNativeSave();
      }, { timeout: IDLE_SAVE_TIMEOUT_MS });
    } else {
      void flushQueuedNativeSave();
    }
  }, NATIVE_SAVE_DEBOUNCE_MS);
}

async function flushQueuedNativeSave(): Promise<void> {
  if (writeInFlight || !pendingNativeData) return;
  writeInFlight = true;
  const data = pendingNativeData;
  const waiters = pendingWaiters;
  pendingNativeData = null;
  pendingWaiters = [];

  try {
    const database = await getDatabase();
    if (!database) {
      saveStoredData(data);
    } else {
      // Serialization intentionally happens here, after debounce and during browser idle time.
      const payload = JSON.stringify(data);
      await database.execute(
        `INSERT INTO ${WORKSPACE_TABLE} (id, schema_version, payload, updated_at)
         VALUES (1, $1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET
           schema_version = excluded.schema_version,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        [WORKSPACE_SCHEMA_VERSION, payload, new Date().toISOString()],
      );
      // SQLite is authoritative after a successful native write. Remove any recovery journal
      // so it cannot shadow this newer database snapshot on a later startup.
      clearStoredData();
    }
    waiters.forEach(({ resolve }) => resolve());
  } catch (error) {
    waiters.forEach(({ reject }) => reject(error));
  } finally {
    writeInFlight = false;
    if (pendingNativeData) scheduleNativeFlush();
  }
}

export function saveNativeStoredData(data: AppData): Promise<void> {
  latestWorkspaceSnapshot = data;
  installCloseJournal();

  if (!isTauriRuntime()) {
    saveStoredData(data);
    return Promise.resolve();
  }

  pendingNativeData = data;
  const promise = new Promise<void>((resolve, reject) => {
    pendingWaiters.push({ resolve, reject });
  });
  scheduleNativeFlush();
  return promise;
}

export async function clearNativeStoredData(): Promise<void> {
  clearScheduledSave();
  pendingNativeData = null;
  pendingWaiters = [];
  latestWorkspaceSnapshot = null;
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
  cachedStoredData = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function downloadJson(filename: string, data: unknown): Promise<CsvDownloadResult> {
  return downloadText(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8;");
}
