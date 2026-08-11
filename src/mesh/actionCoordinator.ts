import type { ActionEvaluation } from "./actionGateway";
import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
import type { FoundryMeshRuntime } from "./runtime";
import type {
  ActionRequest,
  ActionResult,
  WorkerIdentity,
} from "./types";

export type ActionHandler<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  request: ActionRequest<TPayload>,
  worker: WorkerIdentity,
) => Promise<TResult> | TResult;

export interface CoordinatedAction<TPayload = unknown> {
  evaluation: ActionEvaluation<TPayload>;
  result?: ActionResult;
}

export class MeshActionCoordinator {
  private readonly handlers = new Map<string, ActionHandler>();

  constructor(private readonly runtime: FoundryMeshRuntime) {}

  registerHandler<TPayload, TResult>(capabilityId: string, handler: ActionHandler<TPayload, TResult>): void {
    this.handlers.set(capabilityId, handler as ActionHandler);
  }

  unregisterHandler(capabilityId: string): void {
    this.handlers.delete(capabilityId);
  }

  async submit<TPayload>(request: ActionRequest<TPayload>): Promise<CoordinatedAction<TPayload>> {
    const registered = this.runtime.workers.get(request.requesterWorkerId);
    if (!registered) {
      const result = deniedResult(request.id, `Worker ${request.requesterWorkerId} is not registered.`);
      await this.publishResult(MeshEvents.actionDenied, request.requesterWorkerId, request, result);
      return {
        evaluation: {
          request: { ...request, state: "denied" },
          permission: { effect: "deny", reason: result.error ?? "Unregistered worker." },
        },
        result,
      };
    }

    const evaluation = this.runtime.actions.evaluate(registered.identity, request);

    if (evaluation.permission.effect === "deny") {
      const result = deniedResult(request.id, evaluation.permission.reason);
      await this.publishResult(MeshEvents.actionDenied, registered.identity.id, request, result);
      await this.runtime.save();
      return { evaluation, result };
    }

    if (evaluation.approval) {
      this.runtime.approvals.enqueue(evaluation.approval, request);
      await this.runtime.events.publish(
        createFoundryEvent({
          type: MeshEvents.actionApprovalRequested,
          sourceWorkerId: registered.identity.id,
          subjectId: request.id,
          correlationId: request.correlationId,
          payload: evaluation.approval,
        }),
      );
      await this.runtime.save();
      return { evaluation };
    }

    const result = await this.execute(registered.identity, evaluation.request);
    await this.runtime.save();
    return { evaluation, result };
  }

  async approve(approvalId: string, reason?: string): Promise<ActionResult> {
    const approval = this.runtime.approvals.approve(approvalId, reason);
    const request = approval.actionRequest;
    if (!request) {
      throw new Error(`Approval ${approvalId} predates durable action storage and cannot be resumed safely.`);
    }

    const registered = this.runtime.workers.get(request.requesterWorkerId);
    if (!registered) throw new Error(`Worker ${request.requesterWorkerId} is no longer registered.`);

    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.actionApproved,
        sourceWorkerId: "foundry-core",
        subjectId: request.id,
        correlationId: request.correlationId,
        payload: { approvalId, reason },
      }),
    );

    const result = await this.execute(registered.identity, { ...request, state: "approved" });
    await this.runtime.save();
    return result;
  }

  async deny(approvalId: string, reason?: string): Promise<ActionResult> {
    const approval = this.runtime.approvals.deny(approvalId, reason);
    const request = approval.actionRequest;
    const requestId = request?.id ?? approval.request.actionRequestId;
    const result = deniedResult(requestId, reason ?? "Denied by human authority.");

    await this.runtime.events.publish(
      createFoundryEvent({
        type: MeshEvents.actionDenied,
        sourceWorkerId: "foundry-core",
        subjectId: requestId,
        correlationId: request?.correlationId,
        payload: { approvalId, result },
      }),
    );
    await this.runtime.save();
    return result;
  }

  private async execute(worker: WorkerIdentity, request: ActionRequest): Promise<ActionResult> {
    const handler = this.handlers.get(request.capabilityId);
    if (!handler) {
      const result: ActionResult = {
        requestId: request.id,
        state: "failed",
        completedAt: new Date().toISOString(),
        error: `No handler is registered for capability ${request.capabilityId}.`,
      };
      await this.publishResult(MeshEvents.actionFailed, worker.id, request, result);
      return result;
    }

    try {
      const value = await handler(request.payload, { ...request, state: "executing" }, worker);
      const result: ActionResult = {
        requestId: request.id,
        state: "completed",
        completedAt: new Date().toISOString(),
        result: value,
      };
      await this.publishResult(MeshEvents.actionCompleted, worker.id, request, result);
      return result;
    } catch (error) {
      const result: ActionResult = {
        requestId: request.id,
        state: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      await this.publishResult(MeshEvents.actionFailed, worker.id, request, result);
      return result;
    }
  }

  private async publishResult(
    type: string,
    sourceWorkerId: string,
    request: ActionRequest,
    result: ActionResult,
  ): Promise<void> {
    await this.runtime.events.publish(
      createFoundryEvent({
        type,
        sourceWorkerId,
        subjectId: request.id,
        correlationId: request.correlationId,
        payload: result,
      }),
    );
  }
}

function deniedResult(requestId: string, reason: string): ActionResult {
  return {
    requestId,
    state: "denied",
    completedAt: new Date().toISOString(),
    error: reason,
  };
}
