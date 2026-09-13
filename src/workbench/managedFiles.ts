import { invoke } from "@tauri-apps/api/core";

export type ManagedFileResult = {
  sourcePath: string;
  managedPath: string;
  sha256: string;
  sizeBytes: number;
  reusedExisting: boolean;
  scaleFactor?: number;
  targetHeightMm?: number;
};

export async function storeManagedWorkbenchFile(
  sourcePath: string,
  expectedSha256: string,
  targetHeightMm?: number,
): Promise<ManagedFileResult> {
  return invoke<ManagedFileResult>("workbench_store_file", {
    sourcePath,
    expectedSha256,
    targetHeightMm,
  });
}
