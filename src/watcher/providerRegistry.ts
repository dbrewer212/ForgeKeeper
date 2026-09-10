import type { WatcherProvider, WatcherProviderResult } from "./contracts";

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
