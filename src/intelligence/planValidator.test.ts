import { describe, expect, it } from "vitest";
import type { FoundryToolDefinition } from "../mesh/toolGateway";
import { FoundryPlanValidator, type FoundryPlan } from "./planValidator";
import { FoundrySkillCatalog } from "./skillCatalog";

function catalog(tools: FoundryToolDefinition[]) {
  return new FoundrySkillCatalog(() => tools);
}

const safeRead: FoundryToolDefinition = {
  name: "world.get_active_context",
  capabilityId: "world-model.read",
  description: "Read active context",
  risk: "read",
  operational: { owner: "foundry-core", reversibility: "reversible" },
};

const governedRestart: FoundryToolDefinition = {
  name: "system.service.restart",
  capabilityId: "system.service.restart",
  description: "Restart a managed service",
  risk: "high",
  operational: {
    owner: "foundry-core",
    reversibility: "conditionally-reversible",
    preconditions: ["service is commissioned"],
    sideEffects: ["temporary service interruption"],
    verification: ["service health probe passes"],
  },
};

function plan(skillId: string): FoundryPlan {
  return {
    schemaVersion: 1,
    goal: "Restore the requested service",
    steps: [
      {
        id: "step-1",
        skillId,
        arguments: { serviceId: "forgekeeper" },
        rationale: "The service is unhealthy and restart is the selected governed recovery action.",
        expectedOutcome: "The service returns online and passes its health probe.",
      },
    ],
  };
}

describe("FoundryPlanValidator", () => {
  it("accepts plans composed only of registered governed skills with required safety metadata", () => {
    const validator = new FoundryPlanValidator(catalog([safeRead, governedRestart]));
    const result = validator.validate(plan("system.service.restart"));

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.resolvedSkills[0]?.skill.owner).toBe("foundry-core");
  });

  it("rejects model-invented skills", () => {
    const validator = new FoundryPlanValidator(catalog([safeRead]));
    const result = validator.validate(plan("windows.delete_system32"));

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "plan.skill.unknown")).toBe(true);
  });

  it("rejects risk-bearing skills that have no verification contract", () => {
    const validator = new FoundryPlanValidator(catalog([{
      ...governedRestart,
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
      },
    }]));
    const result = validator.validate(plan("system.service.restart"));

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "plan.skill.verification-missing")).toBe(true);
  });
});
