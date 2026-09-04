import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absorbRemoteCommandResults,
  isRemoteCommandExpired,
  mergeRemoteCommandResults,
  sortRemoteCommandsForExecution,
  type FoundryRemoteCommand,
  type FoundryRemoteCommandResult,
} from "./remoteCommands";

function command(id: string, sequence: number | undefined, requestedAtMs: number): FoundryRemoteCommand {
  return {
    id,
    requestedAtMs,
    expiresAtMs: requestedAtMs + 60_000,
    operation: "mesh.tool",
    payload: { toolName: "bastion.mobile_snapshot", input: {} },
    correlationId: id,
    sequence,
  };
}

function result(commandId: string, completedAtMs: number): FoundryRemoteCommandResult {
  return {
    commandId,
    requestingDeviceId: "device-a",
    correlationId: commandId,
    completedAtMs,
    state: "completed",
    result: { commandId },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Foundry Link command semantics", () => {
  it("treats the TTL boundary as expired", () => {
    expect(isRemoteCommandExpired({ expiresAtMs: 10_000 }, 9_999)).toBe(false);
    expect(isRemoteCommandExpired({ expiresAtMs: 10_000 }, 10_000)).toBe(true);
    expect(isRemoteCommandExpired({ expiresAtMs: 10_000 }, 10_001)).toBe(true);
  });

  it("executes server-sequenced commands in FIFO order", () => {
    const ordered = sortRemoteCommandsForExecution([
      command("third", 3, 300),
      command("first", 1, 100),
      command("second", 2, 200),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("uses request time as a deterministic fallback when sequence is absent", () => {
    const ordered = sortRemoteCommandsForExecution([
      command("later", undefined, 200),
      command("earlier", undefined, 100),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("deduplicates result redelivery by command id and retains the newest payload", () => {
    const merged = mergeRemoteCommandResults(
      [result("one", 100), result("two", 200)],
      [{ ...result("one", 300), result: { refreshed: true } }],
    );

    expect(merged.map((item) => item.commandId)).toEqual(["one", "two"]);
    expect(merged[0].result).toEqual({ refreshed: true });
  });

  it("does not acknowledge workstation results when mobile persistence fails", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error("storage unavailable"); },
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(absorbRemoteCommandResults([result("one", 100)])).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("acknowledges results only after the durable mobile copy is written", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    expect(absorbRemoteCommandResults([result("one", 100)])).toEqual(["one"]);
    expect([...storage.values()].some((value) => value.includes('"commandId":"one"'))).toBe(true);
  });
});
