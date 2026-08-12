import { invoke } from "@tauri-apps/api/core";
import type { ApprovalRecord } from "./approvalStore";
import type { ServiceDescriptor } from "./serviceRegistry";
import type {
  Checkpoint,
  FoundryEvent,
  PermissionRule,
  RegisteredWorker,
  ResourceState,
  SystemHealth,
} from "./types";

export interface MeshSnapshot {
  schemaVersion: 1;
  savedAt: string;
  workers: RegisteredWorker[];
  resources: ResourceState[];
  permissions: PermissionRule[];
  checkpoints: Checkpoint[];
  approvals: ApprovalRecord[];
  services: ServiceDescriptor[];
  health: SystemHealth;
}

export interface MeshPersistence {
  loadSnapshot(): Promise<MeshSnapshot | null>;
  saveSnapshot(snapshot: MeshSnapshot): Promise<void>;
  appendEvent(event: FoundryEvent): Promise<void>;
  readRecentEvents(limit?: number): Promise<FoundryEvent[]>;
}

export class TauriMeshPersistence implements MeshPersistence {
  async loadSnapshot(): Promise<MeshSnapshot | null> {
    const content = await invoke<string | null>("mesh_load_snapshot");
    if (!content) return null;
    return normalizeSnapshot(JSON.parse(content) as Partial<MeshSnapshot>);
  }

  async saveSnapshot(snapshot: MeshSnapshot): Promise<void> {
    await invoke("mesh_save_snapshot", {
      content: JSON.stringify(snapshot, null, 2),
    });
  }

  async appendEvent(event: FoundryEvent): Promise<void> {
    await invoke("mesh_append_event", {
      content: JSON.stringify(event),
    });
  }

  async readRecentEvents(limit = 250): Promise<FoundryEvent[]> {
    const lines = await invoke<string[]>("mesh_read_events", { limit });
    const events: FoundryEvent[] = [];

    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as FoundryEvent);
      } catch {
        // Preserve journal readability if a single historical record is damaged.
      }
    }

    return events;
  }
}

export class InMemoryMeshPersistence implements MeshPersistence {
  private snapshot: MeshSnapshot | null = null;
  private readonly events: FoundryEvent[] = [];

  async loadSnapshot(): Promise<MeshSnapshot | null> {
    return this.snapshot ? structuredClone(this.snapshot) : null;
  }

  async saveSnapshot(snapshot: MeshSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }

  async appendEvent(event: FoundryEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async readRecentEvents(limit = 250): Promise<FoundryEvent[]> {
    return structuredClone(this.events.slice(-Math.max(0, limit)));
  }
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

export function createDefaultMeshPersistence(): MeshPersistence {
  return isTauriRuntime() ? new TauriMeshPersistence() : new InMemoryMeshPersistence();
}

function normalizeSnapshot(snapshot: Partial<MeshSnapshot>): MeshSnapshot {
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Unsupported mesh snapshot schema version: ${String(snapshot.schemaVersion)}`);
  }

  return {
    schemaVersion: 1,
    savedAt: snapshot.savedAt ?? new Date(0).toISOString(),
    workers: snapshot.workers ?? [],
    resources: snapshot.resources ?? [],
    permissions: snapshot.permissions ?? [],
    checkpoints: snapshot.checkpoints ?? [],
    approvals: snapshot.approvals ?? [],
    services: snapshot.services ?? [],
    health:
      snapshot.health ?? {
        state: "nominal",
        summary: "Recovered mesh snapshot without recorded health state.",
        updatedAt: new Date(0).toISOString(),
        degradedWorkers: [],
        criticalWorkers: [],
      },
  };
}
