import type { WorldEntityKind } from "../intelligence/worldModel";
import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

const worldEntityKinds: WorldEntityKind[] = [
  "workstation",
  "service",
  "worker",
  "resource",
  "project",
  "production-item",
  "asset",
  "inventory",
  "canon",
  "decision",
  "session",
  "watcher-observation",
  "watcher-finding",
];

export function registerWorldModelTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ kind?: WorldEntityKind }, unknown>(
    {
      name: "world.get_snapshot",
      capabilityId: MeshCapabilities.worldModelRead,
      description: "Read the derived Foundry World Model. Source authorities remain the Mesh, Foundry Domain, and Watcher; the World Model does not own duplicate state.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: worldEntityKinds },
        },
        additionalProperties: false,
      },
    },
    ({ kind }) => {
      const snapshot = runtime.worldModel.snapshot();
      return kind
        ? { ...snapshot, entities: snapshot.entities.filter((entity) => entity.kind === kind) }
        : snapshot;
    },
  );

  runtime.tools.register<{ id: string }, unknown>(
    {
      name: "world.get_entity",
      capabilityId: MeshCapabilities.worldModelRead,
      description: "Read one entity from the current derived Foundry World Model by stable world-model entity id.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    ({ id }) => runtime.worldModel.getEntity(id.trim()),
  );

  runtime.tools.register<Record<string, never>, unknown>(
    {
      name: "world.get_active_context",
      capabilityId: MeshCapabilities.worldModelRead,
      description: "Read the current active Foundry project/session/production context without requesting the full World Model.",
      risk: "read",
      audit: false,
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => {
      const snapshot = runtime.worldModel.snapshot();
      return {
        builtAt: snapshot.builtAt,
        safeMode: snapshot.safeMode,
        health: snapshot.health,
        activeContext: snapshot.activeContext,
        activeWatcherFindings: snapshot.entities.filter((entity) => entity.kind === "watcher-finding"),
      };
    },
  );
}
