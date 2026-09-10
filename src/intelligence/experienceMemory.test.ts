import { describe, expect, it } from "vitest";
import { MeshEvents } from "../mesh/events";
import { createFoundryEvent } from "../mesh/eventBus";
import { InMemoryMeshPersistence } from "../mesh/persistence";
import { FoundryExperienceMemory } from "./experienceMemory";

async function seededMemory() {
  const persistence = new InMemoryMeshPersistence();
  await persistence.appendEvent(createFoundryEvent({
    id: "event-1",
    type: MeshEvents.serviceStateChanged,
    sourceWorkerId: "foundry-core",
    subjectId: "forgekeeper-service",
    occurredAt: "2026-09-10T17:00:00.000Z",
    payload: {
      previous: { name: "Forgekeeper", runtimeState: "online" },
      current: { name: "Forgekeeper", runtimeState: "failed" },
    },
  }));
  await persistence.appendEvent(createFoundryEvent({
    id: "event-2",
    type: MeshEvents.watcherFindingPublished,
    sourceWorkerId: "watcher",
    subjectId: "C:",
    occurredAt: "2026-09-10T17:01:00.000Z",
    payload: {
      kind: "resolved",
      finding: { summary: "C: storage utilization returned below pressure threshold." },
    },
  }));
  await persistence.appendEvent(createFoundryEvent({
    id: "event-3",
    type: MeshEvents.actionCompleted,
    sourceWorkerId: "foundry-core",
    subjectId: "forgekeeper-service",
    occurredAt: "2026-09-10T17:02:00.000Z",
    correlationId: "repair-1",
    payload: { request: { operationId: "system.service.restart" } },
  }));
  return new FoundryExperienceMemory(persistence);
}

describe("FoundryExperienceMemory", () => {
  it("projects durable events into bounded human/model-readable experience records", async () => {
    const memory = await seededMemory();
    const recent = await memory.recent(3);

    expect(recent.map((record) => record.id)).toEqual(["event-3", "event-2", "event-1"]);
    expect(recent[0]).toMatchObject({ category: "action", outcome: "success" });
    expect(recent[1]).toMatchObject({ category: "incident", outcome: "resolved" });
    expect(recent[2]?.summary).toContain("Forgekeeper changed from online to failed");
  });

  it("searches projected experience without exposing raw event payloads", async () => {
    const memory = await seededMemory();
    const results = await memory.search({ query: "Forgekeeper restart", limit: 10 });

    expect(results.some((record) => record.summary.includes("system.service.restart"))).toBe(true);
    expect(results.every((record) => !("payload" in record))).toBe(true);
  });
});
