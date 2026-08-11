import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
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

    await this.runtime.events.publish(
      createFoundryEvent({
        type: eventForWorkerTransition(previous, status),
        sourceWorkerId: status.workerId,
        subjectId: status.workerId,
        payload: { previous, current: status },
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
    const lease = this.runtime.resources.request(request);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: lease ? MeshEvents.resourceLeaseGranted : MeshEvents.resourceLeaseDenied,
        sourceWorkerId: request.requesterWorkerId,
        subjectId: request.resourceId,
        payload: { request, lease },
      }),
    );
    await this.runtime.save();
    return lease;
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
    this.runtime.enterSafeMode(reason);
    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.systemSafeModeEntered,
        sourceWorkerId,
        payload: { reason: this.runtime.getSystemHealth().safeModeReason },
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
        payload: { previousReason },
      }),
    );
    await this.runtime.save();
  }
}

function eventForWorkerTransition(previous: WorkerStatus | undefined, current: WorkerStatus): string {
  if (current.state === "failed" || current.health === "critical") return MeshEvents.workerFailed;
  if (previous && (previous.state === "failed" || previous.health === "critical") && current.health !== "critical") {
    return MeshEvents.workerRecovered;
  }
  if (current.state === "starting" || (!previous && current.state !== "offline")) return MeshEvents.workerStarted;
  if (current.state === "offline" || current.state === "stopping") return MeshEvents.workerStopped;
  return MeshEvents.workerHeartbeat;
}
