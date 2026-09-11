import { describe, expect, it } from "vitest";
import { MeshEvents } from "../mesh/events";
import { createFoundryEvent } from "../mesh/eventBus";
import { InMemoryMeshPersistence } from "../mesh/persistence";
import type { FoundryToolDefinition } from "../mesh/toolGateway";
import { FoundryContextAssembler } from "./contextAssembler";
import { FoundryExperienceMemory } from "./experienceMemory";
import { FoundryIntelligenceRequestAssembler } from "./requestAssembler";
import { FoundrySkillCatalog } from "./skillCatalog";
import type { FoundryWorldModelSnapshot } from "./worldModel";

const world: FoundryWorldModelSnapshot = {
  schemaVersion: 1,
  builtAt: "2026-09-10T17:00:00.000Z",
  safeMode: false,
  health: { state: "nominal", summary: "Nominal", updatedAt: "2026-09-10T17:00:00.000Z", degradedWorkers: [], criticalWorkers: [] },
  activeContext: {},
  entities: [
    {
      id: "workstation:primary",
      kind: "workstation",
      label: "Foundry Workstation",
      status: "nominal",
      attributes: {},
      relations: [],
      provenance: { source: "world-model", authority: "derived", freshness: "fresh" },
    },
    {
      id: "service:watcher-service",
      kind: "service",
      label: "Watcher Monitoring",
      status: "online",
      attributes: {},
      relations: [],
      provenance: { source: "mesh-service-registry", authority: "authoritative", freshness: "fresh" },
    },
  ],
};

const tools: FoundryToolDefinition[] = [
  {
    name: "watcher.get_telemetry",
    capabilityId: "watcher.telemetry.read",
    description: "Read Watcher telemetry",
    risk: "read",
    operational: { owner: "watcher", reversibility: "reversible", verification: ["returns current telemetry"] },
  },
  {
    name: "system.service.restart",
    capabilityId: "system.service.restart",
    description: "Restart managed service",
    risk: "high",
    operational: { owner: "foundry-core", reversibility: "conditionally-reversible", verification: ["service probe passes"] },
  },
];

describe("FoundryIntelligenceRequestAssembler", () => {
  it("combines bounded current context, relevant experience, and governed skills without execution authority", async () => {
    const persistence = new InMemoryMeshPersistence();
    await persistence.appendEvent(createFoundryEvent({
      id: "experience-1",
      type: MeshEvents.watcherProviderRecovered,
      sourceWorkerId: "watcher",
      subjectId: "watcher-service",
      occurredAt: "2026-09-10T16:59:00.000Z",
      payload: {},
    }));

    const assembler = new FoundryIntelligenceRequestAssembler(
      new FoundryContextAssembler(() => world),
      new FoundryExperienceMemory(persistence),
      new FoundrySkillCatalog(() => tools),
    );

    const envelope = await assembler.assemble({ text: "What is Watcher doing?", maxCandidateSkills: 5 });

    expect(envelope.context.entities.some((entity) => entity.id === "service:watcher-service")).toBe(true);
    expect(envelope.experience.some((record) => record.subjectId === "watcher-service")).toBe(true);
    expect(envelope.candidateSkills[0]?.id).toBe("watcher.get_telemetry");
    expect(envelope.constraints.modelMayExecuteDirectly).toBe(false);
    expect(envelope.constraints.executionAuthority).toBe("mesh-tool-gateway");
  });
});
