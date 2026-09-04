import { getFoundryMeshRuntime } from "../mesh";
import type { ActionRisk } from "../mesh/types";

const MOBILE_QUEUE_KEY = "forgekeeper.foundry-link.remote-commands.mobile.v2";
const MOBILE_RESULTS_KEY = "forgekeeper.foundry-link.remote-results.mobile.v2";
const MAX_RESULTS = 80;
const MAX_COMMANDS = 60;
export const DEFAULT_COMMAND_TTL_MS = 5 * 60 * 1000;

export type FoundryRemoteCommandAction = "mesh.tool" | "mesh.approve" | "mesh.deny";
export type FoundryRemoteCommand = {
  id: string; requestedAtMs: number; expiresAtMs: number; operation: FoundryRemoteCommandAction;
  payload: { toolName?: string; input?: unknown; approvalId?: string; reason?: string };
  correlationId: string; requestingDeviceId?: string; sequence?: number;
};

export type FoundryRemoteApprovalDetail = {
  id: string;
  requestedAt: string;
  expiresAt?: string;
  requestedByWorkerId: string;
  capabilityId: string;
  operationId?: string;
  risk: ActionRisk;
  summary: string;
  reason?: string;
  payload?: unknown;
};

export type FoundryRemoteCommandResult = {
  commandId: string; requestingDeviceId: string; correlationId: string; completedAtMs: number;
  state: "completed" | "failed" | "denied" | "approval-required";
  result?: unknown; error?: string; approvalId?: string; approval?: FoundryRemoteApprovalDetail;
};

function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (cause) {
    console.error(`Could not persist Foundry Link command state ${key}:`, cause);
    return false;
  }
}

export function isRemoteCommandExpired(command: Pick<FoundryRemoteCommand, "expiresAtMs">, now = Date.now()) {
  return command.expiresAtMs <= now;
}

export function sortRemoteCommandsForExecution(commands: FoundryRemoteCommand[]): FoundryRemoteCommand[] {
  return [...commands].sort((left, right) => {
    const sequenceDelta = (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER);
    if (sequenceDelta !== 0) return sequenceDelta;
    const requestedDelta = left.requestedAtMs - right.requestedAtMs;
    return requestedDelta !== 0 ? requestedDelta : left.id.localeCompare(right.id);
  });
}

export function mergeRemoteCommandResults(
  existing: FoundryRemoteCommandResult[],
  incoming: FoundryRemoteCommandResult[],
  limit = MAX_RESULTS,
): FoundryRemoteCommandResult[] {
  const merged = new Map(existing.map((item) => [item.commandId, item]));
  for (const result of incoming) merged.set(result.commandId, result);
  return [...merged.values()]
    .sort((left, right) => right.completedAtMs - left.completedAtMs)
    .slice(0, Math.max(0, limit));
}

export function getPendingRemoteCommands(): FoundryRemoteCommand[] {
  const commands = readJson<FoundryRemoteCommand[]>(MOBILE_QUEUE_KEY, []);
  const retained = commands.filter((command) => !isRemoteCommandExpired(command)).slice(-MAX_COMMANDS);
  if (retained.length !== commands.length) writeJson(MOBILE_QUEUE_KEY, retained);
  return retained;
}

export function hasPendingRemoteCommands() { return getPendingRemoteCommands().length > 0; }

function queue(operation: FoundryRemoteCommandAction, payload: FoundryRemoteCommand["payload"], ttlMs: number) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const command: FoundryRemoteCommand = {
    id,
    requestedAtMs: now,
    expiresAtMs: now + Math.max(5_000, ttlMs),
    operation,
    payload,
    correlationId: id,
  };
  writeJson(MOBILE_QUEUE_KEY, [...getPendingRemoteCommands(), command].slice(-MAX_COMMANDS));
  return command;
}

export function queueRemoteTool(toolName: string, input: unknown = {}, reason?: string, ttlMs = DEFAULT_COMMAND_TTL_MS) {
  return queue("mesh.tool", { toolName, input, reason }, ttlMs);
}

