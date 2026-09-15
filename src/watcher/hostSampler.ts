import { invoke } from "@tauri-apps/api/core";
import type { WatcherSystemSnapshot } from "./contracts";

export interface WatcherHostSampleSource {
  sample(force?: boolean): Promise<WatcherSystemSnapshot>;
}

export interface WatcherHostSamplerOptions {
  ttlMs?: number;
  now?: () => number;
  collect?: () => Promise<WatcherSystemSnapshot>;
}

export class WatcherHostSampler implements WatcherHostSampleSource {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly collect: () => Promise<WatcherSystemSnapshot>;
  private cached?: { capturedAt: number; snapshot: WatcherSystemSnapshot };
  private inFlight?: Promise<WatcherSystemSnapshot>;

  constructor(options: WatcherHostSamplerOptions = {}) {
    this.ttlMs = Math.max(0, options.ttlMs ?? 1000);
    this.now = options.now ?? (() => Date.now());
    this.collect = options.collect ?? (() => invoke<WatcherSystemSnapshot>("watcher_system_snapshot"));
  }

  async sample(force = false): Promise<WatcherSystemSnapshot> {
    const now = this.now();
    if (!force && this.cached && now - this.cached.capturedAt <= this.ttlMs) {
      return this.cached.snapshot;
    }

    if (!force && this.inFlight) return this.inFlight;

    const request = this.collect()
      .then((snapshot) => {
        this.cached = { capturedAt: this.now(), snapshot };
        return snapshot;
      })
      .finally(() => {
        if (this.inFlight === request) this.inFlight = undefined;
      });

    this.inFlight = request;
    return request;
  }

  invalidate(): void {
    this.cached = undefined;
  }
}

export function createNativeWatcherHostSampler(): WatcherHostSampler {
  return new WatcherHostSampler();
}
