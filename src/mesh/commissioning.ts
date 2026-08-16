import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
import type { FoundryMeshRuntime } from "./runtime";
import type { CommissioningState, WorkerIdentity } from "./types";

const allowedTransitions: Record<CommissioningState, CommissioningState[]> = {
  unconfigured: ["configured", "disabled"],
  configured: ["validated", "disabled", "failed"],
  validated: ["dormant", "commissioning", "disabled", "failed"],
  dormant: ["commissioning", "disabled", "failed"],
  commissioning: ["active", "dormant", "degraded", "disabled", "failed"],
  active: ["degraded", "dormant", "disabled", "failed"],
  degraded: ["commissioning", "active", "dormant", "disabled", "failed"],
  disabled: ["configured", "validated", "dormant"],
  failed: ["configured", "validated", "dormant", "disabled"],
};

export interface CommissioningTransitionResult {
  worker: WorkerIdentity;
  previousState: CommissioningState;
  state: CommissioningState;
  enabled: boolean;
}

export class CommissioningController {
  constructor(private readonly runtime: FoundryMeshRuntime) {}

  getState(workerId: string): CommissioningState {
    const worker = this.requireWorker(workerId);
    return worker.identity.commissioningState ?? (worker.identity.enabled ? "active" : "dormant");
  }

  async transition(
    workerId: string,
    nextState: CommissioningState,
    reason: string,
    sourceWorkerId = "foundry-core",
  ): Promise<CommissioningTransitionResult> {
    if (workerId === "foundry-core" && nextState !== "active") {
      throw new Error("Foundry Core cannot be disabled through the worker commissioning controller.");
    }

    const registered = this.requireWorker(workerId);
    const previousState = this.getState(workerId);
    if (previousState !== nextState && !allowedTransitions[previousState].includes(nextState)) {
      throw new Error(`Invalid commissioning transition for ${workerId}: ${previousState} -> ${nextState}.`);
    }

    const enabled = nextState === "commissioning" || nextState === "active" || nextState === "degraded";
    const identity: WorkerIdentity = {
      ...registered.identity,
      enabled,
      commissioningState: nextState,
    };
    this.runtime.workers.updateIdentity(identity);

    if (!enabled && registered.status.state !== "offline") {
      this.runtime.workers.updateStatus({
        ...registered.status,
        state: "offline",
        currentActivity: undefined,
      });
    }

    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.workerCommissioningStateChanged,
        sourceWorkerId,
        subjectId: workerId,
        payload: {
          previousState,
          state: nextState,
          enabled,
          reason,
        },
      }),
    );
    await this.runtime.save();

    return { worker: identity, previousState, state: nextState, enabled };
  }

  canExecute(workerId: string): boolean {
    const registered = this.runtime.workers.get(workerId);
    if (!registered?.identity.enabled) return false;
    const state = registered.identity.commissioningState ?? "active";
    return state === "commissioning" || state === "active" || state === "degraded";
  }

  private requireWorker(workerId: string) {
    const worker = this.runtime.workers.get(workerId);
    if (!worker) throw new Error(`Worker ${workerId} is not registered.`);
    return worker;
  }
}
