import { describe, expect, it } from "vitest";
import type { WatcherProvider } from "./contracts";
import { WatcherProviderRegistry } from "./providerRegistry";

describe("WatcherProviderRegistry", () => {
  it("collects a registered provider and preserves its observation domains", async () => {
    const registry = new WatcherProviderRegistry();
    const provider: WatcherProvider<{ value: number }> = {
      id: "test-provider",
      name: "Test Provider",
      domains: ["host", "cpu"],
      collect: async () => ({ value: 42 }),
    };

    registry.register(provider);
    const result = await registry.collect<{ value: number }>(provider.id);

    expect(result.error).toBeUndefined();
    expect(result.providerId).toBe(provider.id);
    expect(result.domains).toEqual(["host", "cpu"]);
    expect(result.snapshot).toEqual({ value: 42 });
  });

  it("returns an attributable failure instead of throwing when a provider fails", async () => {
    const registry = new WatcherProviderRegistry();
    registry.register({
      id: "failed-provider",
      name: "Failed Provider",
      domains: ["network"],
      collect: async () => {
        throw new Error("probe failed");
      },
    });

    const result = await registry.collect("failed-provider");

    expect(result.snapshot).toBeUndefined();
    expect(result.error).toBe("probe failed");
    expect(result.domains).toEqual(["network"]);
  });

  it("reports an unregistered provider without inventing telemetry", async () => {
    const registry = new WatcherProviderRegistry();
    const result = await registry.collect("missing-provider");

    expect(result.snapshot).toBeUndefined();
    expect(result.domains).toEqual([]);
    expect(result.error).toContain("not registered");
  });

  it("normalizes a successful provider sample into attributable observations", async () => {
    const registry = new WatcherProviderRegistry();
    registry.register({
      id: "cpu-provider",
      name: "CPU Provider",
      domains: ["cpu"],
      collect: async () => ({ usagePercent: 33 }),
    });

    const observations = await registry.observe<{ usagePercent: number }>("cpu-provider");

    expect(observations).toHaveLength(1);
    expect(observations[0]?.providerId).toBe("cpu-provider");
    expect(observations[0]?.domain).toBe("cpu");
    expect(observations[0]?.availability).toBe("available");
    expect(observations[0]?.value).toEqual({ usagePercent: 33 });
  });

  it("marks failed provider domains unavailable instead of manufacturing values", async () => {
    const registry = new WatcherProviderRegistry();
    registry.register({
      id: "network-provider",
      name: "Network Provider",
      domains: ["network"],
      collect: async () => {
        throw new Error("network probe unavailable");
      },
    });

    const observations = await registry.observe("network-provider");

    expect(observations).toHaveLength(1);
    expect(observations[0]?.availability).toBe("unavailable");
    expect(observations[0]?.value).toBeUndefined();
    expect(observations[0]?.detail).toBe("network probe unavailable");
  });
});
