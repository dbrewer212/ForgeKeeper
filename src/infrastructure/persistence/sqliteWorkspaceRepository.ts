import Database from "@tauri-apps/plugin-sql";
import type { AppData } from "../../types/domain";
import { inspectWorkspaceIntegrity } from "../../core/domain/workspaceData";
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
  private writeChain: Promise<void> = Promise.resolve();

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
    const issues = inspectWorkspaceIntegrity(data);
    if (issues.length > 0) {
      throw new Error(`Workspace integrity check failed: ${issues[0].message}`);
    }
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(() => this.persist(data));
    return this.writeChain;
  }

  private async persist(data: AppData): Promise<void> {
    const database = await this.database();
    const now = new Date().toISOString();
    await database.execute("BEGIN IMMEDIATE");
    try {
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

      await this.replaceStationTables(database, data, now);
      await database.execute("COMMIT");
    } catch (error) {
      await database.execute("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  private async replaceStationTables(database: Database, data: AppData, now: string): Promise<void> {
    const tables = [
      "design_projects",
      "production_jobs",
      "production_batches",
      "material_spools",
      "material_movements",
      "printers",
      "cost_snapshots",
      "activity_events",
    ];
    for (const table of tables) {
      await database.execute(`DELETE FROM ${table} WHERE workspace_id = $1`, [WORKSPACE_ID]);
    }

    for (const item of data.designProjects) {
      await database.execute(
        `INSERT INTO design_projects
          (id, workspace_id, name, status, payload_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [item.id, WORKSPACE_ID, item.name, item.status, JSON.stringify(item), now],
      );
    }
    for (const item of data.productionJobs) {
      await database.execute(
        `INSERT INTO production_jobs
          (id, workspace_id, design_project_id, name, status, priority, payload_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [item.id, WORKSPACE_ID, item.designProjectId, item.name, item.status, item.priority, JSON.stringify(item), now],
      );
    }
    for (const item of data.productionBatches) {
      await database.execute(
        `INSERT INTO production_batches
          (id, workspace_id, name, status, payload_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [item.id, WORKSPACE_ID, item.name, item.status, JSON.stringify(item), now],
      );
    }
    for (const item of data.filament) {
      await database.execute(
        `INSERT INTO material_spools
          (id, workspace_id, name, material, payload_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [item.id, WORKSPACE_ID, item.colorName, item.material, JSON.stringify(item), now],
      );
    }
    for (const item of data.materialMovements) {
      await database.execute(
        `INSERT INTO material_movements
          (id, workspace_id, filament_id, production_job_id, movement_type, grams, occurred_at, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [item.id, WORKSPACE_ID, item.filamentId, item.productionJobId ?? null, item.type, item.grams, item.occurredAt, JSON.stringify(item)],
      );
    }
    for (const item of data.printers) {
      await database.execute(
        `INSERT INTO printers
          (id, workspace_id, name, status, payload_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [item.id, WORKSPACE_ID, item.name, item.status, JSON.stringify(item), now],
      );
    }
    for (const item of data.costSnapshots) {
      await database.execute(
        `INSERT INTO cost_snapshots
          (id, workspace_id, production_job_id, captured_at, total_cost, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item.id, WORKSPACE_ID, item.productionJobId, item.capturedAt, item.totalCost, JSON.stringify(item)],
      );
    }
    for (const item of data.activityLog) {
      await database.execute(
        `INSERT INTO activity_events
          (id, workspace_id, occurred_at, station, kind, summary, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.id, WORKSPACE_ID, item.occurredAt, item.station, item.kind, item.summary, JSON.stringify(item)],
      );
    }
  }

  async clear(): Promise<void> {
    const database = await this.database();
    await database.execute("DELETE FROM workspace_state WHERE workspace_id = $1", [WORKSPACE_ID]);
  }
}
