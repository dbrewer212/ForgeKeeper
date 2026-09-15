import type {
  WatcherObservation,
  WatcherProvider,
  WatcherProviderResult,
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

  async observe<TSnapshot = unknown>(providerId: string): Promise<WatcherObservation<TSnapshot>[]> {
    const result = await this.collect<TSnapshot>(providerId);
    return result.domains.map((domain) => ({
      id: `${result.providerId}:${domain}:${result.collectedAt}`,
      providerId: result.providerId,
      observedAt: result.collectedAt,
      domain,
      availability: result.snapshot === undefined ? "unavailable" : "available",
      value: result.snapshot,
      detail: result.error,
    }));
  }

  async collectAll(): Promise<WatcherProviderResult[]> {
    return Promise.all(this.list().map((provider) => this.collect(provider.id)));
  }

  async observeAll(): Promise<WatcherObservation[]> {
    const batches = await Promise.all(this.list().map((provider) => this.observe(provider.id)));
    return batches.flat();
  }
}
