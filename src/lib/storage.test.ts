import { describe, expect, it } from "vitest";
import type Database from "@tauri-apps/plugin-sql";
import type { AppData } from "../types/domain";
import { seedCanonRecords } from "../data/seed";
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

function expectSeedCanon(result: AppData | null) {
  expect(result?.canonRecords).toBeDefined();
  expect(result?.canonRecords.map((record) => record.id)).toEqual(expect.arrayContaining(seedCanonRecords.map((record) => record.id)));
}

describe("historical SQLite workspace compatibility", () => {
  it("reads the original Foundry payload_json schema and adds current canon", async () => {
    const data = { filament: [{ id: "F1" }] };
    const result = await loadHistoricalWorkspace(
      databaseFor(["workspace_id", "schema_version", "payload_json"], { payload_json: JSON.stringify(data) }),
    );
    expect(result?.filament).toEqual(data.filament);
    expectSeedCanon(result);
  });

  it("reads the prerelease census payload schema and adds current canon", async () => {
    const data = { filament: [{ id: "FF-SP-000001" }] };
    const result = await loadHistoricalWorkspace(
      databaseFor(["id", "schema_version", "payload"], { payload: JSON.stringify(data) }),
    );
    expect(result?.filament).toEqual(data.filament);
    expectSeedCanon(result);
  });

  it("treats a missing historical table as an empty workspace", async () => {
    await expect(loadHistoricalWorkspace(databaseFor([], null))).resolves.toBeNull();
  });

  it("preserves a newer fallback intake over older native data while adding current canon", () => {
    const fallback = { filament: [{ id: "FF-SP-000001" }] };
    const native = { filament: [{ id: "F1" }] };
    const result = selectStartupWorkspace(fallback as AppData, native as AppData);
    expect(result?.filament).toEqual(fallback.filament);
    expectSeedCanon(result);
  });

  it("preserves stored canon fields while adding newly introduced canon records", () => {
    const emberSeed = seedCanonRecords.find((record) => record.id === "CANON-EMBERWHELP");
    expect(emberSeed).toBeDefined();
    const storedEmber = { ...emberSeed!, notes: "Stored operator note remains authoritative." };
    const result = selectStartupWorkspace({ canonRecords: [storedEmber] } as AppData, null);
    const ember = result?.canonRecords.find((record) => record.id === "CANON-EMBERWHELP");
    expect(ember?.notes).toBe("Stored operator note remains authoritative.");
    expectSeedCanon(result);
  });
});
