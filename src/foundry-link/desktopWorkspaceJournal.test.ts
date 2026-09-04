import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDesktopPendingWorkspaceJournalForTests,
  completeDesktopPendingWorkspace,
  getStagedDesktopPendingWorkspace,
  stageDesktopPendingWorkspace,
} from "./desktopWorkspaceJournal";
import type { FoundryLinkWorkspaceEnvelope } from "./workspaceSync";

const storage = new Map<string, string>();

function envelope(revision = 7): FoundryLinkWorkspaceEnvelope {
  return {
    revision,
    payload: JSON.stringify({ format: "forgekeeper.foundry-link", revision }),
    updatedAtMs: 1_000 + revision,
    sourceDeviceId: "mobile-a",
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
  clearDesktopPendingWorkspaceJournalForTests();
});

afterEach(() => vi.unstubAllGlobals());

describe("desktop Foundry Link workspace journal", () => {
  it("stages an accepted remote workspace until desktop apply succeeds", () => {
    expect(stageDesktopPendingWorkspace(envelope())).toBe(true);
    expect(getStagedDesktopPendingWorkspace()?.revision).toBe(7);
  });

  it("only clears the revision that was actually applied", () => {
    stageDesktopPendingWorkspace(envelope(7));
    expect(completeDesktopPendingWorkspace(6)).toBe(false);
    expect(getStagedDesktopPendingWorkspace()?.revision).toBe(7);
    expect(completeDesktopPendingWorkspace(7)).toBe(true);
    expect(getStagedDesktopPendingWorkspace()).toBeNull();
  });

  it("fails closed when pending workspace staging cannot be persisted", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error("disk unavailable"); },
        removeItem: () => undefined,
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(stageDesktopPendingWorkspace(envelope())).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
