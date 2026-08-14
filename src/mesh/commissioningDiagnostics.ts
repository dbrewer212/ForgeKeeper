import type { FoundryMeshRuntime } from "./runtime";
import type { ServiceDescriptor, ServiceRuntimeState } from "./serviceRegistry";
import type { CommissioningState, RegisteredWorker } from "./types";

export type ReadinessLevel = "staged" | "ready" | "blocked" | "active";

export interface DependencyReadiness {
  serviceId: string;
  present: boolean;
  commissioningState?: CommissioningState;
  runtimeState?: ServiceRuntimeState;
  satisfied: boolean;
}

export interface ServiceReadiness {
  serviceId: string;
  name: string;
  level: ReadinessLevel;
  commissioningState: CommissioningState;
  runtimeState: ServiceRuntimeState;
  enabled: boolean;
  workerId?: string;
  workerRegistered: boolean;
  workerCommissioningState?: CommissioningState;
  adapterRequired: boolean;
  adapterRegistered: boolean;
  adapterIssues: string[];
  dependencies: DependencyReadiness[];
  structuralBlockers: string[];
  commissioningRequirements: string[];
  activationBlockers: string[];
  structurallyReady: boolean;
  readyForCommissioning: boolean;
  executableNow: boolean;
}

export interface CommissioningReadinessReport {
  generatedAt: string;
  safeMode: boolean;
  structurallyReady: boolean;
  readyForCommissioningCount: number;
  executableNowCount: number;
  dormantWorkerCount: number;
  activeWorkerCount: number;
  blockedServices: string[];
  stagedServices: string[];
  readyServices: string[];
  activeServices: string[];
  services: ServiceReadiness[];
}

const executableCommissioningStates = new Set<CommissioningState>(["commissioning", "active", "degraded"]);
const preCommissioningStates = new Set<CommissioningState>(["configured", "validated", "dormant"]);

export class CommissioningDiagnostics {
  constructor(private readonly runtime: FoundryMeshRuntime) {}

  report(): CommissioningReadinessReport {
    const services = this.runtime.services.list().map((service) => this.evaluateService(service));
    const workers = this.runtime.workers.list();

    return {
      generatedAt: new Date().toISOString(),
      safeMode: this.runtime.isSafeMode(),
      structurallyReady: services.every((service) => service.structurallyReady),
      readyForCommissioningCount: services.filter((service) => service.readyForCommissioning).length,
      executableNowCount: services.filter((service) => service.executableNow).length,
      dormantWorkerCount: workers.filter((worker) => this.workerState(worker) === "dormant").length,
      activeWorkerCount: workers.filter((worker) => this.workerState(worker) === "active").length,
      blockedServices: services.filter((service) => service.level === "blocked").map((service) => service.serviceId),
      stagedServices: services.filter((service) => service.level === "staged").map((service) => service.serviceId),
      readyServices: services.filter((service) => service.level === "ready").map((service) => service.serviceId),
      activeServices: services.filter((service) => service.level === "active").map((service) => service.serviceId),
      services,
    };
  }

  evaluateService(service: ServiceDescriptor): ServiceReadiness {
    const worker = service.workerId ? this.runtime.workers.get(service.workerId) : undefined;
    const adapterRequired = service.adapterRequired !== false;
    const adapterRegistered = !adapterRequired || this.runtime.serviceLifecycle.hasAdapter(service.id);
    const adapterIssues = adapterRequired && adapterRegistered
      ? this.runtime.serviceLifecycle.validationIssues(service.id)
      : [];
    const dependencies = service.dependencies.map((serviceId) => this.evaluateDependency(serviceId));

    const structuralBlockers: string[] = [];
    if (service.workerId && !worker) {
      structuralBlockers.push(`Associated worker ${service.workerId} is not registered.`);
    }
    for (const dependency of dependencies) {
      if (!dependency.present) structuralBlockers.push(`Dependency ${dependency.serviceId} is not registered.`);
    }
    if (service.enabled && !executableCommissioningStates.has(service.commissioningState)) {
      structuralBlockers.push(
        `Service is enabled while commissioning state is ${service.commissioningState}; executable services must be commissioning, active, or degraded.`,
      );
    }

    const commissioningRequirements: string[] = [];
    if (adapterRequired && !adapterRegistered) commissioningRequirements.push("Runtime adapter has not been registered yet.");
    commissioningRequirements.push(...adapterIssues);
    if (service.commissioningState === "unconfigured") commissioningRequirements.push("Service configuration has not been completed.");
    if (service.commissioningState === "configured") commissioningRequirements.push("Service still requires validation before commissioning.");
    if (service.commissioningState === "disabled") commissioningRequirements.push("Service is intentionally disabled.");
    if (service.commissioningState === "failed") commissioningRequirements.push("Service must recover from its failed commissioning state.");

    const activationBlockers = [...structuralBlockers];
    if (this.runtime.isSafeMode()) activationBlockers.push("Foundry Safe Mode blocks service activation.");
    if (adapterRequired && !adapterRegistered) activationBlockers.push("No runtime adapter is registered.");
    activationBlockers.push(...adapterIssues);
    if (!service.enabled) activationBlockers.push("Service execution is disabled.");
    if (!executableCommissioningStates.has(service.commissioningState)) {
      activationBlockers.push(`Commissioning state ${service.commissioningState} does not permit execution.`);
    }
    for (const dependency of dependencies) {
      if (!dependency.satisfied) activationBlockers.push(`Dependency ${dependency.serviceId} is not active and online.`);
    }

    const structurallyReady = structuralBlockers.length === 0;
    const readyForCommissioning =
      structurallyReady &&
      adapterRegistered &&
      adapterIssues.length === 0 &&
      (preCommissioningStates.has(service.commissioningState) || executableCommissioningStates.has(service.commissioningState));
    const executableNow = activationBlockers.length === 0;

    return {
      serviceId: service.id,
      name: service.name,
      level: this.levelFor(service, structurallyReady, readyForCommissioning, executableNow),
      commissioningState: service.commissioningState,
      runtimeState: service.runtimeState,
      enabled: service.enabled,
      workerId: service.workerId,
      workerRegistered: service.workerId ? Boolean(worker) : true,
      workerCommissioningState: worker?.identity.commissioningState,
      adapterRequired,
      adapterRegistered,
      adapterIssues,
      dependencies,
      structuralBlockers,
      commissioningRequirements,
      activationBlockers,
      structurallyReady,
      readyForCommissioning,
      executableNow,
    };
  }

  private evaluateDependency(serviceId: string): DependencyReadiness {
    const dependency = this.runtime.services.get(serviceId);
    return {
      serviceId,
      present: Boolean(dependency),
      commissioningState: dependency?.commissioningState,
      runtimeState: dependency?.runtimeState,
      satisfied: dependency?.commissioningState === "active" && dependency.runtimeState === "online",
    };
  }

  private levelFor(
    service: ServiceDescriptor,
    structurallyReady: boolean,
    readyForCommissioning: boolean,
    executableNow: boolean,
  ): ReadinessLevel {
    if (service.runtimeState === "online" && executableNow) return "active";
    if (!structurallyReady) return "blocked";
    if (readyForCommissioning) return "ready";
    return "staged";
  }

  private workerState(worker: RegisteredWorker): CommissioningState {
    return worker.identity.commissioningState ?? (worker.identity.enabled ? "active" : "dormant");
  }
}
