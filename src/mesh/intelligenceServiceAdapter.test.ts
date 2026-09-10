import { describe, expect, it } from "vitest";
import { FoundryIntelligenceNativeAdapter } from "./localServiceAdapters";
import { InMemoryMeshPersistence } from "./persistence";
import { FoundryMeshRuntime } from "./runtime";
import type { FoundryModelProvider } from "../intelligence/modelProvider";

function localProvider(available = true): FoundryModelProvider {
  return {
    descriptor: () => ({
      id: "test-local",
      name: "Test Local Provider",
      locality: "local",
      enabled: true,
      supportsStructuredOutput: true,
      taskClasses: ["conversation", "planning", "diagnosis", "summarization"],
    }),
    probe: async () => ({ available }),
    generate: async () => ({
      schemaVersion: 1,
      response: "ready",
      intent: "status",
      confidence: 1,
      evidenceEntityIds: [],
      evidenceExperienceIds: [],
      assumptions: [],
    }),
  };
}

describe("FoundryIntelligenceNativeAdapter", () => {
  it("stays unready when no structured model provider is registered", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    const adapter = new FoundryIntelligenceNativeAdapter(runtime);

    expect(adapter.validate()).toContain("Foundry Intelligence has no enabled structured-output model provider registered.");
    await expect(adapter.probe()).resolves.toMatchObject({ online: false });
  });

  it("becomes probe-ready only when an eligible provider is actually available", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    runtime.modelRouter.register(localProvider(true));
    const adapter = new FoundryIntelligenceNativeAdapter(runtime);

    expect(adapter.validate()).toEqual([]);
    await expect(adapter.probe()).resolves.toMatchObject({ online: true });
  });

  it("does not report online when a registered provider fails its runtime probe", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    runtime.modelRouter.register(localProvider(false));
    const adapter = new FoundryIntelligenceNativeAdapter(runtime);

    expect(adapter.validate()).toEqual([]);
    await expect(adapter.probe()).resolves.toMatchObject({ online: false });
  });
});
