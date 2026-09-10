import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionGateway, DEFAULT_APPROVAL_TTL_MS } from "./actionGateway";
import { MeshCapabilities } from "./catalog";
import { defaultPermissionRules } from "./defaultPolicies";
import { InMemoryPermissionService } from "./permissionService";
import type { ActionRequest, WorkerIdentity } from "./types";
import { FoundryWorkers } from "./workers";

const worker: WorkerIdentity = {
  id: "forgekeeper-mobile",
  name: "Mobile Foundry",
  kind: "forgekeeper",
  capabilities: ["system.service.restart"],
  enabled: true,
};

const request: ActionRequest = {
  id: "request-1",
  requestedAt: "2026-09-04T16:00:00.000Z",
  requesterWorkerId: worker.id,
  capabilityId: "system.service.restart",
  operationId: "system.service.restart",
  risk: "moderate",
  payload: { serviceId: "openclaw-service" },
  state: "requested",
  reason: "Restart OpenClaw after a failed health probe.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ActionGateway approvals", () => {
  it("assigns a bounded expiry to approval-required actions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T16:05:00.000Z"));
    const gateway = new ActionGateway(new InMemoryPermissionService());

    const evaluation = gateway.evaluate(worker, request);

    expect(evaluation.permission.effect).toBe("approval-required");
    expect(evaluation.approval?.requestedAt).toBe("2026-09-04T16:05:00.000Z");
    expect(Date.parse(evaluation.approval!.expiresAt!) - Date.parse(evaluation.approval!.requestedAt)).toBe(DEFAULT_APPROVAL_TTL_MS);
    expect(evaluation.approval?.summary).toBe(request.reason);
  });

  it("keeps Mobile Foundry Safe Mode authority aligned with advertised capabilities", () => {
    const permissions = new InMemoryPermissionService(defaultPermissionRules);
    const mobile = FoundryWorkers.forgekeeperMobile;

    expect(permissions.evaluate(mobile, MeshCapabilities.meshEnterSafeMode).effect).toBe("allow");
    expect(permissions.evaluate(mobile, MeshCapabilities.meshExitSafeMode).effect).toBe("approval-required");
  });
});
