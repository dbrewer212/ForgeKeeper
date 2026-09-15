import { describe, expect, it, vi } from "vitest";
import type { WatcherHostSampleSource } from "./hostSampler";
import type { WatcherSystemSnapshot } from "./contracts";
import { createDefaultWatcherProviderRegistry } from "./nativeProviders";

const snapshot: WatcherSystemSnapshot = {
  sampledAt: "2026-09-10T16:00:00.000Z",
  cpuUsagePercent: 27.5,
  totalMemoryBytes: 64,
  availableMemoryBytes: 24,
  usedMemoryBytes: 40,
  processCount: 211,
  disks: [{ name: "C:", totalBytes: 1000, freeBytes: 250 }],
  gpu: { name: "Test GPU", adapterRamBytes: 16, provider: "windows-cim" },
};

describe("native Watcher providers", () => {
  it("projects one host sample into bounded logical provider snapshots", async () => {
    const source: WatcherHostSampleSource = { sample: vi.fn(async () => snapshot) };
    const registry = createDefaultWatcherProviderRegistry(source);

    const cpu = await registry.collect<{ sampledAt: string; usagePercent?: number }>("windows-cpu");
    const memory = await registry.collect<{ usedBytes?: number }>("windows-memory");
    const storage = await registry.collect<{ disks: Array<{ name: string }> }>("windows-storage");
    const process = await registry.collect<{ processCount?: number }>("windows-process");
    const gpu = await registry.collect<{ gpu?: { name?: string } }>("windows-gpu");

    expect(cpu.snapshot?.usagePercent).toBe(27.5);
    expect(memory.snapshot?.usedBytes).toBe(40);
    expect(storage.snapshot?.disks[0]?.name).toBe("C:");
    expect(process.snapshot?.processCount).toBe(211);
    expect(gpu.snapshot?.gpu?.name).toBe("Test GPU");
  });

  it("registers the compatibility host provider alongside logical providers", () => {
    const source: WatcherHostSampleSource = { sample: vi.fn(async () => snapshot) };
    const ids = createDefaultWatcherProviderRegistry(source).list().map((provider) => provider.id);

    expect(ids).toEqual([
      "windows-host",
      "windows-cpu",
      "windows-memory",
      "windows-storage",
      "windows-process",
      "windows-gpu",
    ]);
  });
});
