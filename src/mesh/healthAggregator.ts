import type { HealthState, ResourceState, SystemHealth } from "./types";
import type { WorkerRegistry } from "./workerRegistry";
import type { ResourceBroker } from "./resourceBroker";

const HEALTH_RANK: Record<HealthState, number> = {
  nominal: 0,
  busy: 1,
  degraded: 2,
  critical: 3,
  "safe-mode": 4,
};

export interface HealthAggregator {
  evaluate(safeModeReason?: string): SystemHealth;
}

export class DefaultHealthAggregator implements HealthAggregator {
  constructor(
    private readonly workers: WorkerRegistry,
    private readonly resources: ResourceBroker,
  ) {}

  evaluate(safeModeReason?: string): SystemHealth {
    const registered = this.workers.list();
    const resourceStates = this.resources.listStates();

    const degradedWorkers = registered
      .filter(({ status }) => status.health === "degraded")
      .map(({ identity }) => identity.id);

    const criticalWorkers = registered
      .filter(({ status }) => status.health === "critical" || status.state === "failed")
      .map(({ identity }) => identity.id);

    let state: HealthState = safeModeReason ? "safe-mode" : "nominal";

    if (!safeModeReason) {
      for (const { status } of registered) {
        state = maxHealth(state, status.health);
      }

      for (const resource of resourceStates) {
        state = maxHealth(state, resourcePressureToHealth(resource));
      }
    }

    return {
      state,
      summary: buildSummary(state, registered.length, degradedWorkers.length, criticalWorkers.length, resourceStates),
      updatedAt: new Date().toISOString(),
      degradedWorkers,
      criticalWorkers,
      safeModeReason,
    };
  }
}

function maxHealth(left: HealthState, right: HealthState): HealthState {
  return HEALTH_RANK[right] > HEALTH_RANK[left] ? right : left;
}

function resourcePressureToHealth(resource: ResourceState): HealthState {
  switch (resource.pressure) {
    case "normal":
      return "nominal";
    case "elevated":
      return "busy";
    case "high":
      return "degraded";
    case "critical":
      return "critical";
  }
}

function buildSummary(
  state: HealthState,
  workerCount: number,
  degradedCount: number,
  criticalCount: number,
  resources: ResourceState[],
): string {
  if (state === "safe-mode") return "Safe Mode is active; autonomous execution should remain suspended.";
  if (criticalCount > 0) return `${criticalCount} worker${criticalCount === 1 ? "" : "s"} require immediate attention.`;
  if (degradedCount > 0) return `${degradedCount} worker${degradedCount === 1 ? "" : "s"} are operating in a degraded state.`;

  const pressuredResources = resources.filter((resource) => resource.pressure !== "normal");
  if (pressuredResources.length > 0) {
    return `${pressuredResources.length} managed resource${pressuredResources.length === 1 ? " is" : "s are"} under load.`;
  }

  return `${workerCount} registered worker${workerCount === 1 ? "" : "s"}; mesh nominal.`;
}
