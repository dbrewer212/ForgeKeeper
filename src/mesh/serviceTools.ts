import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

export function registerServiceTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ serviceId: string }, unknown>(
    {
      name: "system.service.start",
      capabilityId: MeshCapabilities.systemServiceStart,
      description: "Start a staged managed service after commissioning and dependency checks pass.",
      risk: "moderate",
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        preconditions: ["Service is commissioned for execution.", "Registered dependencies are active and online.", "Foundry is not in Safe Mode."],
        sideEffects: ["May spawn or activate a managed service and consume workstation resources."],
        verification: ["Service lifecycle reports online and synchronizes its worker heartbeat/health."],
      },
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
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        preconditions: ["Service has a registered runtime adapter."],
        sideEffects: ["Interrupts the selected managed service and any work depending on it."],
        verification: ["Service lifecycle reports offline and synchronizes its worker state."],
        notes: ["Externally managed services may refuse direct stop through the Mesh adapter."],
      },
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
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        preconditions: ["Service is commissioned for execution.", "Registered dependencies are active and online.", "Foundry is not in Safe Mode."],
        sideEffects: ["Temporarily interrupts the selected service and may interrupt dependent work."],
        verification: ["Restart completes with service online and worker health synchronized."],
      },
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
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        sideEffects: ["May update observed runtime state/last-probe metadata to reflect reality."],
        verification: ["Returns the registered service probe result."],
      },
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
