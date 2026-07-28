import type { AppData } from "../../types/domain";

export const WORKSPACE_SCHEMA_VERSION = 5;
export const WORKSPACE_ID = "local-foundry";

export type StorageBackend = "sqlite" | "browser-preview";

export type WorkspaceLoadResult = {
  data: AppData | null;
  backend: StorageBackend;
  legacyImported: boolean;
};

export interface WorkspaceRepository {
  readonly backend: StorageBackend;
  load(): Promise<WorkspaceLoadResult>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}
