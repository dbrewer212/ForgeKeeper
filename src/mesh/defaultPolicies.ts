import { MeshCapabilities } from "./catalog";
import type { PermissionRule } from "./types";

export const defaultPermissionRules: PermissionRule[] = [
  {
    id: "global-read-mesh-state",
    capabilityId: MeshCapabilities.meshReadState,
    effect: "allow",
    reason: "Registered workers may read shared mesh state.",
  },
  {
    id: "global-publish-events",
    capabilityId: MeshCapabilities.meshPublishEvent,
    effect: "allow",
    reason: "Registered workers may publish attributable events.",
  },
  {
    id: "global-request-resource",
    capabilityId: MeshCapabilities.meshRequestResource,
    effect: "allow",
    reason: "Resource use remains subject to the Resource Broker.",
  },
  {
    id: "global-canon-write",
    capabilityId: MeshCapabilities.foundryCanonWrite,
    effect: "approval-required",
    reason: "Canon changes require explicit human authority.",
  },
  {
    id: "global-manage-worker",
    capabilityId: MeshCapabilities.meshManageWorker,
    effect: "approval-required",
    reason: "Worker lifecycle changes require explicit authorization unless a later scoped policy permits them.",
  },
  {
    id: "global-enter-safe-mode",
    capabilityId: MeshCapabilities.meshEnterSafeMode,
    effect: "approval-required",
    reason: "Safe Mode changes system-wide behavior and defaults to human approval.",
  },
  {
    id: "production-steward-read-production",
    workerKind: "production-steward",
    capabilityId: MeshCapabilities.productionRead,
    effect: "allow",
  },
  {
    id: "production-steward-checkpoint",
    workerKind: "production-steward",
    capabilityId: MeshCapabilities.productionCheckpointCreate,
    effect: "allow",
  },
  {
    id: "production-steward-capture-thought",
    workerKind: "production-steward",
    capabilityId: MeshCapabilities.productionThoughtCapture,
    effect: "allow",
  },
  {
    id: "production-steward-recommend-next-action",
    workerKind: "production-steward",
    capabilityId: MeshCapabilities.productionRecommendNextAction,
    effect: "allow",
  },
  {
    id: "production-steward-advance-stage",
    workerKind: "production-steward",
    capabilityId: MeshCapabilities.productionAdvanceStage,
    effect: "approval-required",
    reason: "The Production Steward may recommend advancement; authoritative stage changes remain governed.",
  },
  {
    id: "watcher-read-telemetry",
    workerKind: "watcher",
    capabilityId: MeshCapabilities.watcherReadTelemetry,
    effect: "allow",
  },
  {
    id: "watcher-publish-finding",
    workerKind: "watcher",
    capabilityId: MeshCapabilities.watcherPublishFinding,
    effect: "allow",
  },
  {
    id: "watcher-suspend-heavy-compute",
    workerKind: "watcher",
    capabilityId: MeshCapabilities.watcherSuspendHeavyCompute,
    effect: "approval-required",
    reason: "Automatic protective suspension can later be enabled by an explicit scoped policy.",
  },
];
