import { describe, expect, it } from "vitest";
import { FoundryContextAssembler } from "./contextAssembler";
import type { FoundryWorldModelSnapshot, WorldEntity } from "./worldModel";

function entity(id: string, kind: WorldEntity["kind"], label: string, status?: string, relations: WorldEntity["relations"] = []): WorldEntity {
  return {
    id,
    kind,
    label,
    status,
    attributes: {},
    relations,
    provenance: { source: "world-model", authority: "derived", freshness: "fresh" },
  };
}

function snapshot(): FoundryWorldModelSnapshot {
  return {
    schemaVersion: 1,
    builtAt: "2026-09-10T17:00:00.000Z",
    safeMode: false,
    health: {
      state: "nominal",
      summary: "Nominal",
      updatedAt: "2026-09-10T17:00:00.000Z",
      degradedWorkers: [],
      criticalWorkers: [],
    },
    activeContext: {
      projectId: "motorcycle-goblin",
      productionItemId: "model",
      sessionId: "session-1",
      nextAction: "Inspect latest geometry",
    },
    entities: [
      entity("workstation:primary", "workstation", "Foundry Workstation", "nominal"),
      entity("project:motorcycle-goblin", "project", "Motorcycle Goblin", "active", [
        { type: "has-production-item", targetId: "production-item:model" },
      ]),
      entity("production-item:model", "production-item", "Model", "refinement"),
      entity("session:session-1", "session", "Foundry Session session-1", "active"),
      entity("service:watcher-service", "service", "Watcher Monitoring", "online"),
      entity("watcher-finding:disk", "watcher-finding", "C: storage utilization is high", "warning"),
      entity("project:other", "project", "Unrelated Archive", "paused"),
    ],
  };
}

describe("FoundryContextAssembler", () => {
  it("always includes active work, workstation state, and active Watcher findings", () => {
    const assembler = new FoundryContextAssembler(snapshot);
    const packet = assembler.assemble({ text: "Get me back into the motorcycle goblin" });
    const ids = packet.entities.map((item) => item.id);

    expect(ids).toContain("workstation:primary");
    expect(ids).toContain("project:motorcycle-goblin");
    expect(ids).toContain("production-item:model");
    expect(ids).toContain("session:session-1");
    expect(ids).toContain("watcher-finding:disk");
    expect(packet.guardrails.directOsControl).toBe(false);
    expect(packet.guardrails.executionAuthority).toBe("mesh-tool-gateway");
  });

  it("adds request-relevant entities while respecting the context bound", () => {
    const assembler = new FoundryContextAssembler(snapshot);
    const packet = assembler.assemble({ text: "What is Watcher doing?", maxEntities: 5 });

    expect(packet.entities.some((item) => item.id === "service:watcher-service")).toBe(true);
    expect(packet.entities.length).toBeLessThanOrEqual(5);
    expect(packet.omittedEntityCount).toBeGreaterThanOrEqual(0);
  });
});
