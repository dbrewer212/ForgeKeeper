import type Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:forgekeeper-workbench.db";

type MetaRow = { value: string };

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export class WorkbenchMetaStore {
  private databasePromise: Promise<Database> | null = null;

  private async database(): Promise<Database | null> {
    if (!isTauriRuntime()) return null;
    this.databasePromise ??= import("@tauri-apps/plugin-sql").then(({ default: Database }) => Database.load(DATABASE_URL));
    return this.databasePromise;
  }

  async get(key: string): Promise<string | undefined> {
    const db = await this.database();
    if (!db) return undefined;
    const rows = await db.select<MetaRow[]>("SELECT value FROM workbench_meta WHERE key = $1 LIMIT 1", [key]);
    return rows[0]?.value;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.database();
    if (!db) throw new Error("Workbench metadata is unavailable outside the desktop runtime.");
    await db.execute(
      `INSERT INTO workbench_meta(key, value) VALUES($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const raw = await this.get(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Workbench metadata key ${key} contains invalid JSON.`);
    }
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }
}
