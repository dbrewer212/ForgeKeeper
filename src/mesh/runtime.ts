import { MeshActionCoordinator } from "./actionCoordinator";
import { ActionGateway } from "./actionGateway";
import { InMemoryApprovalStore } from "./approvalStore";
import { InMemoryCheckpointStore } from "./checkpointStore";
import { CommissioningController } from "./commissioning";
import { CommissioningDiagnostics } from "./commissioningDiagnostics";
import { registerCoreMeshTools } from "./coreTools";
import { defaultPermissionRules } from "./defaultPolicies";
import { registerDiagnosticTools } from "./diagnosticTools";
import { FoundryDomainRegistry } from "./domainRegistry";
import { FoundryDomainStateStore } from "./domainState";
import { registerDomainTools } from "./domainTools";
import { DurableEventBus } from "./durableEventBus";
import { InMemoryEventBus } from "./eventBus";
import { DefaultHealthAggregator } from "./healthAggregator";
import { MeshOperations } from "./operations";
import { InMemoryPermissionService } from "./permissionService";
import type { MeshPersistence, MeshSnapshot } from "./persistence";
import { createDefaultMeshPersistence } from "./persistence";
import { InMemoryResourceBroker, type ResourceQueueEntry } from "./resourceBroker";
import { ServiceLifecycleManager } from "./serviceLifecycle";
import { defaultFoundryServices, ServiceRegistry } from "./serviceRegistry";
import { registerServiceTools } from "./serviceTools";
import { FoundryToolGateway } from "./toolGateway";
import { InMemoryWorkerRegistry } from "./workerRegistry";
import type { SystemHealth } from "./types";
import { defaultFoundryWorkers } from "./workers";

export class FoundryMeshRuntime {
  readonly workers = new InMemoryWorkerRegistry();
  readonly resources = new InMemoryResourceBroker();
  readonly permissions = new InMemoryPermissionService(defaultPermissionRules);
  readonly checkpoints = new InMemoryCheckpointStore();
  readonly approvals = new InMemoryApprovalStore();
  readonly domain = new FoundryDomainRegistry();
  readonly services = new ServiceRegistry();
  readonly health = new DefaultHealthAggregator(this.workers, this.resources);
  readonly actions = new ActionGateway(this.permissions);
  readonly events: DurableEventBus;
  readonly coordinator: MeshActionCoordinator;
  readonly operations: MeshOperations;
  readonly tools: FoundryToolGateway;
  readonly commissioning: CommissioningController;
  readonly serviceLifecycle: ServiceLifecycleManager;
  readonly diagnostics: CommissioningDiagnostics;
  readonly domainState: FoundryDomainStateStore;

  private safeModeReason?: string;
  private initialized = false;

  constructor(readonly persistence: MeshPersistence = createDefaultMeshPersistence()) {
    this.events = new DurableEventBus(new InMemoryEventBus(), persistence);
    this.domainState = new FoundryDomainStateStore({
      publish: (event) => this.events.publish(event),
      persist: () => this.save(),
    });
    this.domain.register(this.domainState.services);
    this.coordinator = new MeshActionCoordinator(this);
    this.operations = new MeshOperations(this);
    this.tools = new FoundryToolGateway(this);
    this.commissioning = new CommissioningController(this);
    this.serviceLifecycle = new ServiceLifecycleManager(this);
    this.diagnostics = new CommissioningDiagnostics(this);
    registerCoreMeshTools(this);
    registerServiceTools(this);
    registerDiagnosticTools(this);
    registerDomainTools(this);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const snapshot = await this.persistence.loadSnapshot();
    if (snapshot) this.restore(snapshot);

    this.ensureDefaultWorkers();
    this.ensureDefaultServices();
    this.initialized = true;
  }

  getSystemHealth(): SystemHealth {
    return this.health.evaluate(this.safeModeReason);
  }

  isSafeMode(): boolean {
    return Boolean(this.safeModeReason);
  }

  enterSafeMode(reason: string): ResourceQueueEntry[] {
    this.safeModeReason = reason.trim() || "Safe Mode entered by human authority.";
    this.resources.setAdmissionEnabled(false, `Safe Mode: ${this.safeModeReason}`);
    return this.resources.cancelAllPending();
  }

  exitSafeMode(): void {
    this.safeModeReason = undefined;
    this.resources.setAdmissionEnabled(true);
  }

  async save(): Promise<void> {
    await this.persistence.saveSnapshot(this.snapshot());
  }

  snapshot(): MeshSnapshot {
    return {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      workers: this.workers.list(),
      resources: this.resources.listStates(),
      permissions: this.permissions.listRules(),
      checkpoints: this.checkpoints.list(),
      approvals: this.approvals.list(),
      services: this.services.list(),
      domain: this.domainState.snapshot(),
      health: this.getSystemHealth(),
    };
  }

  private restore(snapshot: MeshSnapshot): void {
    if (snapshot.schemaVersion !== 1) {
      throw new Error(`Unsupported mesh snapshot schema version: ${snapshot.schemaVersion}`);
    }

    for (const registered of snapshot.workers) {
      this.workers.register(registered.identity, registered.status);
    }

    for (const resource of snapshot.resources) {
      this.resources.updateState(resource);
    }

    for (const service of snapshot.services) {
      this.services.register(service);
    }

    this.domainState.restore(snapshot.domain);

    for (const existing of this.permissions.listRules()) {
      this.permissions.removeRule(existing.id);
    }

    for (const rule of snapshot.permissions) {
      this.permissions.addRule(rule);
    }

    this.checkpoints.restore(snapshot.checkpoints);
    this.approvals.restore(snapshot.approvals);

    if (snapshot.health.state === "safe-mode") {
      this.safeModeReason = snapshot.health.safeModeReason ?? "Safe Mode restored from persistent state.";
      this.resources.setAdmissionEnabled(false, `Safe Mode: ${this.safeModeReason}`);
      this.resources.cancelAllPending();
    } else {
      this.resources.setAdmissionEnabled(true);
    }
  }

  private ensureDefaultWorkers(): void {
    for (const defaultIdentity of defaultFoundryWorkers) {
      const existing = this.workers.get(defaultIdentity.id);
      if (!existing) {
        this.workers.register(defaultIdentity);
        continue;
      }

      const hasCommissioningState = Boolean(existing.identity.commissioningState);
      this.workers.updateIdentity({
        ...defaultIdentity,
        enabled: hasCommissioningState ? existing.identity.enabled : defaultIdentity.enabled,
        commissioningState: hasCommissioningState
          ? existing.identity.commissioningState
          : defaultIdentity.commissioningState,
      });
    }
  }

  private ensureDefaultServices(): void {
    for (const service of defaultFoundryServices) {
      const existing = this.services.get(service.id);
      if (!existing) {
        this.services.register(service);
        continue;
      }

      if (service.id === "foundry-domain") {
        this.services.update(service.id, {
          ...service,
          metadata: { ...existing.metadata, ...service.metadata },
        });
      }
    }
  }
}

let singleton: FoundryMeshRuntime | undefined;

export function getFoundryMeshRuntime(): FoundryMeshRuntime {
  singleton ??= new FoundryMeshRuntime();
  return singleton;
}
