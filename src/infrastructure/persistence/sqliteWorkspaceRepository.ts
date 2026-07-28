import Database from "@tauri-apps/plugin-sql";
import type { AppData } from "../../types/domain";
import { archiveLegacyWorkspace, migrateWorkspaceData, readLegacyWorkspace } from "../../core/persistence/legacyMigration";
import {
  WORKSPACE_ID,
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceLoadResult,
  type WorkspaceRepository,
} from "../../core/persistence/workspaceRepository";

const DATABASE_URL = "sqlite:forgekeeper.db";

type WorkspaceRow = {
  payload_json: string;
};

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  readonly backend = "sqlite" as const;
  private databasePromise?: Promise<Database>;

  private database(): Promise<Database> {
    this.databasePromise ??= Database.load(DATABASE_URL);
    return this.databasePromise;
  }

  async load(): Promise<WorkspaceLoadResult> {
    const database = await this.database();
    const rows = await database.select<WorkspaceRow[]>(
      "SELECT payload_json FROM workspace_state WHERE workspace_id = $1 LIMIT 1",
      [WORKSPACE_ID],
    );
    if (rows[0]) {
      return {
        data: migrateWorkspaceData(JSON.parse(rows[0].payload_json)),
        backend: this.backend,
        legacyImported: false,
      };
    }

    const legacy = readLegacyWorkspace();
    if (legacy) {
      const data = migrateWorkspaceData(legacy);
      await this.save(data);
      await database.execute(
        `INSERT OR REPLACE INTO migration_log
          (migration_key, source_name, imported_at, details_json)
         VALUES ($1, $2, $3, $4)`,
        ["legacy-local-storage-v1", "forgekeeper.app.v1", new Date().toISOString(), JSON.stringify({ schemaVersion: WORKSPACE_SCHEMA_VERSION })],
      );
      archiveLegacyWorkspace();
      return { data, backend: this.backend, legacyImported: true };
    }

    return { data: null, backend: this.backend, legacyImported: false };
  }

  async save(data: AppData): Promise<void> {
    const database = await this.database();
    const now = new Date().toISOString();
    await database.execute(
      `INSERT INTO workspace_state
        (workspace_id, schema_version, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT(workspace_id) DO UPDATE SET
         schema_version = excluded.schema_version,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      [WORKSPACE_ID, WORKSPACE_SCHEMA_VERSION, JSON.stringify(data), now],
    );
  }

  async clear(): Promise<void> {
    const database = await this.database();
    await database.execute("DELETE FROM workspace_state WHERE workspace_id = $1", [WORKSPACE_ID]);
  }
}
