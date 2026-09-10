import { MeshEvents } from "../mesh/events";
import { createFoundryEvent, type EventBus } from "../mesh/eventBus";
import type { WatcherObservation, WatcherObservationDomain, WatcherSystemSnapshot } from "./contracts";
import {
  createDefaultWatcherProviderRegistry,
  DEFAULT_WATCHER_OBSERVATION_PROVIDER_IDS,
} from "./nativeProviders";
import { WatcherObservationStore } from "./observationStore";
import type { WatcherProviderRegistry } from "./providerRegistry";

export interface WatcherRuntimeOptions {
  pollIntervalMs?: number;
  providerIds?: readonly string[];
}

export class WatcherRuntime {
  readonly observations = new WatcherObservationStore();
  readonly providers: WatcherProviderRegistry;

  private readonly events: EventBus;
  private readonly pollIntervalMs: number;
  private readonly providerIds: readonly string[];
  private timer?: ReturnType<typeof setInterval>;
  private cycle?: Promise<WatcherObservation[]>;

  constructor(
    events: EventBus,
    providers: WatcherProviderRegistry = createDefaultWatcherProviderRegistry(),
    options: WatcherRuntimeOptions = {},
  ) {
    this.events = events;
    this.providers = providers;
    this.pollIntervalMs = Math.max(1000, options.pollIntervalMs ?? 15_000);
    this.providerIds = options.providerIds ?? DEFAULT_WATCHER_OBSERVATION_PROVIDER_IDS;
  }

  isRunning(): boolean {
    return Boolean(this.timer);
  }

  async start(): Promise<void> {
    if (this.timer) return;
    await this.pollNow();
    this.timer = setInterval(() => {
      void this.pollNow();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async collectHostSnapshot(): Promise<{ snapshot?: WatcherSystemSnapshot; error?: string; providerId: string }> {
    const result = await this.providers.collect<WatcherSystemSnapshot>("windows-host");
    return { snapshot: result.snapshot, error: result.error, providerId: result.providerId };
  }

  getCurrent(domain?: WatcherObservationDomain): WatcherObservation[] {
    return this.observations.list(domain);
  }

  updatedAt(): string | undefined {
    return this.observations.updatedAt();
  }

  async pollNow(): Promise<WatcherObservation[]> {
    if (this.cycle) return this.cycle;

    const cycle = this.collectAndStore().finally(() => {
      if (this.cycle === cycle) this.cycle = undefined;
    });
    this.cycle = cycle;
    return cycle;
  }

  private async collectAndStore(): Promise<WatcherObservation[]> {
    const batches = await Promise.all(this.providerIds.map((providerId) => this.providers.observe(providerId)));
    const observations = batches.flat();
    const transitions = this.observations.update(observations);

    for (const transition of transitions) {
      const previousAvailability = transition.previous?.availability;
      const currentAvailability = transition.current.availability;
      if (currentAvailability === "unavailable" && previousAvailability !== "unavailable") {
        await this.events.publish(createFoundryEvent({
          type: MeshEvents.watcherProviderUnavailable,
          sourceWorkerId: "watcher",
          subjectId: transition.current.providerId,
          payload: transition.current,
        }));
      } else if (previousAvailability === "unavailable" && currentAvailability !== "unavailable") {
        await this.events.publish(createFoundryEvent({
          type: MeshEvents.watcherProviderRecovered,
          sourceWorkerId: "watcher",
          subjectId: transition.current.providerId,
          payload: transition.current,
        }));
      }
    }

    return observations;
  }
}
