import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

export function registerServiceTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ serviceId: string }, unknown>(
    {
      name: "system.service.start",
      capabilityId: MeshCapabilities.systemServiceStart,
      description: "Start a staged managed service after commissioning and dependency checks pass.",
      risk: "moderate",
      inputSchema: {
        type: "object",
        properties: { serviceId: { type: "string" } },
        required: ["serviceId"],
        additionalProperties: false,
      },
    },
    ({ serviceId }, _request, worker) => runtime.serviceLifecycle.start(serviceId, worker.id),
  );

  runtime.tools.register<{ serviceId: string }, unknown>(
    {
      name: "system.service.stop",
      capabilityId: MeshCapabilities.systemServiceStop,
      description: "Stop a managed service. This remains permitted during Safe Mode.",
      risk: "high",
      inputSchema: {
        type: "object",
        properties: { serviceId: { type: "string" } },
        required: ["serviceId"],
        additionalProperties: false,
      },
    },
    ({ serviceId }, _request, worker) => runtime.serviceLifecycle.stop(serviceId, worker.id),
  );

  runtime.tools.register<{ serviceId: string }, unknown>(
    {
      name: "system.service.restart",
      capabilityId: MeshCapabilities.systemServiceRestart,
      description: "Restart a commissioned managed service after dependency checks pass.",
      risk: "high",
      inputSchema: {
        type: "object",
        properties: { serviceId: { type: "string" } },
        required: ["serviceId"],
        additionalProperties: false,
      },
    },
    ({ serviceId }, _request, worker) => runtime.serviceLifecycle.restart(serviceId, worker.id),
  );

  runtime.tools.register<{ serviceId: string }, unknown>(
    {
      name: "system.service.probe",
      capabilityId: MeshCapabilities.meshReadState,
      description: "Run the registered health probe for a staged managed service without changing commissioning authority.",
      risk: "read",
      inputSchema: {
        type: "object",
        properties: { serviceId: { type: "string" } },
        required: ["serviceId"],
        additionalProperties: false,
      },
      audit: false,
    },
    ({ serviceId }, _request, worker) => runtime.serviceLifecycle.probe(serviceId, worker.id),
  );
}
