import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";
import type { ResourceRequest } from "./types";

export function registerCoreMeshTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register(
    {
      name: "mesh.get_status",
      capabilityId: MeshCapabilities.meshReadState,
      description: "Read the current health, worker status, service state, resource pressure, and pending approval count for the Foundry mesh.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        verification: ["Read-only state projection; no mutation occurs."],
      },
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => ({
      health: runtime.getSystemHealth(),
      workers: runtime.workers.list(),
      services: runtime.services.list(),
      resources: runtime.resources.listStates(),
      pendingApprovals: runtime.approvals.list("pending").length,
      safeMode: runtime.isSafeMode(),
    }),
  );

  runtime.tools.register(
    {
      name: "mesh.list_tools",
      capabilityId: MeshCapabilities.meshReadState,
      description: "List the governed Foundry tools currently exposed to mesh workers.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        verification: ["Read-only tool catalog projection; no mutation occurs."],
      },
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.tools.list().map(({ name, capabilityId, description, risk, inputSchema, outputSchema, enabled, operational }) => ({
      name,
      capabilityId,
      description,
      risk,
      inputSchema,
      outputSchema,
      enabled,
      operational,
    })),
  );

  runtime.tools.register<{ reason: string }, { safeMode: boolean }>(
    {
      name: "mesh.enter_safe_mode",
      capabilityId: MeshCapabilities.meshEnterSafeMode,
      description: "Request that the Foundry mesh enter Safe Mode. This is governed and requires human approval by default.",
      risk: "critical",
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        sideEffects: ["Disables managed resource admission and cancels pending resource requests."],
        verification: ["Mesh reports safeMode=true after transition."],
        notes: ["Leaving Safe Mode is a separate governed action."],
      },
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string", description: "Reason Safe Mode is being requested." } },
        required: ["reason"],
        additionalProperties: false,
      },
    },
    async ({ reason }, _request, worker) => {
      await runtime.operations.enterSafeMode(reason, worker.id);
      return { safeMode: runtime.isSafeMode() };
    },
  );

  runtime.tools.register<Record<string, never>, { safeMode: boolean }>(
    {
      name: "mesh.exit_safe_mode",
      capabilityId: MeshCapabilities.meshExitSafeMode,
      description: "Request that the Foundry mesh leave Safe Mode. This is governed and requires human approval by default.",
      risk: "critical",
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        sideEffects: ["Re-enables managed resource admission."],
        verification: ["Mesh reports safeMode=false after transition."],
      },
      inputSchema: { type: "object", additionalProperties: false },
    },
    async (_payload, _request, worker) => {
      await runtime.operations.exitSafeMode(worker.id);
      return { safeMode: runtime.isSafeMode() };
    },
  );

  runtime.tools.register<
    { resourceId: string; priority: number; estimatedCost?: number; metadata?: Record<string, unknown> },
    { granted: boolean; lease?: unknown }
  >(
    {
      name: "mesh.request_resource",
      capabilityId: MeshCapabilities.meshRequestResource,
      description: "Request a lease on a managed compute or machine resource through the Foundry Resource Broker.",
      risk: "low",
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        preconditions: ["Requested resource must be registered and admission must be enabled."],
        sideEffects: ["May create a temporary managed resource lease."],
        verification: ["Returned lease, when granted, identifies the managed resource and requester."],
      },
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string" },
          priority: { type: "number" },
          estimatedCost: { type: "number" },
          metadata: { type: "object" },
        },
        required: ["resourceId", "priority"],
        additionalProperties: false,
      },
    },
    async (payload, _request, worker) => {
      const resourceRequest: ResourceRequest = {
        id: crypto.randomUUID(),
        requestedAt: new Date().toISOString(),
        requesterWorkerId: worker.id,
        resourceId: payload.resourceId,
        priority: payload.priority,
        estimatedCost: payload.estimatedCost,
        metadata: payload.metadata,
      };
      const lease = await runtime.operations.requestResource(resourceRequest);
      return { granted: Boolean(lease), lease: lease ?? undefined };
    },
  );
}
