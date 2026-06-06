import type { AppData } from "../types/domain";

export const STORAGE_KEY = "forgekeeper.app.v1";
const BACKUP_STORAGE_KEY = "forgekeeper.app.v1.backup";
const META_STORAGE_KEY = "forgekeeper.app.v1.meta";

type StorageMeta = {
  lastSavedAt: string;
  lastBackupAt: string;
  version: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function looksLikeAppData(value: unknown): value is AppData {
  if (!isObject(value)) return false;

  const requiredArrays = [
    "products",
    "orders",
    "filament",
    "printers",
    "maintenance",
  ];

  return requiredArrays.every((key) => Array.isArray(value[key]));
}

function parseStoredData(raw: string | null): AppData | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    if (!looksLikeAppData(parsed)) {
      console.warn("ForgeKeeper storage data failed validation.");
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("ForgeKeeper storage JSON could not be parsed.", error);
    return null;
  }
}

export function loadStoredData(): AppData | null {
  if (typeof window === "undefined") return null;

  const primary = parseStoredData(window.localStorage.getItem(STORAGE_KEY));

  if (primary) return primary;

  const backup = parseStoredData(window.localStorage.getItem(BACKUP_STORAGE_KEY));

  if (backup) {
    console.warn("ForgeKeeper recovered data from backup storage.");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
    return backup;
  }

  return null;
}

export function saveStoredData(data: AppData): void {
  if (typeof window === "undefined") return;

  try {
    const previous = window.localStorage.getItem(STORAGE_KEY);

    if (previous) {
      window.localStorage.setItem(BACKUP_STORAGE_KEY, previous);
    }

    const serialized = JSON.stringify(data);
    window.localStorage.setItem(STORAGE_KEY, serialized);

    const now = new Date().toISOString();
    const meta: StorageMeta = {
      lastSavedAt: now,
      lastBackupAt: previous ? now : "",
      version: "v1",
    };

    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch (error) {
    console.warn("ForgeKeeper storage failed to save.", error);
  }
}

export function clearStoredData(): void {
  if (typeof window === "undefined") return;

  const current = window.localStorage.getItem(STORAGE_KEY);

  if (current) {
    window.localStorage.setItem(BACKUP_STORAGE_KEY, current);
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(META_STORAGE_KEY);
}

export function getStorageMeta(): StorageMeta | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StorageMeta) : null;
  } catch {
    return null;
  }
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === "undefined") return;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}