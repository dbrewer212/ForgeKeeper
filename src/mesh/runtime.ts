import { MeshActionCoordinator } from "./actionCoordinator";
import { ActionGateway } from "./actionGateway";
import { InMemoryApprovalStore } from "./approvalStore";
import { InMemoryCheckpointStore } from "./checkpointStore";
import { defaultPermissionRules } from "./defaultPolicies";
import { DurableEventBus } from "./durableEventBus";
import { InMemoryEventBus } from "./eventBus";
import { DefaultHealthAggregator } from "./healthAggregator";
import { MeshOperations } from "./operations";
import { InMemoryPermissionService } from "./permissionService";
import type { MeshPersistence, MeshSnapshot } from "./persistence";
import { createDefaultMeshPersistence } from "./persistence";
import { InMemoryResourceBroker } from "./resourceBroker";
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
  readonly health = new DefaultHealthAggregator(this.workers, this.resources);
  readonly actions = new ActionGateway(this.permissions);
  readonly events: DurableEventBus;
  readonly coordinator: MeshActionCoordinator;
  readonly operations: MeshOperations;
  readonly tools: FoundryToolGateway;

  private safeModeReason?: string;
  private initialized = false;

  constructor(readonly persistence: MeshPersistence = createDefaultMeshPersistence()) {
    this.events = new DurableEventBus(new InMemoryEventBus(), persistence);
    this.coordinator = new MeshActionCoordinator(this);
    this.operations = new MeshOperations(this);
    this.tools = new FoundryToolGateway(this);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const snapshot = await this.persistence.loadSnapshot();
    if (snapshot) this.restore(snapshot);

    this.ensureDefaultWorkers();
    this.initialized = true;
  }

  getSystemHealth(): SystemHealth {
    return this.health.evaluate(this.safeModeReason);
  }

  isSafeMode(): boolean {
    return Boolean(this.safeModeReason);
  }

  enterSafeMode(reason: string): void {
    this.safeModeReason = reason.trim() || "Safe Mode entered by human authority.";
  }

  exitSafeMode(): void {
    this.safeModeReason = undefined;
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
    }
  }

  private ensureDefaultWorkers(): void {
    for (const identity of defaultFoundryWorkers) {
      if (!this.workers.get(identity.id)) {
        this.workers.register(identity);
      }
    }
  }
}

let singleton: FoundryMeshRuntime | undefined;

export function getFoundryMeshRuntime(): FoundryMeshRuntime {
  singleton ??= new FoundryMeshRuntime();
  return singleton;
}
