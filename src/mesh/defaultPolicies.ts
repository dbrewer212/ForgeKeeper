import { MeshCapabilities } from "./catalog";
import type { PermissionRule } from "./types";

export const defaultPermissionRules: PermissionRule[] = [
  { id: "global-read-mesh-state", capabilityId: MeshCapabilities.meshReadState, effect: "allow", reason: "Registered workers may read shared mesh state." },
  { id: "global-publish-events", capabilityId: MeshCapabilities.meshPublishEvent, effect: "allow", reason: "Registered workers may publish attributable events." },
  { id: "global-request-resource", capabilityId: MeshCapabilities.meshRequestResource, effect: "allow", reason: "Resource use remains subject to the Resource Broker." },
  { id: "global-canon-write", capabilityId: MeshCapabilities.foundryCanonWrite, effect: "approval-required", reason: "Canon changes require explicit human authority." },
  { id: "global-production-write", capabilityId: MeshCapabilities.productionWrite, effect: "approval-required", reason: "Authoritative production state changes require explicit authority unless a scoped worker policy permits them." },
  { id: "global-session-write", capabilityId: MeshCapabilities.foundrySessionWrite, effect: "approval-required", reason: "Session state changes are governed unless a scoped continuity worker is explicitly permitted." },
  { id: "global-decision-write", capabilityId: MeshCapabilities.foundryDecisionWrite, effect: "approval-required", reason: "Durable decision records require explicit authority." },
  { id: "global-manage-worker", capabilityId: MeshCapabilities.meshManageWorker, effect: "approval-required", reason: "Worker lifecycle changes require explicit authorization unless a later scoped policy permits them." },
  { id: "global-enter-safe-mode", capabilityId: MeshCapabilities.meshEnterSafeMode, effect: "approval-required", reason: "Safe Mode changes system-wide behavior and defaults to human approval." },
  { id: "global-exit-safe-mode", capabilityId: MeshCapabilities.meshExitSafeMode, effect: "approval-required", reason: "Returning autonomous execution after Safe Mode requires explicit human authority." },

  { id: "production-steward-read-production", workerKind: "production-steward", capabilityId: MeshCapabilities.productionRead, effect: "allow" },
  { id: "production-steward-write-production", workerKind: "production-steward", capabilityId: MeshCapabilities.productionWrite, effect: "allow", reason: "The Production Steward may maintain next-action and blocker state inside an active governed production workflow." },
  { id: "production-steward-session-read", workerKind: "production-steward", capabilityId: MeshCapabilities.foundrySessionRead, effect: "allow" },
  { id: "production-steward-session-write", workerKind: "production-steward", capabilityId: MeshCapabilities.foundrySessionWrite, effect: "allow", reason: "The Production Steward may maintain session continuity and re-entry state." },
  { id: "production-steward-decision-read", workerKind: "production-steward", capabilityId: MeshCapabilities.foundryDecisionRead, effect: "allow" },
  { id: "production-steward-checkpoint", workerKind: "production-steward", capabilityId: MeshCapabilities.productionCheckpointCreate, effect: "allow" },
  { id: "production-steward-capture-thought", workerKind: "production-steward", capabilityId: MeshCapabilities.productionThoughtCapture, effect: "allow" },
  { id: "production-steward-recommend-next-action", workerKind: "production-steward", capabilityId: MeshCapabilities.productionRecommendNextAction, effect: "allow" },
  { id: "production-steward-advance-stage", workerKind: "production-steward", capabilityId: MeshCapabilities.productionAdvanceStage, effect: "approval-required", reason: "The Production Steward may recommend advancement; authoritative stage changes remain governed." },

  { id: "forgekeeper-session-read", workerKind: "forgekeeper", capabilityId: MeshCapabilities.foundrySessionRead, effect: "allow" },
  { id: "forgekeeper-decision-read", workerKind: "forgekeeper", capabilityId: MeshCapabilities.foundryDecisionRead, effect: "allow" },
  { id: "mobile-console-telemetry", workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.watcherReadTelemetry, effect: "allow", reason: "A paired human-operated mobile console may inspect workstation telemetry." },
  { id: "mobile-console-launch-tool", workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.workstationLaunchTool, effect: "allow", reason: "A paired human-operated mobile console may launch configured Foundry workstation tools." },
  { id: "mobile-console-open-path", workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.workstationOpenPath, effect: "allow", reason: "A paired human-operated mobile console may ask the workstation to open a configured local asset or folder." },
  { id: "mobile-console-enter-safe-mode", workerId: "forgekeeper-mobile", capabilityId: MeshCapabilities.meshEnterSafeMode, effect: "allow", reason: "A paired human-operated mobile console may immediately reduce Foundry authority by entering protective Safe Mode; leaving Safe Mode remains approval-governed." },

  { id: "odysseus-session-read", workerKind: "odysseus", capabilityId: MeshCapabilities.foundrySessionRead, effect: "allow" },
  { id: "odysseus-session-write", workerKind: "odysseus", capabilityId: MeshCapabilities.foundrySessionWrite, effect: "allow", reason: "Odysseus may preserve user-driven session and re-entry context while commissioned." },
  { id: "odysseus-decision-read", workerKind: "odysseus", capabilityId: MeshCapabilities.foundryDecisionRead, effect: "allow" },

  { id: "openclaw-session-read", workerKind: "openclaw", capabilityId: MeshCapabilities.foundrySessionRead, effect: "allow" },

  { id: "watcher-read-telemetry", workerKind: "watcher", capabilityId: MeshCapabilities.watcherReadTelemetry, effect: "allow" },
  { id: "watcher-publish-finding", workerKind: "watcher", capabilityId: MeshCapabilities.watcherPublishFinding, effect: "allow" },
  { id: "watcher-suspend-heavy-compute", workerKind: "watcher", capabilityId: MeshCapabilities.watcherSuspendHeavyCompute, effect: "approval-required", reason: "Automatic protective suspension can later be enabled by an explicit scoped policy." },
];
