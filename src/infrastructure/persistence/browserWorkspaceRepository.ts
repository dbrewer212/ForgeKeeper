import type { AppData } from "../../types/domain";
import { archiveLegacyWorkspace, migrateWorkspaceData, readLegacyWorkspace } from "../../core/persistence/legacyMigration";
import {
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceLoadResult,
  type WorkspaceRepository,
} from "../../core/persistence/workspaceRepository";

const PREVIEW_STORAGE_KEY = "forgekeeper.workspace.v3.preview";

type PreviewEnvelope = {
  schemaVersion: number;
  savedAt: string;
  data: AppData;
};

export class BrowserWorkspaceRepository implements WorkspaceRepository {
  readonly backend = "browser-preview" as const;

  async load(): Promise<WorkspaceLoadResult> {
    const current = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current) as PreviewEnvelope;
      return { data: migrateWorkspaceData(parsed.data), backend: this.backend, legacyImported: false };
    }

    const legacy = readLegacyWorkspace();
    if (legacy) {
      const data = migrateWorkspaceData(legacy);
      await this.save(data);
      archiveLegacyWorkspace();
      return { data, backend: this.backend, legacyImported: true };
    }

    return { data: null, backend: this.backend, legacyImported: false };
  }

  async save(data: AppData): Promise<void> {
    const envelope: PreviewEnvelope = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data,
    };
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(envelope));
  }

  async clear(): Promise<void> {
    window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
  }
}
