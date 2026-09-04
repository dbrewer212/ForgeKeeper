import { invoke } from "@tauri-apps/api/core";
import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";
import type { WorkerIdentity } from "./types";

function requirePairedMobile(worker: WorkerIdentity) {
  if (worker.id !== "forgekeeper-mobile") {
    throw new Error(`Workstation remote action ${worker.id} is not the paired Mobile Foundry console.`);
  }
}

export function registerWorkstationTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ launcherId: "orca" | "anycubic" | "blender" }, { launched: true }>(
    {
      name: "workstation.launch_tool",
      capabilityId: MeshCapabilities.workstationLaunchTool,
      description: "Launch a configured application on the Windows Foundry workstation, optionally with a linked asset path.",
      risk: "moderate",
      inputSchema: {
        type: "object",
        properties: {
          launcherId: { type: "string", enum: ["orca", "anycubic", "blender"] },
        },
        required: ["launcherId"],
        additionalProperties: false,
      },
    },
    async ({ launcherId }, _request, worker) => {
      requirePairedMobile(worker);
      await invoke("launch_trusted_tool", { launcherId });
      return { launched: true };
    },
  );

  runtime.tools.register<{ locationId: string }, { opened: true }>(
    {
      name: "workstation.open_path",
      capabilityId: MeshCapabilities.workstationOpenPath,
      description: "Ask the desktop Foundry workstation to open a linked local file or folder.",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: { locationId: { type: "string" } },
        required: ["locationId"],
        additionalProperties: false,
      },
    },
    async ({ locationId }, _request, worker) => {
      requirePairedMobile(worker);
      throw new Error(`Managed Foundry location '${locationId}' is not registered on this host.`);
    },
  );

  runtime.tools.register<Record<string, never>, unknown>(
    {
      name: "workstation.telemetry",
      capabilityId: MeshCapabilities.watcherReadTelemetry,
      description: "Read current Windows host telemetry through Watcher's native provider.",
      risk: "read",
      inputSchema: { type: "object", additionalProperties: false },
      audit: false,
    },
    async (_payload, _request, worker) => {
      requirePairedMobile(worker);
      return invoke("watcher_system_snapshot");
    },
  );

  runtime.tools.register<Record<string, never>, unknown>(
    {
      name: "bastion.mobile_snapshot",
      capabilityId: MeshCapabilities.meshReadState,
      description: "Return a consolidated Bastion supervisory snapshot for the paired mobile console.",
      risk: "read",
      inputSchema: { type: "object", additionalProperties: false },
      audit: false,
    },
    async (_payload, _request, worker) => {
      requirePairedMobile(worker);
      const telemetry = await invoke("watcher_system_snapshot").catch(() => undefined);
      return {
        sampledAt: new Date().toISOString(),
        health: runtime.getSystemHealth(),
        safeMode: runtime.isSafeMode(),
        workers: runtime.workers.list(),
        services: runtime.services.list(),
        resources: runtime.resources.listStates(),
        pendingApprovals: runtime.approvals.list("pending").length,
        telemetry,
      };
    },
  );
}
