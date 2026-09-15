import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "../mesh/eventBus";
import { MeshEvents } from "../mesh/events";
import { WatcherProviderRegistry } from "./providerRegistry";
import { WatcherRuntime } from "./runtime";

describe("WatcherRuntime", () => {
  it("polls configured providers into the current observation store", async () => {
    const providers = new WatcherProviderRegistry();
    providers.register({
      id: "cpu",
      name: "CPU",
      domains: ["cpu"],
      collect: async () => ({ usagePercent: 22 }),
    });
    const runtime = new WatcherRuntime(new InMemoryEventBus(), providers, {
      providerIds: ["cpu"],
      pollIntervalMs: 60_000,
    });

    await runtime.pollNow();

    expect(runtime.getCurrent("cpu")).toHaveLength(1);
    expect(runtime.getCurrent("cpu")[0]?.value).toEqual({ usagePercent: 22 });
    expect(runtime.updatedAt()).toBeTruthy();
  });

  it("publishes a durable-worthy transition when a provider becomes unavailable and later recovers", async () => {
    let fail = true;
    const providers = new WatcherProviderRegistry();
    providers.register({
      id: "network",
      name: "Network",
      domains: ["network"],
      collect: vi.fn(async () => {
        if (fail) throw new Error("adapter unavailable");
        return { connected: true };
      }),
    });

    const events = new InMemoryEventBus();
    const seen: string[] = [];
    events.subscribeAll((event) => { seen.push(event.type); });
    const runtime = new WatcherRuntime(events, providers, {
      providerIds: ["network"],
      pollIntervalMs: 60_000,
    });

    await runtime.pollNow();
    fail = false;
    await runtime.pollNow();

    expect(seen).toEqual([
      MeshEvents.watcherProviderUnavailable,
      MeshEvents.watcherProviderRecovered,
    ]);
    expect(runtime.getCurrent("network")[0]?.availability).toBe("available");
  });

  it("coalesces overlapping manual polls", async () => {
    let resolve!: (value: { ok: boolean }) => void;
    const collect = vi.fn(() => new Promise<{ ok: boolean }>((done) => { resolve = done; }));
    const providers = new WatcherProviderRegistry();
    providers.register({ id: "host", name: "Host", domains: ["host"], collect });
    const runtime = new WatcherRuntime(new InMemoryEventBus(), providers, {
      providerIds: ["host"],
      pollIntervalMs: 60_000,
    });

    const first = runtime.pollNow();
    const second = runtime.pollNow();
    resolve({ ok: true });

    await first;
    await second;
    expect(collect).toHaveBeenCalledTimes(1);
  });
});
