import { invoke } from "@tauri-apps/api/core";
import { getUncertainDesktopRemoteCommands } from "../foundry-link/desktopCommandJournal";
import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";
import type { WorkerIdentity } from "./types";
import { resolveTrustedWorkstationLocation } from "./workstationLocations";

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
      description: "Launch a configured application on the Windows Foundry workstation through a trusted host-side launcher id.",
      risk: "moderate",
      operational: {
        owner: "foundry-core",
        reversibility: "conditionally-reversible",
        preconditions: ["Requester is the paired Mobile Foundry console.", "Launcher id is registered as a trusted workstation target."],
        sideEffects: ["Starts a workstation application and may consume CPU, memory, GPU, and disk resources."],
        verification: ["Trusted native launcher returns success; later application-state verification may enrich this contract."],
      },
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

  runtime.tools.register<{ locationId: "foundry-library" | "asset-root" }, { opened: true }>(
    {
      name: "workstation.open_path",
      capabilityId: MeshCapabilities.workstationOpenPath,
      description: "Open a host-configured Foundry location by trusted id; remote clients never supply a filesystem path.",
      risk: "low",
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        preconditions: ["Requester is the paired Mobile Foundry console.", "Location id resolves through the trusted workstation registry."],
        sideEffects: ["Opens a local folder/location in the workstation user session."],
        verification: ["Trusted path resolution succeeds and native open command returns success."],
      },
      inputSchema: {
        type: "object",
        properties: { locationId: { type: "string", enum: ["foundry-library", "asset-root"] } },
        required: ["locationId"],
        additionalProperties: false,
      },
    },
    async ({ locationId }, _request, worker) => {
      requirePairedMobile(worker);
      const path = resolveTrustedWorkstationLocation(locationId);
      await invoke("open_path", { path });
      return { opened: true };
    },
  );

  runtime.tools.register<Record<string, never>, unknown>(
    {
      name: "workstation.telemetry",
      capabilityId: MeshCapabilities.watcherReadTelemetry,
      description: "Read current Windows host telemetry through Watcher, which remains the workstation sensing authority.",
      risk: "read",
      inputSchema: { type: "object", additionalProperties: false },
      audit: false,
      operational: {
        owner: "watcher",
        reversibility: "reversible",
        verification: ["Returns Watcher's current observation set and active findings."],
        notes: ["Does not invoke an independent native telemetry path."],
      },
    },
    async (_payload, _request, worker) => {
      requirePairedMobile(worker);
      if (runtime.watcher.getCurrent().length === 0) await runtime.watcher.pollNow();
      return {
        running: runtime.watcher.isRunning(),
        updatedAt: runtime.watcher.updatedAt(),
        observations: runtime.watcher.getCurrent(),
        findings: runtime.watcher.getActiveFindings(),
      };
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
      operational: {
        owner: "bastion",
        reversibility: "reversible",
        verification: ["Returns a read-only projection of Mesh, Watcher, approval, and uncertain-command state."],
      },
    },
    async (_payload, _request, worker) => {
      requirePairedMobile(worker);
      let telemetry: unknown;
      let telemetryError: string | undefined;
      try {
        if (runtime.watcher.getCurrent().length === 0) await runtime.watcher.pollNow();
        telemetry = {
          running: runtime.watcher.isRunning(),
          updatedAt: runtime.watcher.updatedAt(),
          observations: runtime.watcher.getCurrent(),
          findings: runtime.watcher.getActiveFindings(),
        };
      } catch (cause) {
        telemetryError = cause instanceof Error ? cause.message : String(cause);
      }
      return {
        sampledAt: new Date().toISOString(),
        health: runtime.getSystemHealth(),
        safeMode: runtime.isSafeMode(),
        workers: runtime.workers.list(),
        services: runtime.services.list(),
        resources: runtime.resources.listStates(),
        pendingApprovals: runtime.approvals.list("pending").length,
        telemetry,
        telemetryError,
        uncertainRemoteCommands: getUncertainDesktopRemoteCommands().map((command) => ({
          id: command.id,
          correlationId: command.correlationId,
          requestedAtMs: command.requestedAtMs,
          operation: command.operation,
          toolName: command.payload.toolName,
        })),
      };
    },
  );
}
