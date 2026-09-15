import { describe, expect, it } from "vitest";
import { FoundryModelRouter, type FoundryModelProvider } from "./modelProvider";

function provider(id: string, locality: "local" | "cloud", available = true): FoundryModelProvider {
  return {
    descriptor: () => ({
      id,
      name: id,
      locality,
      enabled: true,
      supportsStructuredOutput: true,
      taskClasses: ["conversation", "planning", "diagnosis"],
    }),
    probe: async () => ({ available }),
    generate: async () => ({
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

describe("FoundryModelRouter", () => {
  it("prefers an available local provider in local-preferred mode", async () => {
    const router = new FoundryModelRouter();
    router.register(provider("cloud", "cloud"));
    router.register(provider("local", "local"));

    const selected = await router.select({ taskClass: "planning", privacyMode: "local-preferred" });
    expect(selected.descriptor().id).toBe("local");
  });

  it("never selects cloud under local-only policy", async () => {
    const router = new FoundryModelRouter();
    router.register(provider("cloud", "cloud"));

    await expect(router.select({ taskClass: "diagnosis", privacyMode: "local-only" }))
      .rejects.toThrow("No commissioned model provider");
  });

  it("falls back to another eligible provider when the preferred local provider is unavailable", async () => {
    const router = new FoundryModelRouter();
    router.register(provider("local", "local", false));
    router.register(provider("cloud", "cloud", true));

    const selected = await router.select({ taskClass: "conversation", privacyMode: "cloud-allowed", preferredProviderId: "local" });
    expect(selected.descriptor().id).toBe("cloud");
  });
});
