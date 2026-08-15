import { invoke } from "@tauri-apps/api/core";

export type ManagedFileResult = {
  sourcePath: string;
  managedPath: string;
  sha256: string;
  sizeBytes: number;
  reusedExisting: boolean;
};

export async function storeManagedWorkbenchFile(
  sourcePath: string,
  expectedSha256: string,
): Promise<ManagedFileResult> {
  return invoke<ManagedFileResult>("workbench_store_file", {
    sourcePath,
    expectedSha256,
  });
}
