import { describe, expect, it } from "vitest";
import { FoundryModelCommissioning, type ModelCommissioningStore, type OllamaCommissioningTransport } from "./modelCommissioning";
import { FoundryModelRouter } from "./modelProvider";
import type { ServiceDescriptor } from "../mesh/serviceRegistry";

function ollamaService(metadata: Record<string, unknown> = {}): ServiceDescriptor {
  return {
    id: "ollama-service",
    name: "Ollama Local Inference",
    kind: "inference",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    dependencies: [],
    metadata,
  };
}

function store(initial: ServiceDescriptor) {
  let service = structuredClone(initial);
  let persistCount = 0;
  const value: ModelCommissioningStore & { current(): ServiceDescriptor; persistCount(): number } = {
    getService: () => structuredClone(service),
    updateService: (_id, patch) => {
      service = { ...service, ...structuredClone(patch), id: service.id };
      return structuredClone(service);
    },
    persist: async () => { persistCount += 1; },
    current: () => structuredClone(service),
    persistCount: () => persistCount,
  };
  return value;
}

function transport(models = [{ name: "model-a:8b", model: "model-a:8b" }]): OllamaCommissioningTransport {
  return {
    probe: async () => ({ available: true }),
    listModels: async () => structuredClone(models),
    generateStructured: async () => ({
      schemaVersion: 1,
      response: "ok",
      intent: "test",
      confidence: 1,
      evidenceEntityIds: [],
      evidenceExperienceIds: [],
      assumptions: [],
    }),
  };
}

describe("FoundryModelCommissioning", () => {
  it("selects only a model present in the discovered local Ollama inventory", async () => {
    const router = new FoundryModelRouter();
    const state = store(ollamaService());
    const commissioning = new FoundryModelCommissioning(router, transport(), state);

    await expect(commissioning.selectLocalModel("missing-model")).rejects.toThrow("not present");
    expect(router.list()).toEqual([]);

    const status = await commissioning.selectLocalModel("model-a:8b");
    expect(status).toMatchObject({ selectedModel: "model-a:8b", registered: true });
    expect(state.current().metadata?.selectedModel).toBe("model-a:8b");
    expect(state.persistCount()).toBe(1);
  });

  it("restores a persisted selected model into the runtime router without probing or generating", () => {
    const router = new FoundryModelRouter();
    const state = store(ollamaService({ selectedModel: "model-a:8b" }));
    const commissioning = new FoundryModelCommissioning(router, transport(), state);

    commissioning.restoreConfiguredProvider();

    expect(router.list()).toHaveLength(1);
    expect(router.list()[0]).toMatchObject({ id: "ollama-local", model: "model-a:8b", locality: "local" });
  });

  it("clears the selected provider and persisted model without altering service commissioning state", async () => {
    const router = new FoundryModelRouter();
    const state = store(ollamaService({ selectedModel: "model-a:8b" }));
    const commissioning = new FoundryModelCommissioning(router, transport(), state);
    commissioning.restoreConfiguredProvider();

    const status = await commissioning.clearLocalModel();

    expect(status.registered).toBe(false);
    expect(status.selectedModel).toBeUndefined();
    expect(state.current().commissioningState).toBe("dormant");
    expect(state.current().metadata?.selectedModel).toBeNull();
  });
});
