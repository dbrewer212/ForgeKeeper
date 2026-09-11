import type { WatcherObservation, WatcherObservationDomain } from "./contracts";

export interface WatcherObservationTransition {
  previous?: WatcherObservation;
  current: WatcherObservation;
}

function observationKey(observation: Pick<WatcherObservation, "providerId" | "domain" | "subjectId">): string {
  return `${observation.providerId}|${observation.domain}|${observation.subjectId ?? ""}`;
}

export class WatcherObservationStore {
  private readonly observations = new Map<string, WatcherObservation>();
  private lastUpdatedAt?: string;

  update(next: WatcherObservation[]): WatcherObservationTransition[] {
    const transitions: WatcherObservationTransition[] = [];
    for (const observation of next) {
      const key = observationKey(observation);
      const previous = this.observations.get(key);
      this.observations.set(key, structuredClone(observation));
      transitions.push({ previous: previous ? structuredClone(previous) : undefined, current: structuredClone(observation) });
      if (!this.lastUpdatedAt || observation.observedAt > this.lastUpdatedAt) this.lastUpdatedAt = observation.observedAt;
    }
    return transitions;
  }

  list(domain?: WatcherObservationDomain): WatcherObservation[] {
    return [...this.observations.values()]
      .filter((observation) => !domain || observation.domain === domain)
      .map((observation) => structuredClone(observation));
  }

  get(providerId: string, domain: WatcherObservationDomain, subjectId?: string): WatcherObservation | undefined {
    const observation = this.observations.get(observationKey({ providerId, domain, subjectId }));
    return observation ? structuredClone(observation) : undefined;
  }

  updatedAt(): string | undefined {
    return this.lastUpdatedAt;
  }

  clear(): void {
    this.observations.clear();
    this.lastUpdatedAt = undefined;
  }
}
