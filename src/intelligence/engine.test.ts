import { describe, expect, it } from "vitest";
import { FoundryContextAssembler } from "./contextAssembler";
import { FoundryIntelligenceEngine } from "./engine";
import { FoundryExperienceMemory } from "./experienceMemory";
import { FoundryModelRouter, type FoundryModelProvider } from "./modelProvider";
import { FoundryPlanValidator } from "./planValidator";
import { FoundryIntelligenceRequestAssembler } from "./requestAssembler";
import { FoundrySkillCatalog } from "./skillCatalog";
import type { FoundryWorldModelSnapshot } from "./worldModel";
import { InMemoryMeshPersistence } from "../mesh/persistence";
import type { FoundryToolDefinition } from "../mesh/toolGateway";

const world: FoundryWorldModelSnapshot = {
  schemaVersion: 1,
  builtAt: "2026-09-10T17:00:00.000Z",
  safeMode: false,
  health: { state: "nominal", summary: "Nominal", updatedAt: "2026-09-10T17:00:00.000Z", degradedWorkers: [], criticalWorkers: [] },
  activeContext: {},
  entities: [{
    id: "workstation:primary",
    kind: "workstation",
    label: "Foundry Workstation",
    status: "nominal",
    attributes: {},
    relations: [],
    provenance: { source: "world-model", authority: "derived", freshness: "fresh" },
  }],
};

const restartTool: FoundryToolDefinition = {
  name: "system.service.restart",
  capabilityId: "system.service.restart",
  description: "Restart managed service",
  risk: "high",
  operational: {
    owner: "foundry-core",
    reversibility: "conditionally-reversible",
    verification: ["service health probe passes"],
  },
};

function engineWith(outputSkillId: string) {
  const skills = new FoundrySkillCatalog(() => [restartTool]);
  const persistence = new InMemoryMeshPersistence();
  const requests = new FoundryIntelligenceRequestAssembler(
    new FoundryContextAssembler(() => world),
    new FoundryExperienceMemory(persistence),
    skills,
  );
  const models = new FoundryModelRouter();
  const provider: FoundryModelProvider = {
    descriptor: () => ({
      id: "test-local",
      name: "Test Local Model",
      locality: "local",
      enabled: true,
      supportsStructuredOutput: true,
      taskClasses: ["planning"],
    }),
    probe: async () => ({ available: true }),
    generate: async () => ({
      schemaVersion: 1,
      response: "I can propose a governed service restart.",
      intent: "restart-service",
      confidence: 0.9,
      evidenceEntityIds: ["workstation:primary"],
      evidenceExperienceIds: [],
      assumptions: [],
      plan: {
        schemaVersion: 1,
        goal: "Restart service",
        steps: [{
          id: "step-1",
          skillId: outputSkillId,
          arguments: { serviceId: "forgekeeper-service" },
          rationale: "Restore service health.",
          expectedOutcome: "Service passes its health probe.",
        }],
      },
    }),
  };
  models.register(provider);
  return new FoundryIntelligenceEngine(requests, models, new FoundryPlanValidator(skills));
}

describe("FoundryIntelligenceEngine", () => {
  it("returns a validated proposal while never executing it", async () => {
    const engine = engineWith("system.service.restart");
    const proposal = await engine.propose({ text: "Restart Forgekeeper", taskClass: "planning", privacyMode: "local-only" });

    expect(proposal.proposalValid).toBe(true);
    expect(proposal.planValidation?.valid).toBe(true);
    expect(proposal.executionPerformed).toBe(false);
    expect(proposal.provider.locality).toBe("local");
  });

  it("blocks a model-invented execution skill", async () => {
    const engine = engineWith("windows.delete_system32");
    const proposal = await engine.propose({ text: "Fix the workstation", taskClass: "planning", privacyMode: "local-only" });

    expect(proposal.proposalValid).toBe(false);
    expect(proposal.planValidation?.issues.some((issue) => issue.code === "plan.skill.unknown")).toBe(true);
    expect(proposal.executionPerformed).toBe(false);
  });
});
