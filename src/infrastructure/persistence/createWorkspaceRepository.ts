import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRepository } from "../../core/persistence/workspaceRepository";
import { BrowserWorkspaceRepository } from "./browserWorkspaceRepository";
import { SqliteWorkspaceRepository } from "./sqliteWorkspaceRepository";

let repository: WorkspaceRepository | undefined;

export function getWorkspaceRepository(): WorkspaceRepository {
  repository ??= isTauri()
    ? new SqliteWorkspaceRepository()
    : new BrowserWorkspaceRepository();
  return repository;
}
