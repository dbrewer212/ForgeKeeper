import type { ProviderKey } from "../lib/generationProviders";
import { getWorkbenchIntakeService, type IntakeResult } from "./intake";

export type ProviderIntakeRequest = {
  apiFilePath: string;
  provider: ProviderKey;
  jobId: string;
  assetId: string;
  format?: "stl" | "3mf" | "obj" | "glb" | "gltf";
  revisionLabel?: string;
};

export type ProviderIntakeResult = IntakeResult & {
  provider: ProviderKey;
  jobId: string;
  stagedPath: string;
};

type StagedGenerationAsset = {
  provider: ProviderKey;
  jobId: string;
  format: string;
  stagedPath: string;
};

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new Error("Provider Intake is available in the Forgekeeper desktop app.");
  const api = await import("@tauri-apps/api/core");
  return (api.invoke as InvokeFn)<T>(command, args);
}

export async function intakeCompletedProviderAsset(request: ProviderIntakeRequest): Promise<ProviderIntakeResult> {
  const apiFilePath = request.apiFilePath.trim();
  const jobId = request.jobId.trim();
  if (!apiFilePath) throw new Error("Link the local API credential file before importing provider output.");
  if (!jobId) throw new Error("Provider job ID is required.");
  if (!request.assetId.trim()) throw new Error("Select a target Workbench asset before importing provider output.");

  const staged = await invoke<StagedGenerationAsset>("workbench_stage_generation_asset", {
    apiFilePath,
    provider: request.provider,
    jobId,
    format: request.format ?? "stl",
  });

  try {
    const intake = await getWorkbenchIntakeService().registerLocalFile({
      assetId: request.assetId,
      filePath: staged.stagedPath,
      role: "geometry",
      provenance: {
        sourceType: request.provider,
        sourceLabel: request.provider === "meshy" ? "Meshy generated geometry" : "PrintPal generated geometry",
        sourceUri: `${request.provider}:job:${jobId}`,
        externalId: jobId,
        importedAt: new Date().toISOString(),
      },
      revisionLabel: request.revisionLabel?.trim() || `${request.provider}-${jobId}`,
      reason: `Controlled Intake of ${request.provider} generation job ${jobId}.`,
    });

    await invoke<void>("workbench_clear_provider_staging", { stagedPath: staged.stagedPath });
    return { ...intake, provider: request.provider, jobId, stagedPath: staged.stagedPath };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} Provider staging was preserved for diagnosis at ${staged.stagedPath}`);
  }
}
