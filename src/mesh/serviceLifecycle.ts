import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
import type { FoundryMeshRuntime } from "./runtime";
import type { ServiceDescriptor, ServiceRuntimeState } from "./serviceRegistry";

export interface ManagedServiceAdapter {
  start(service: ServiceDescriptor): Promise<void>;
  stop(service: ServiceDescriptor): Promise<void>;
  restart?(service: ServiceDescriptor): Promise<void>;
  probe?(service: ServiceDescriptor): Promise<{ online: boolean; detail?: string }>;
}

export interface ServiceTransitionResult {
  service: ServiceDescriptor;
  previousRuntimeState: ServiceRuntimeState;
}

export class ServiceLifecycleManager {
  private readonly adapters = new Map<string, ManagedServiceAdapter>();

  constructor(private readonly runtime: FoundryMeshRuntime) {}

  registerAdapter(serviceId: string, adapter: ManagedServiceAdapter): void {
    if (!this.runtime.services.get(serviceId)) {
      throw new Error(`Cannot register adapter for unknown service ${serviceId}.`);
    }
    this.adapters.set(serviceId, adapter);
  }

  unregisterAdapter(serviceId: string): void {
    this.adapters.delete(serviceId);
  }

  hasAdapter(serviceId: string): boolean {
    return this.adapters.has(serviceId);
  }

  async start(serviceId: string, sourceWorkerId = "foundry-core"): Promise<ServiceTransitionResult> {
    if (this.runtime.isSafeMode()) {
      throw new Error(`Cannot start service ${serviceId} while the Foundry is in Safe Mode.`);
    }

    const service = this.requireService(serviceId);
    this.requireCommissionedForExecution(service);
    if (!this.runtime.services.dependenciesSatisfied(serviceId)) {
      const missing = service.dependencies.filter((dependencyId) => {
        const dependency = this.runtime.services.get(dependencyId);
        return dependency?.commissioningState !== "active" || dependency.runtimeState !== "online";
      });
      throw new Error(`Cannot start service ${serviceId}; dependencies are not active and online: ${missing.join(", ")}.`);
    }

    const adapter = this.requireAdapter(serviceId);
    const previousRuntimeState = service.runtimeState;
    await this.setRuntimeState(serviceId, "starting", sourceWorkerId);

    try {
      await adapter.start(service);
      const next = await this.setRuntimeState(serviceId, "online", sourceWorkerId, { enabled: true });
      await this.syncWorker(service, "idle", "nominal");
      return { service: next, previousRuntimeState };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.setRuntimeState(serviceId, "failed", sourceWorkerId, { metadata: { ...service.metadata, lastError: detail } });
      await this.syncWorker(service, "failed", "critical", detail);
      throw error;
    }
  }

  async stop(serviceId: string, sourceWorkerId = "foundry-core"): Promise<ServiceTransitionResult> {
    const service = this.requireService(serviceId);
    const previousRuntimeState = service.runtimeState;
    if (service.runtimeState === "offline") return { service, previousRuntimeState };

    const adapter = this.requireAdapter(serviceId);
    await this.setRuntimeState(serviceId, "stopping", sourceWorkerId);

    try {
      await adapter.stop(service);
      const next = await this.setRuntimeState(serviceId, "offline", sourceWorkerId, { enabled: false });
      await this.syncWorker(service, "offline", "nominal");
      return { service: next, previousRuntimeState };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.setRuntimeState(serviceId, "failed", sourceWorkerId, { metadata: { ...service.metadata, lastError: detail } });
      await this.syncWorker(service, "failed", "critical", detail);
      throw error;
    }
  }

