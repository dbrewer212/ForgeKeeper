import { describe, expect, it } from "vitest";
import { InMemoryMeshPersistence } from "./persistence";
import { FoundryMeshRuntime } from "./runtime";

describe("Foundry service default reconciliation", () => {
  it("adopts evolved static defaults while preserving persisted commissioning and user metadata", async () => {
    const persistence = new InMemoryMeshPersistence();
    const first = new FoundryMeshRuntime(persistence);
    await first.initialize();

    const ollama = first.services.get("ollama-service");
    if (!ollama) throw new Error("ollama-service missing");
    first.services.update("ollama-service", {
      description: "stale description",
      commissioningState: "commissioning",
      runtimeState: "degraded",
      enabled: true,
      metadata: { ...ollama.metadata, selectedModel: "local-model", userNote: "preserve-me" },
    });
    await first.save();

    const second = new FoundryMeshRuntime(persistence);
    await second.initialize();
    const restored = second.services.get("ollama-service");

    expect(restored).toMatchObject({
      description: "Local Ollama inference provider reached only through the Foundry fixed-loopback native transport.",
      commissioningState: "commissioning",
      runtimeState: "degraded",
      enabled: true,
    });
    expect(restored?.metadata).toMatchObject({
      provider: "ollama",
      structuredOutput: true,
      selectedModel: "local-model",
      userNote: "preserve-me",
    });
  });
});
