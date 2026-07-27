import type { AppData } from "../types/domain";

export const STORAGE_KEY = "forgekeeper.app.v1";
export const BACKUP_STORAGE_KEY = "forgekeeper.app.v1.backup";
export const STORAGE_SCHEMA_VERSION = 2;

type StoredWorkspace = {
  schemaVersion: number;
  savedAt: string;
  data: AppData;
};

function parseStoredWorkspace(raw: string | null): AppData | null {
  if (!raw) return null;

  const parsed = JSON.parse(raw) as AppData | StoredWorkspace;
  if (
    typeof parsed === "object"
    && parsed !== null
    && "data" in parsed
    && "schemaVersion" in parsed
  ) {
    return parsed.data;
  }

  // Legacy ForgeKeeper stored AppData directly. Returning it here allows the
  // state hydrator to supply new defaults without discarding existing records.
  return parsed as AppData;
}

export function loadStoredData(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredWorkspace(window.localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.warn("Forgekeeper storage failed to load", error);
    try {
      return parseStoredWorkspace(window.localStorage.getItem(BACKUP_STORAGE_KEY));
    } catch (backupError) {
      console.warn("Forgekeeper backup storage failed to load", backupError);
      return null;
    }
  }
}

export function saveStoredData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    const previous = window.localStorage.getItem(STORAGE_KEY);
    if (previous) {
      window.localStorage.setItem(BACKUP_STORAGE_KEY, previous);
    }

    const workspace: StoredWorkspace = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch (error) {
    console.warn("Forgekeeper storage failed to save", error);
  }
}

export function clearStoredData(): void {
  if (typeof window === "undefined") return;
  const previous = window.localStorage.getItem(STORAGE_KEY);
  if (previous) {
    window.localStorage.setItem(BACKUP_STORAGE_KEY, previous);
  }
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
