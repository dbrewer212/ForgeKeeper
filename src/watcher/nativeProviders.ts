import { invoke } from "@tauri-apps/api/core";
import type { WatcherProvider, WatcherSystemSnapshot } from "./contracts";
import { WatcherProviderRegistry } from "./providerRegistry";

export const WindowsHostWatcherProvider: WatcherProvider<WatcherSystemSnapshot> = {
  id: "windows-host",
  name: "Windows Host Telemetry",
  domains: ["host", "cpu", "gpu", "memory", "storage", "process"],
  collect: () => invoke<WatcherSystemSnapshot>("watcher_system_snapshot"),
};

export function createDefaultWatcherProviderRegistry(): WatcherProviderRegistry {
  const registry = new WatcherProviderRegistry();
  registry.register(WindowsHostWatcherProvider);
  return registry;
}
