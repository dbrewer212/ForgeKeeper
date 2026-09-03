import { getFoundryMeshRuntime } from "../mesh";

const MOBILE_QUEUE_KEY = "forgekeeper.foundry-link.remote-commands.mobile.v1";
const DESKTOP_RESULTS_KEY = "forgekeeper.foundry-link.remote-results.desktop.v1";
const MOBILE_RESULTS_KEY = "forgekeeper.foundry-link.remote-results.mobile.v1";
const MAX_RESULTS = 40;
const MAX_COMMANDS = 30;
const DEFAULT_COMMAND_TTL_MS = 5 * 60 * 1000;

export type FoundryRemoteCommand = {
  id: string;
  requestedAt: string;
  expiresAt: string;
  action: "mesh.tool" | "mesh.approve" | "mesh.deny";
  toolName?: string;
  payload?: unknown;
  approvalId?: string;
  reason?: string;
};

export type FoundryRemoteCommandResult = {
  commandId: string;
  completedAt: string;
  state: "completed" | "failed" | "denied" | "approval-required";
  result?: unknown;
  error?: string;
  approvalId?: string;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (cause) {
    console.error(`Could not persist Foundry Link command state ${key}:`, cause);
  }
}

function expiresAt(ttlMs = DEFAULT_COMMAND_TTL_MS): string {
  return new Date(Date.now() + Math.max(5_000, ttlMs)).toISOString();
}

function isExpired(command: Pick<FoundryRemoteCommand, "expiresAt">): boolean {
  return Date.parse(command.expiresAt) <= Date.now();
}

function pruneExpiredQueue(commands: FoundryRemoteCommand[]): FoundryRemoteCommand[] {
  return commands.filter((command) => !isExpired(command)).slice(-MAX_COMMANDS);
}

export function getPendingRemoteCommands(): FoundryRemoteCommand[] {
  const commands = readJson<FoundryRemoteCommand[]>(MOBILE_QUEUE_KEY, []);
  const retained = pruneExpiredQueue(commands);
  if (retained.length !== commands.length) writeJson(MOBILE_QUEUE_KEY, retained);
  return retained;
}

export function hasPendingRemoteCommands(): boolean {
  return getPendingRemoteCommands().length > 0;
}

export function queueRemoteTool(
  toolName: string,
  payload: unknown = {},
  reason?: string,
  ttlMs = DEFAULT_COMMAND_TTL_MS,
): FoundryRemoteCommand {
  const command: FoundryRemoteCommand = {
    id: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    expiresAt: expiresAt(ttlMs),
    action: "mesh.tool",
    toolName,
    payload,
    reason,
  };
  writeJson(MOBILE_QUEUE_KEY, [...getPendingRemoteCommands(), command].slice(-MAX_COMMANDS));
  return command;
}

export function queueRemoteApproval(
  approvalId: string,
  approve: boolean,
  reason?: string,
  ttlMs = DEFAULT_COMMAND_TTL_MS,
): FoundryRemoteCommand {
  const command: FoundryRemoteCommand = {
    id: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    expiresAt: expiresAt(ttlMs),
    action: approve ? "mesh.approve" : "mesh.deny",
    approvalId,
    reason,
  };
  writeJson(MOBILE_QUEUE_KEY, [...getPendingRemoteCommands(), command].slice(-MAX_COMMANDS));
  return command;
}

export function getDesktopRemoteCommandResults(): FoundryRemoteCommandResult[] {
  return readJson<FoundryRemoteCommandResult[]>(DESKTOP_RESULTS_KEY, []);
}

export function getMobileRemoteCommandResults(): FoundryRemoteCommandResult[] {
  return readJson<FoundryRemoteCommandResult[]>(MOBILE_RESULTS_KEY, []);
}

export function absorbRemoteCommandResults(results: FoundryRemoteCommandResult[] | undefined) {
  if (!results?.length) return;
  const existing = getMobileRemoteCommandResults();
  const merged = new Map(existing.map((item) => [item.commandId, item]));
  for (const item of results) merged.set(item.commandId, item);
  const retained = [...merged.values()]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, MAX_RESULTS);
  writeJson(MOBILE_RESULTS_KEY, retained);

  const completedIds = new Set(results.map((item) => item.commandId));
  writeJson(MOBILE_QUEUE_KEY, getPendingRemoteCommands().filter((item) => !completedIds.has(item.id)));
}

function storeDesktopResults(results: FoundryRemoteCommandResult[]) {
  const existing = getDesktopRemoteCommandResults();
  const merged = new Map(existing.map((item) => [item.commandId, item]));
  for (const item of results) merged.set(item.commandId, item);
  writeJson(
    DESKTOP_RESULTS_KEY,
    [...merged.values()].sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, MAX_RESULTS),
  );
}

export async function processRemoteCommands(commands: FoundryRemoteCommand[] | undefined): Promise<FoundryRemoteCommandResult[]> {
  if (!commands?.length) return [];
  const existing = new Map(getDesktopRemoteCommandResults().map((item) => [item.commandId, item]));
  const runtime = getFoundryMeshRuntime();
  await runtime.initialize();
  const produced: FoundryRemoteCommandResult[] = [];

  for (const command of commands.slice(-MAX_COMMANDS)) {
    const prior = existing.get(command.id);
    if (prior) {
      produced.push(prior);
      continue;
    }

    let result: FoundryRemoteCommandResult;
    try {
      if (isExpired(command)) {
        result = {
          commandId: command.id,
          completedAt: new Date().toISOString(),
          state: "denied",
          error: "Remote command expired before the workstation could execute it.",
        };
      } else if (command.action === "mesh.tool") {
        if (!command.toolName) throw new Error("Remote Mesh command is missing a tool name.");
        const invocation = await runtime.tools.invoke({
          toolName: command.toolName,
          requesterWorkerId: "forgekeeper-mobile",
          payload: command.payload ?? {},
          reason: command.reason ?? "Requested from paired Mobile Foundry console.",
          correlationId: command.id,
        });
        if (invocation.approvalId) {
          result = {
            commandId: command.id,
            completedAt: new Date().toISOString(),
            state: "approval-required",
            approvalId: invocation.approvalId,
            result: { toolName: command.toolName, permission: invocation.evaluation.permission },
          };
        } else if (invocation.result) {
          result = {
            commandId: command.id,
            completedAt: invocation.result.completedAt,
            state: invocation.result.state,
            result: invocation.result.result,
            error: invocation.result.error,
          };
        } else {
          throw new Error(`Remote Mesh tool ${command.toolName} returned no result or approval request.`);
        }
      } else {
        if (!command.approvalId) throw new Error("Remote approval command is missing an approval id.");
        const actionResult = command.action === "mesh.approve"
          ? await runtime.coordinator.approve(command.approvalId, command.reason ?? "Approved from paired Mobile Foundry console.")
          : await runtime.coordinator.deny(command.approvalId, command.reason ?? "Denied from paired Mobile Foundry console.");
        result = {
          commandId: command.id,
          completedAt: actionResult.completedAt,
          state: actionResult.state,
          result: actionResult.result,
          error: actionResult.error,
        };
      }
    } catch (cause) {
      result = {
        commandId: command.id,
        completedAt: new Date().toISOString(),
        state: "failed",
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }

    produced.push(result);
    existing.set(command.id, result);
  }

  storeDesktopResults(produced);
  return produced;
}
