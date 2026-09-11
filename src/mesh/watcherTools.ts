import type { WatcherObservationDomain } from "../watcher/contracts";
import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

const watcherDomains: WatcherObservationDomain[] = [
  "host",
  "cpu",
  "gpu",
  "memory",
  "storage",
  "process",
  "service",
  "network",
  "software",
  "foundry",
  "equipment",
];

export function registerWatcherTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ domain?: WatcherObservationDomain }, unknown>(
    {
      name: "watcher.get_telemetry",
      capabilityId: MeshCapabilities.watcherReadTelemetry,
      description: "Read Watcher's current normalized observations and active deterministic findings. Raw polling remains owned by Watcher and missing providers remain explicitly unavailable.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", enum: watcherDomains },
        },
        additionalProperties: false,
      },
    },
    ({ domain }) => ({
      running: runtime.watcher.isRunning(),
      updatedAt: runtime.watcher.updatedAt(),
      observations: runtime.watcher.getCurrent(domain),
      activeFindings: runtime.watcher.getActiveFindings(domain),
    }),
  );

  runtime.tools.register<{ domain?: WatcherObservationDomain }, unknown>(
    {
      name: "watcher.refresh",
      capabilityId: MeshCapabilities.watcherReadTelemetry,
      description: "Request a fresh Watcher observation cycle and return the current normalized telemetry and active deterministic findings. This is a read-only native sensing operation.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", enum: watcherDomains },
        },
        additionalProperties: false,
      },
    },
    async ({ domain }) => {
      await runtime.watcher.pollNow();
      return {
        running: runtime.watcher.isRunning(),
        updatedAt: runtime.watcher.updatedAt(),
        observations: runtime.watcher.getCurrent(domain),
        activeFindings: runtime.watcher.getActiveFindings(domain),
      };
    },
  );
}
