import { invoke } from "@tauri-apps/api/core";
import type {
  WatcherProvider,
  WatcherProviderResult,
  WatcherSystemSnapshot,
} from "./contracts";

export class WatcherProviderRegistry {
  private readonly providers = new Map<string, WatcherProvider>();

  register(provider: WatcherProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): WatcherProvider | undefined {
    return this.providers.get(providerId);
  }

  list(): WatcherProvider[] {
    return [...this.providers.values()];
  }

  async collect<TSnapshot = unknown>(providerId: string): Promise<WatcherProviderResult<TSnapshot>> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return {
        providerId,
        collectedAt: new Date().toISOString(),
        domains: [],
        error: `Watcher provider ${providerId} is not registered.`,
      };
    }

    try {
      const snapshot = await provider.collect();
      return {
        providerId: provider.id,
        collectedAt: new Date().toISOString(),
        domains: [...provider.domains],
        snapshot: snapshot as TSnapshot,
      };
    } catch (error) {
      return {
        providerId: provider.id,
        collectedAt: new Date().toISOString(),
        domains: [...provider.domains],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async collectAll(): Promise<WatcherProviderResult[]> {
    return Promise.all(this.list().map((provider) => this.collect(provider.id)));
  }
}

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
