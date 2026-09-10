import { describe, expect, it } from "vitest";
import type { FoundryToolDefinition } from "../mesh/toolGateway";
import { FoundrySkillCatalog } from "./skillCatalog";

function tool(overrides: Partial<FoundryToolDefinition> & Pick<FoundryToolDefinition, "name">): FoundryToolDefinition {
  return {
    name: overrides.name,
    capabilityId: overrides.capabilityId ?? "mesh.read-state",
    description: overrides.description ?? "Test tool",
    risk: overrides.risk ?? "read",
    enabled: overrides.enabled,
    audit: overrides.audit,
    inputSchema: overrides.inputSchema,
    outputSchema: overrides.outputSchema,
    operational: overrides.operational,
  };
}

describe("FoundrySkillCatalog", () => {
  it("projects operational metadata from governed Mesh tools", () => {
    const catalog = new FoundrySkillCatalog(() => [
      tool({
        name: "system.service.restart",
        risk: "high",
        operational: {
          owner: "foundry-core",
          reversibility: "conditionally-reversible",
          preconditions: ["service commissioned"],
          sideEffects: ["service interrupted"],
          verification: ["health probe passes"],
        },
      }),
    ]);

    expect(catalog.get("system.service.restart")).toMatchObject({
      owner: "foundry-core",
      reversibility: "conditionally-reversible",
      risk: "high",
      preconditions: ["service commissioned"],
      verification: ["health probe passes"],
    });
  });

  it("treats missing operational safety metadata conservatively", () => {
    const catalog = new FoundrySkillCatalog(() => [tool({ name: "legacy.tool" })]);
    const skill = catalog.get("legacy.tool");

    expect(skill?.owner).toBe("unassigned");
    expect(skill?.reversibility).toBe("unknown");
    expect(skill?.verification).toEqual([]);
  });
});
