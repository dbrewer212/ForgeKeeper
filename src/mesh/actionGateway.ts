import type {
  ActionRequest,
  ApprovalRequest,
  PermissionDecision,
  WorkerIdentity,
} from "./types";
import type { PermissionService } from "./permissionService";

export const DEFAULT_APPROVAL_TTL_MS = 10 * 60 * 1000;

export interface ActionEvaluation<TPayload = unknown> {
  request: ActionRequest<TPayload>;
  permission: PermissionDecision;
  approval?: ApprovalRequest<TPayload>;
}

export class ActionGateway {
  constructor(private readonly permissions: PermissionService) {}

  evaluate<TPayload>(worker: WorkerIdentity, request: ActionRequest<TPayload>): ActionEvaluation<TPayload> {
    if (request.requesterWorkerId !== worker.id) {
      return {
        request: { ...request, state: "denied" },
        permission: {
          effect: "deny",
          reason: "Action requester does not match the evaluated worker identity.",
        },
      };
    }

    const permission = this.permissions.evaluate(worker, request.capabilityId);

    if (permission.effect === "deny") {
      return { request: { ...request, state: "denied" }, permission };
    }

    if (permission.effect === "approval-required") {
      const requestedAt = Date.now();
      return {
        request,
        permission,
        approval: {
          id: crypto.randomUUID(),
          actionRequestId: request.id,
          requestedAt: new Date(requestedAt).toISOString(),
          requestedByWorkerId: worker.id,
          capabilityId: request.capabilityId,
          summary: request.reason ?? `${worker.name} requests ${request.capabilityId}.`,
          payload: request.payload,
          expiresAt: new Date(requestedAt + DEFAULT_APPROVAL_TTL_MS).toISOString(),
        },
      };
    }

    return {
      request: { ...request, state: "approved" },
      permission,
    };
  }
}
