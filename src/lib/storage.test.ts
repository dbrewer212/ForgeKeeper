import { describe, expect, it } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import type { AppData } from "../types/domain";
import { loadHistoricalWorkspace, selectStartupWorkspace } from "./storage";

type ReadableDatabase = Pick<Database, "select">;

function databaseFor(columns: string[], record: object | null): ReadableDatabase {
  return {
    select: async <T>(query: string) => {
      if (query.startsWith("PRAGMA")) return columns.map((name) => ({ name })) as T;
      return (record ? [record] : []) as T;
    },
  } as ReadableDatabase;
}

describe("historical SQLite workspace compatibility", () => {
  it("reads the original Foundry payload_json schema", async () => {
    const data = { filament: [{ id: "F1" }] };
    const result = await loadHistoricalWorkspace(
      databaseFor(["workspace_id", "schema_version", "payload_json"], { payload_json: JSON.stringify(data) }),
    );
    expect(result).toEqual(data);
  });

  it("reads the prerelease census payload schema", async () => {
    const data = { filament: [{ id: "FF-SP-000001" }] };
    const result = await loadHistoricalWorkspace(
      databaseFor(["id", "schema_version", "payload"], { payload: JSON.stringify(data) }),
    );
    expect(result).toEqual(data);
  });

  it("treats a missing historical table as an empty workspace", async () => {
    await expect(loadHistoricalWorkspace(databaseFor([], null))).resolves.toBeNull();
  });

  it("preserves a newer fallback intake over older native data", () => {
    const fallback = { filament: [{ id: "FF-SP-000001" }] };
    const native = { filament: [{ id: "F1" }] };
    expect(selectStartupWorkspace(fallback as AppData, native as AppData)).toBe(fallback);
  });
});
