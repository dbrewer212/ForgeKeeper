import { describe, expect, it } from "vitest";
import { OllamaFoundryProvider, type OllamaStructuredRequest, type OllamaStructuredTransport } from "./ollamaProvider";
import type { FoundryModelRequest } from "./modelProvider";

function request(): FoundryModelRequest {
  return {
    taskClass: "planning",
    instructions: "Use only governed skills.",
    envelope: {
      schemaVersion: 1,
      requestId: "request-1",
      assembledAt: "2026-09-10T17:00:00.000Z",
      text: "What is Watcher doing?",
      context: {
        schemaVersion: 1,
        assembledAt: "2026-09-10T17:00:00.000Z",
        request: "What is Watcher doing?",
        worldModelBuiltAt: "2026-09-10T17:00:00.000Z",
        safeMode: false,
        health: { state: "nominal", summary: "Nominal", updatedAt: "2026-09-10T17:00:00.000Z", degradedWorkers: [], criticalWorkers: [] },
        activeContext: {},
        entities: [],
        omittedEntityCount: 0,
        guardrails: { executionAuthority: "mesh-tool-gateway", directOsControl: false, worldModelAuthority: "derived-read-model" },
      },
      experience: [],
      candidateSkills: [],
      constraints: {
        modelMayExecuteDirectly: false,
        executionAuthority: "mesh-tool-gateway",
        worldModelAuthority: "derived-read-model",
        experienceAuthority: "derived-event-projection",
        unknownSkillPolicy: "reject",
        finalPermissionEvaluation: "required-at-execution",
      },
    },
  };
}

describe("OllamaFoundryProvider", () => {
  it("advertises local structured inference and sends the bounded envelope through the transport", async () => {
    let captured: OllamaStructuredRequest | undefined;
    const transport: OllamaStructuredTransport = {
      probe: async () => ({ available: true }),
      generateStructured: async (input) => {
        captured = input;
        return {
          schemaVersion: 1,
          response: "Watcher is nominal.",
          intent: "inspect-watcher",
          confidence: 0.95,
          evidenceEntityIds: [],
          evidenceExperienceIds: [],
          assumptions: [],
        };
      },
    };
    const provider = new OllamaFoundryProvider(transport, { model: "qwen3:8b" });
    const output = await provider.generate(request());

    expect(provider.descriptor()).toMatchObject({ locality: "local", supportsStructuredOutput: true, model: "qwen3:8b" });
    expect(captured?.model).toBe("qwen3:8b");
    expect(captured?.prompt).toContain("What is Watcher doing?");
    expect(captured?.system).toContain("not an execution authority");
    expect(output.response).toBe("Watcher is nominal.");
  });

  it("parses JSON string structured responses without granting execution semantics", async () => {
    const transport: OllamaStructuredTransport = {
      probe: async () => ({ available: true }),
      generateStructured: async () => JSON.stringify({
        schemaVersion: 1,
        response: "I propose inspection only.",
        intent: "inspect",
        confidence: 0.8,
        evidenceEntityIds: [],
        evidenceExperienceIds: [],
        assumptions: [],
        plan: {
          schemaVersion: 1,
          goal: "Inspect state",
          steps: [{ id: "step-1", skillId: "watcher.get_telemetry", arguments: {}, rationale: "Read state", expectedOutcome: "Telemetry returned" }],
        },
      }),
    };
    const provider = new OllamaFoundryProvider(transport, { model: "local-model" });
    const output = await provider.generate(request());

    expect(output.plan?.steps[0]?.skillId).toBe("watcher.get_telemetry");
  });

  it("fails closed on non-object structured responses", async () => {
    const transport: OllamaStructuredTransport = {
      probe: async () => ({ available: true }),
      generateStructured: async () => "not-json",
    };
    const provider = new OllamaFoundryProvider(transport, { model: "local-model" });

    await expect(provider.generate(request())).rejects.toThrow("non-object structured response");
  });
});
