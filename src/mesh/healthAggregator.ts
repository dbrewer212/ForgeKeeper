import type { HealthState, ResourceState, SystemHealth } from "./types";
import type { WorkerRegistry } from "./workerRegistry";
import type { ResourceBroker } from "./resourceBroker";
import type { ServiceDescriptor, ServiceRegistry } from "./serviceRegistry";

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
    private readonly services?: ServiceRegistry,
  ) {}

  evaluate(safeModeReason?: string): SystemHealth {
    const registered = this.workers.list();
    const resourceStates = this.resources.listStates();
    const serviceStates = this.services?.list() ?? [];

    const degradedWorkers = registered
      .filter(({ status }) => status.health === "degraded")
      .map(({ identity }) => identity.id);

    const criticalWorkers = registered
      .filter(({ status }) => status.health === "critical" || status.state === "failed")
      .map(({ identity }) => identity.id);

    const affectedServices = serviceStates.filter((service) => serviceToHealth(service) !== "nominal");

    let state: HealthState = safeModeReason ? "safe-mode" : "nominal";

    if (!safeModeReason) {
      for (const { status } of registered) {
        state = maxHealth(state, status.health);
      }

      for (const resource of resourceStates) {
        state = maxHealth(state, resourcePressureToHealth(resource));
      }

      for (const service of serviceStates) {
        state = maxHealth(state, serviceToHealth(service));
      }
    }

    return {
      state,
      summary: buildSummary(
        state,
        registered.length,
        degradedWorkers.length,
        criticalWorkers.length,
        resourceStates,
        affectedServices,
      ),
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

function serviceToHealth(service: ServiceDescriptor): HealthState {
  // Dormant, disabled, staged, or otherwise non-running services are expected to be offline
  // and must not make the Foundry unhealthy simply because they are not commissioned yet.
  if (!service.enabled || service.commissioningState === "dormant" || service.commissioningState === "disabled") {
    return "nominal";
  }

  if (service.commissioningState === "failed" || service.runtimeState === "failed") {
    return "critical";
  }

  if (service.commissioningState === "degraded" || service.runtimeState === "degraded") {
    return "degraded";
  }

  if (service.commissioningState === "commissioning" || service.runtimeState === "starting" || service.runtimeState === "stopping") {
    return "busy";
  }

  // Once a service is active and enabled, unexpectedly being offline is a real degraded state.
  if (service.commissioningState === "active" && service.runtimeState === "offline") {
    return "degraded";
  }

  return "nominal";
}

function buildSummary(
  state: HealthState,
  workerCount: number,
  degradedCount: number,
  criticalCount: number,
  resources: ResourceState[],
  affectedServices: ServiceDescriptor[],
): string {
  if (state === "safe-mode") return "Safe Mode is active; autonomous execution should remain suspended.";
  if (criticalCount > 0) return `${criticalCount} worker${criticalCount === 1 ? "" : "s"} require immediate attention.`;
  if (degradedCount > 0) return `${degradedCount} worker${degradedCount === 1 ? "" : "s"} are operating in a degraded state.`;

  const criticalServices = affectedServices.filter((service) => serviceToHealth(service) === "critical");
  if (criticalServices.length > 0) {
    return `${criticalServices.length} managed service${criticalServices.length === 1 ? " requires" : "s require"} immediate attention.`;
  }

  const degradedServices = affectedServices.filter((service) => serviceToHealth(service) === "degraded");
  if (degradedServices.length > 0) {
    return `${degradedServices.length} managed service${degradedServices.length === 1 ? " is" : "s are"} degraded.`;
  }

  const pressuredResources = resources.filter((resource) => resource.pressure !== "normal");
  if (pressuredResources.length > 0) {
    return `${pressuredResources.length} managed resource${pressuredResources.length === 1 ? " is" : "s are"} under load.`;
  }

  const transitioningServices = affectedServices.filter((service) => serviceToHealth(service) === "busy");
  if (transitioningServices.length > 0) {
    return `${transitioningServices.length} managed service${transitioningServices.length === 1 ? " is" : "s are"} transitioning.`;
  }

  return `${workerCount} registered worker${workerCount === 1 ? "" : "s"}; mesh nominal.`;
}
