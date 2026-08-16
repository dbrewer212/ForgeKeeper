import { describe, expect, it } from "vitest";
import { createBackupEnvelope, verifyBackupEnvelope } from "./recovery";
import type { AppData } from "../types/domain";

const workspace = {
  products: [], orders: [], filament: [], printers: [], filamentProfiles: [], materialTransactions: [],
  materialReservations: [], filamentDryingRecords: [], materialImportHistory: [],
} as unknown as AppData;

describe("verified material-operation backups", () => {
  it("creates and verifies a schema 3 SHA-256 envelope", async () => {
    const envelope = await createBackupEnvelope(workspace, "Material station test");
    expect(envelope.schemaVersion).toBe(3);
    await expect(verifyBackupEnvelope(envelope)).resolves.toMatchObject({ valid: true });
  });

  it("rejects a backup whose workspace changed after hashing", async () => {
    const envelope = await createBackupEnvelope(workspace, "Tamper test");
    envelope.data.filament = [{ id: "changed" }] as never;
    await expect(verifyBackupEnvelope(envelope)).resolves.toMatchObject({ valid: false, message: expect.stringContaining("checksum mismatch") });
  });

  it("accepts a verified schema 2 backup for migration", async () => {
    const envelope = await createBackupEnvelope(workspace, "Previous schema");
    envelope.schemaVersion = 2;
    await expect(verifyBackupEnvelope(envelope)).resolves.toMatchObject({ valid: true, message: expect.stringContaining("Legacy schema 2") });
  });
});
