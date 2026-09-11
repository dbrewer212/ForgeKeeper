import { describe, expect, it, vi } from "vitest";
import type { WatcherSystemSnapshot } from "./contracts";
import { WatcherHostSampler } from "./hostSampler";

const snapshot: WatcherSystemSnapshot = {
  sampledAt: "2026-09-10T16:00:00.000Z",
  cpuUsagePercent: 18,
  totalMemoryBytes: 32,
  availableMemoryBytes: 12,
  usedMemoryBytes: 20,
  processCount: 150,
  disks: [],
};

describe("WatcherHostSampler", () => {
  it("reuses a recent sample inside the configured TTL", async () => {
    let now = 1000;
    const collect = vi.fn(async () => snapshot);
    const sampler = new WatcherHostSampler({ ttlMs: 1000, now: () => now, collect });

    expect(await sampler.sample()).toBe(snapshot);
    now = 1500;
    expect(await sampler.sample()).toBe(snapshot);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent requests onto one native collection", async () => {
    let resolve!: (value: WatcherSystemSnapshot) => void;
    const collect = vi.fn(() => new Promise<WatcherSystemSnapshot>((done) => { resolve = done; }));
    const sampler = new WatcherHostSampler({ collect });

    const first = sampler.sample();
    const second = sampler.sample();
    resolve(snapshot);

    await expect(first).resolves.toBe(snapshot);
    await expect(second).resolves.toBe(snapshot);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it("refreshes after invalidation", async () => {
    const collect = vi.fn(async () => snapshot);
    const sampler = new WatcherHostSampler({ collect });

    await sampler.sample();
    sampler.invalidate();
    await sampler.sample();

    expect(collect).toHaveBeenCalledTimes(2);
  });
});
