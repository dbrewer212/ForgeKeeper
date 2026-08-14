import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
import type { ResourceAdmission } from "./resourceBroker";
import type { FoundryMeshRuntime } from "./runtime";
import type {
  Checkpoint,
  ResourceLease,
  ResourceRequest,
  ResourceState,
  WorkerIdentity,
  WorkerStatus,
} from "./types";

export class MeshOperations {
  constructor(private readonly runtime: FoundryMeshRuntime) {}

  async registerWorker(identity: WorkerIdentity, status?: WorkerStatus): Promise<void> {
    this.runtime.workers.register(identity, status);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.workerRegistered,
        sourceWorkerId: "foundry-core",
        subjectId: identity.id,
        payload: { identity, status: this.runtime.workers.get(identity.id)?.status },
      }),
    );
    await this.runtime.save();
  }

  async updateWorkerStatus(status: WorkerStatus): Promise<void> {
    const previous = this.runtime.workers.get(status.workerId)?.status;
    this.runtime.workers.updateStatus(status);

    const transitionEvent = eventForWorkerTransition(previous, status);
    const containment =
      transitionEvent === MeshEvents.workerFailed
        ? {
            canceledPendingRequests: this.runtime.resources.cancelPendingForWorker(status.workerId),
            heldLeases: this.runtime.resources.listWorkerLeases(status.workerId),
            leasePolicy:
              "Active leases remain reserved after worker failure until explicit release or expiry, preventing accidental double allocation.",
          }
        : undefined;

    await this.runtime.events.publish(
      createFoundryEvent({
        type: transitionEvent,
        sourceWorkerId: status.workerId,
        subjectId: status.workerId,
        payload: { previous, current: status, containment },
      }),
    );
    await this.runtime.save();
  }

  async updateResourceState(state: ResourceState, sourceWorkerId = "watcher"): Promise<void> {
    const previous = this.runtime.resources.getState(state.id);
    this.runtime.resources.updateState(state);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.resourceStateChanged,
        sourceWorkerId,
        subjectId: state.id,
        payload: { previous, current: state },
      }),
    );
    await this.runtime.save();
  }

  async requestResource(request: ResourceRequest): Promise<ResourceLease | null> {
    const admission = this.runtime.resources.admit(request, true);
    await this.publishResourceAdmission(admission);
    await this.runtime.save();
    return admission.lease ?? null;
  }

  async releaseResource(leaseId: string, sourceWorkerId = "foundry-core"): Promise<void> {
    const lease = this.runtime.resources.listActiveLeases().find((candidate) => candidate.id === leaseId);
    this.runtime.resources.release(leaseId);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.resourceLeaseReleased,
        sourceWorkerId,
        subjectId: lease?.resourceId,
        payload: { leaseId, lease },
      }),
    );

    if (lease && this.runtime.resources.isAdmissionEnabled()) {
      const newlyGranted = this.runtime.resources.drainPending(lease.resourceId);
      for (const admission of newlyGranted) {
        await this.publishResourceAdmission(admission);
      }
    }

    await this.runtime.save();
  }

  async createCheckpoint<TState>(checkpoint: Checkpoint<TState>): Promise<void> {
    this.runtime.checkpoints.save(checkpoint);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.productionCheckpointCreated,
        sourceWorkerId: checkpoint.createdByWorkerId,
        subjectId: checkpoint.subjectId ?? checkpoint.id,
        payload: checkpoint,
      }),
    );
    await this.runtime.save();
  }

  async enterSafeMode(reason: string, sourceWorkerId = "foundry-core"): Promise<void> {
    const canceledPendingRequests = this.runtime.enterSafeMode(reason);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.systemSafeModeEntered,
        sourceWorkerId,
        payload: {
          reason: this.runtime.getSystemHealth().safeModeReason,
          canceledPendingRequests,
          activeLeasesHeld: this.runtime.resources.listActiveLeases(),
          resourceAdmissionEnabled: this.runtime.resources.isAdmissionEnabled(),
        },
      }),
    );
    await this.runtime.save();
  }

  async exitSafeMode(sourceWorkerId = "foundry-core"): Promise<void> {
    const previousReason = this.runtime.getSystemHealth().safeModeReason;
    this.runtime.exitSafeMode();
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.systemSafeModeExited,
        sourceWorkerId,
        payload: {
          previousReason,
          resourceAdmissionEnabled: this.runtime.resources.isAdmissionEnabled(),
          note: "Canceled Safe Mode resource requests are not replayed automatically.",
        },
      }),
    );
    await this.runtime.save();
  }

  private async publishResourceAdmission(admission: ResourceAdmission): Promise<void> {
    await this.runtime.events.publish(
      createFoundryEvent({
        type: admission.granted ? MeshEvents.resourceLeaseGranted : MeshEvents.resourceLeaseDenied,
        sourceWorkerId: admission.request.requesterWorkerId,
        subjectId: admission.request.resourceId,
        payload: admission,
      }),
    );
  }
}

function eventForWorkerTransition(previous: WorkerStatus | undefined, current: WorkerStatus): string {
  if (current.state === "failed" || current.health === "critical") return MeshEvents.workerFailed;
  if (previous && (previous.state === "failed" || previous.health === "critical")) return MeshEvents.workerRecovered;
  if (current.state === "starting" || (!previous && current.state !== "offline")) return MeshEvents.workerStarted;
  if (current.state === "offline" || current.state === "stopping") return MeshEvents.workerStopped;
  return MeshEvents.workerHeartbeat;
}
