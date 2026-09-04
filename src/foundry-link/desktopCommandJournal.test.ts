import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDesktopRemoteCommandJournalForTests,
  completeDesktopRemoteCommand,
  getJournaledDesktopRemoteCommandResult,
  getStagedDesktopRemoteCommands,
  rememberDesktopRemoteCommandResult,
  stageDesktopRemoteCommands,
} from "./desktopCommandJournal";
import type { FoundryRemoteCommand, FoundryRemoteCommandResult } from "./remoteCommands";

const storage = new Map<string, string>();

function command(id: string, sequence: number): FoundryRemoteCommand {
  return {
    id,
    requestedAtMs: 1_000 + sequence,
    expiresAtMs: 60_000,
    operation: "mesh.tool",
    payload: { toolName: "bastion.mobile_snapshot", input: {} },
    correlationId: id,
    requestingDeviceId: "device-a",
    sequence,
  };
}

function result(commandId: string): FoundryRemoteCommandResult {
  return {
    commandId,
    requestingDeviceId: "device-a",
    correlationId: commandId,
    completedAtMs: 2_000,
    state: "completed",
    result: { ok: true },
  };
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  clearDesktopRemoteCommandJournalForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop Foundry Link command journal", () => {
  it("persists taken commands in server sequence order and deduplicates redelivery", () => {
    expect(stageDesktopRemoteCommands([command("two", 2), command("one", 1)])).toBe(true);
    expect(stageDesktopRemoteCommands([command("one", 1)])).toBe(true);

    expect(getStagedDesktopRemoteCommands().map((item) => item.id)).toEqual(["one", "two"]);
  });

  it("persists the execution result so publication can retry without executing again", () => {
    stageDesktopRemoteCommands([command("one", 1)]);
    expect(rememberDesktopRemoteCommandResult(result("one"))).toBe(true);

    expect(getJournaledDesktopRemoteCommandResult("one")?.state).toBe("completed");
    expect(getStagedDesktopRemoteCommands()).toHaveLength(1);
  });

  it("clears the command and cached result only after publication succeeds", () => {
    stageDesktopRemoteCommands([command("one", 1)]);
    rememberDesktopRemoteCommandResult(result("one"));

    expect(completeDesktopRemoteCommand("one")).toBe(true);
    expect(getStagedDesktopRemoteCommands()).toEqual([]);
    expect(getJournaledDesktopRemoteCommandResult("one")).toBeUndefined();
  });

  it("fails closed when the recovery journal cannot be persisted", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error("disk unavailable"); },
        removeItem: () => undefined,
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(stageDesktopRemoteCommands([command("one", 1)])).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