export function queueRemoteApproval(approvalId: string, approve: boolean, reason?: string, ttlMs = DEFAULT_COMMAND_TTL_MS) {
  return queue(approve ? "mesh.approve" : "mesh.deny", { approvalId, reason }, ttlMs);
}

export function markRemoteCommandsSubmitted(commandIds: string[]) {
  const submitted = new Set(commandIds);
  return writeJson(MOBILE_QUEUE_KEY, getPendingRemoteCommands().filter((command) => !submitted.has(command.id)));
}

export function getMobileRemoteCommandResults(): FoundryRemoteCommandResult[] {
  return readJson<FoundryRemoteCommandResult[]>(MOBILE_RESULTS_KEY, []);
}

export function absorbRemoteCommandResults(results: FoundryRemoteCommandResult[]): string[] {
  if (!results.length) return [];
  const merged = mergeRemoteCommandResults(getMobileRemoteCommandResults(), results);
  // The workstation keeps results until ACK. Never ACK data that failed to persist locally:
  // a storage failure must leave the server copy available for redelivery on the next sync.
  if (!writeJson(MOBILE_RESULTS_KEY, merged)) return [];
  return results.map((item) => item.commandId);
}

export async function processRemoteCommand(command: FoundryRemoteCommand): Promise<FoundryRemoteCommandResult> {
  const base = {
    commandId: command.id,
    requestingDeviceId: command.requestingDeviceId ?? "unknown-device",
    correlationId: command.correlationId,
    completedAtMs: Date.now(),
  };

  try {
    if (isRemoteCommandExpired(command)) {
      return { ...base, state: "denied", error: "Remote command expired before the workstation could execute it." };
    }

    const runtime = getFoundryMeshRuntime();
    await runtime.initialize();

    if (command.operation === "mesh.tool") {
      if (!command.payload.toolName) throw new Error("Remote Mesh command is missing a tool name.");
      const invocation = await runtime.tools.invoke({
        toolName: command.payload.toolName,
        requesterWorkerId: "forgekeeper-mobile",
        payload: command.payload.input ?? {},
        reason: command.payload.reason ?? "Requested from paired Mobile Foundry console.",
        correlationId: command.correlationId,
      });

      if (invocation.approvalId) {
        const request = invocation.evaluation.request;
        const approval = invocation.evaluation.approval;
        return {
          ...base,
          state: "approval-required",
          approvalId: invocation.approvalId,
          approval: approval ? {
            id: approval.id,
            requestedAt: approval.requestedAt,
            expiresAt: approval.expiresAt,
            requestedByWorkerId: approval.requestedByWorkerId,
            capabilityId: approval.capabilityId,
            operationId: request.operationId,
            risk: request.risk,
            summary: approval.summary,
            reason: request.reason,
            payload: approval.payload,
          } : undefined,
          result: { toolName: command.payload.toolName, permission: invocation.evaluation.permission },
        };
      }

      if (!invocation.result) throw new Error(`Remote Mesh tool ${command.payload.toolName} returned no result or approval request.`);
      return {
        ...base,
        completedAtMs: Date.parse(invocation.result.completedAt),
        state: invocation.result.state,
        result: invocation.result.result,
        error: invocation.result.error,
      };
    }

    if (!command.payload.approvalId) throw new Error("Remote approval command is missing an approval id.");
    const decision = command.operation === "mesh.approve"
      ? await runtime.coordinator.approve(command.payload.approvalId, command.payload.reason ?? "Approved from paired Mobile Foundry console.")
      : await runtime.coordinator.deny(command.payload.approvalId, command.payload.reason ?? "Denied from paired Mobile Foundry console.");
    return {
      ...base,
      completedAtMs: Date.parse(decision.completedAt),
      state: decision.state,
      approvalId: command.payload.approvalId,
      result: decision.result,
      error: decision.error,
    };
  } catch (cause) {
    return { ...base, state: "failed", error: cause instanceof Error ? cause.message : String(cause) };
  }
}
