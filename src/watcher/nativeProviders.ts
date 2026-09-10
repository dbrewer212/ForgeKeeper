import type {
  WatcherCpuSnapshot,
  WatcherGpuIdentitySnapshot,
  WatcherMemorySnapshot,
  WatcherProcessSnapshot,
  WatcherProvider,
  WatcherStorageSnapshot,
  WatcherSystemSnapshot,
} from "./contracts";
import { createNativeWatcherHostSampler, type WatcherHostSampleSource } from "./hostSampler";
import { WatcherProviderRegistry } from "./providerRegistry";

export const DEFAULT_WATCHER_OBSERVATION_PROVIDER_IDS = [
  "windows-cpu",
  "windows-memory",
  "windows-storage",
  "windows-process",
  "windows-gpu",
] as const;

export function createWindowsHostWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherSystemSnapshot> {
  return {
    id: "windows-host",
    name: "Windows Host Telemetry",
    domains: ["host", "cpu", "gpu", "memory", "storage", "process"],
    collect: () => source.sample(),
  };
}

export function createWindowsCpuWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherCpuSnapshot> {
  return {
    id: "windows-cpu",
    name: "Windows CPU Telemetry",
    domains: ["cpu"],
    collect: async () => {
      const sample = await source.sample();
      return { sampledAt: sample.sampledAt, usagePercent: sample.cpuUsagePercent };
    },
  };
}

export function createWindowsMemoryWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherMemorySnapshot> {
  return {
    id: "windows-memory",
    name: "Windows Memory Telemetry",
    domains: ["memory"],
    collect: async () => {
      const sample = await source.sample();
      return {
        sampledAt: sample.sampledAt,
        totalBytes: sample.totalMemoryBytes,
        availableBytes: sample.availableMemoryBytes,
        usedBytes: sample.usedMemoryBytes,
      };
    },
  };
}

export function createWindowsStorageWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherStorageSnapshot> {
  return {
    id: "windows-storage",
    name: "Windows Storage Telemetry",
    domains: ["storage"],
    collect: async () => {
      const sample = await source.sample();
      return { sampledAt: sample.sampledAt, disks: sample.disks };
    },
  };
}

export function createWindowsProcessWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherProcessSnapshot> {
  return {
    id: "windows-process",
    name: "Windows Process Summary",
    domains: ["process"],
    collect: async () => {
      const sample = await source.sample();
      return { sampledAt: sample.sampledAt, processCount: sample.processCount };
    },
  };
}

export function createWindowsGpuWatcherProvider(source: WatcherHostSampleSource): WatcherProvider<WatcherGpuIdentitySnapshot> {
  return {
    id: "windows-gpu",
    name: "Windows GPU Identity",
    domains: ["gpu"],
    collect: async () => {
      const sample = await source.sample();
      return { sampledAt: sample.sampledAt, gpu: sample.gpu };
    },
  };
}

export function createDefaultWatcherProviderRegistry(
  source: WatcherHostSampleSource = createNativeWatcherHostSampler(),
): WatcherProviderRegistry {
  const registry = new WatcherProviderRegistry();
  registry.register(createWindowsHostWatcherProvider(source));
  registry.register(createWindowsCpuWatcherProvider(source));
  registry.register(createWindowsMemoryWatcherProvider(source));
  registry.register(createWindowsStorageWatcherProvider(source));
  registry.register(createWindowsProcessWatcherProvider(source));
  registry.register(createWindowsGpuWatcherProvider(source));
  return registry;
}