  async restart(serviceId: string, sourceWorkerId = "foundry-core"): Promise<ServiceTransitionResult> {
    if (this.runtime.isSafeMode()) {
      throw new Error(`Cannot restart service ${serviceId} while the Foundry is in Safe Mode.`);
    }

    const service = this.requireService(serviceId);
    this.requireCommissionedForExecution(service);
    if (!this.runtime.services.dependenciesSatisfied(serviceId)) {
      throw new Error(`Cannot restart service ${serviceId}; one or more dependencies are not active and online.`);
    }

    const adapter = this.requireAdapter(serviceId);
    const previousRuntimeState = service.runtimeState;
    await this.setRuntimeState(serviceId, "stopping", sourceWorkerId);

    try {
      if (adapter.restart) {
        await adapter.restart(service);
      } else {
        await adapter.stop(service);
        await this.setRuntimeState(serviceId, "starting", sourceWorkerId);
        await adapter.start(service);
      }
      const next = await this.setRuntimeState(serviceId, "online", sourceWorkerId, { enabled: true });
      await this.syncWorker(service, "idle", "nominal");
      return { service: next, previousRuntimeState };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.setRuntimeState(serviceId, "failed", sourceWorkerId, { metadata: { ...service.metadata, lastError: detail } });
      await this.syncWorker(service, "failed", "critical", detail);
      throw error;
    }
  }

  async probe(serviceId: string, sourceWorkerId = "foundry-core"): Promise<{ service: ServiceDescriptor; online: boolean; detail?: string }> {
    const service = this.requireService(serviceId);
    const adapter = this.requireAdapter(serviceId);
    if (!adapter.probe) {
      return { service, online: service.runtimeState === "online", detail: "No health probe is registered for this service." };
    }

    const result = await adapter.probe(service);
    const expectedState: ServiceRuntimeState = result.online ? "online" : service.runtimeState === "offline" ? "offline" : "degraded";
    const next = await this.setRuntimeState(serviceId, expectedState, sourceWorkerId, {
      metadata: { ...service.metadata, lastProbeAt: new Date().toISOString(), lastProbeDetail: result.detail },
    });
    return { service: next, ...result };
  }

  private requireService(serviceId: string): ServiceDescriptor {
    const service = this.runtime.services.get(serviceId);
    if (!service) throw new Error(`Service ${serviceId} is not registered.`);
    return service;
  }

  private requireAdapter(serviceId: string): ManagedServiceAdapter {
    const adapter = this.adapters.get(serviceId);
    if (!adapter) {
      throw new Error(`Service ${serviceId} is staged but has no runtime adapter registered; it cannot execute yet.`);
    }
    return adapter;
  }

  private requireCommissionedForExecution(service: ServiceDescriptor): void {
    const allowed = service.commissioningState === "commissioning" || service.commissioningState === "active" || service.commissioningState === "degraded";
    if (!service.enabled || !allowed) {
      throw new Error(`Service ${service.id} is ${service.commissioningState} and is not commissioned for execution.`);
    }
  }

  private async setRuntimeState(
    serviceId: string,
    runtimeState: ServiceRuntimeState,
    sourceWorkerId: string,
    patch: Partial<ServiceDescriptor> = {},
  ): Promise<ServiceDescriptor> {
    const previous = this.requireService(serviceId);
    const next = this.runtime.services.update(serviceId, { ...patch, runtimeState });
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.serviceStateChanged,
        sourceWorkerId,
        subjectId: serviceId,
        payload: { previous, current: next },
      }),
    );
    await this.runtime.save();
    return next;
  }

  private async syncWorker(
    service: ServiceDescriptor,
    state: "offline" | "idle" | "failed",
    health: "nominal" | "critical",
    lastError?: string,
  ): Promise<void> {
    if (!service.workerId) return;
    const registered = this.runtime.workers.get(service.workerId);
    if (!registered) return;
    await this.runtime.operations.updateWorkerStatus({
      ...registered.status,
      state,
      health,
      lastError,
      currentActivity: state === "idle" ? `${service.name} online` : undefined,
      lastHeartbeatAt: new Date().toISOString(),
    });
  }
}
