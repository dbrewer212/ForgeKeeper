export type WorkerId = string;
export type CapabilityId = string;
export type ResourceId = string;
export type EventType = string;

export type WorkerKind =
  | "foundry-core"
  | "forgekeeper"
  | "production-steward"
  | "watcher"
  | "bastion"
  | "openclaw"
  | "odysseus"
  | "ollama"
  | "codex"
  | "chatgpt"
  | "service"
  | "other";

export type WorkerLifecycleState =
  | "offline"
  | "starting"
  | "idle"
  | "active"
  | "busy"
  | "degraded"
  | "stopping"
  | "failed";

export type HealthState = "nominal" | "busy" | "degraded" | "critical" | "safe-mode";

export type PermissionEffect = "allow" | "deny" | "approval-required";
export type ActionRisk = "read" | "low" | "moderate" | "high" | "critical";
export type ActionState = "requested" | "approved" | "denied" | "executing" | "completed" | "failed";
export type ResourcePressure = "normal" | "elevated" | "high" | "critical";

export interface WorkerCapability {
  id: CapabilityId;
  name: string;
  description?: string;
  risk: ActionRisk;
}

export interface WorkerIdentity {
  id: WorkerId;
  name: string;
  kind: WorkerKind;
  version?: string;
  description?: string;
  capabilities: CapabilityId[];
  enabled: boolean;
}

export interface WorkerStatus {
  workerId: WorkerId;
  state: WorkerLifecycleState;
  health: HealthState;
  currentActivity?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  state: HealthState;
  summary: string;
  updatedAt: string;
  degradedWorkers: WorkerId[];
  criticalWorkers: WorkerId[];
  safeModeReason?: string;
}

export interface ResourceState {
  id: ResourceId;
  name: string;
  pressure: ResourcePressure;
  utilizationPercent?: number;
  used?: number;
  capacity?: number;
  unit?: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface FoundryEvent<TPayload = unknown> {
  id: string;
  type: EventType;
  occurredAt: string;
  sourceWorkerId: WorkerId;
  correlationId?: string;
  causationId?: string;
  subjectId?: string;
  payload: TPayload;
}

export interface PermissionRule {
  id: string;
  workerId?: WorkerId;
  workerKind?: WorkerKind;
  capabilityId: CapabilityId;
  effect: PermissionEffect;
  reason?: string;
}

export interface PermissionDecision {
  effect: PermissionEffect;
  matchedRuleId?: string;
  reason: string;
}

export interface ActionRequest<TPayload = unknown> {
  id: string;
  requestedAt: string;
  requesterWorkerId: WorkerId;
  capabilityId: CapabilityId;
  risk: ActionRisk;
  payload: TPayload;
  state: ActionState;
  reason?: string;
  correlationId?: string;
}

export interface ActionResult<TResult = unknown> {
  requestId: string;
  state: Extract<ActionState, "completed" | "failed" | "denied">;
  completedAt: string;
  result?: TResult;
  error?: string;
}

export interface ApprovalRequest<TPayload = unknown> {
  id: string;
  actionRequestId: string;
  requestedAt: string;
  requestedByWorkerId: WorkerId;
  capabilityId: CapabilityId;
  summary: string;
  payload: TPayload;
  expiresAt?: string;
}

export interface Checkpoint<TState = unknown> {
  id: string;
  createdAt: string;
  createdByWorkerId: WorkerId;
  scope: string;
  subjectId?: string;
  summary: string;
  state: TState;
  metadata?: Record<string, unknown>;
}

export interface ResourceRequest {
  id: string;
  requestedAt: string;
  requesterWorkerId: WorkerId;
  resourceId: ResourceId;
  priority: number;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceLease {
  id: string;
  requestId: string;
  workerId: WorkerId;
  resourceId: ResourceId;
  grantedAt: string;
  expiresAt?: string;
}

export interface RegisteredWorker {
  identity: WorkerIdentity;
  status: WorkerStatus;
}
