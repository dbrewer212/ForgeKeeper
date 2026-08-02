export type ProviderKey = "meshy" | "printpal";

export type ProviderConnection = {
  provider: ProviderKey;
  configured: boolean;
  connected: boolean;
  credits: number | null;
  message: string;
};

export type ProviderConnectionReport = {
  meshy: ProviderConnection;
  printpal: ProviderConnection;
};

export type GenerationSubmission = {
  provider: ProviderKey;
  jobId: string;
  status: string;
  creditsUsed: number | null;
  creditsRemaining: number | null;
  statusUrl: string | null;
  downloadUrl: string | null;
};

export type GenerationStatus = {
  provider: ProviderKey;
  jobId: string;
  status: string;
  progress: number | null;
  creditsUsed: number | null;
  outputUrls: Record<string, string>;
  error: string | null;
};

export type DownloadedGenerationAsset = {
  provider: ProviderKey;
  jobId: string;
  format: string;
  outputPath: string;
};

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error("Provider connections are available in the Forgekeeper desktop app.");
  }
  const api = await import("@tauri-apps/api/core");
  return (api.invoke as InvokeFn)<T>(command, args);
}

export function testProviderConnections(apiFilePath: string) {
  return invoke<ProviderConnectionReport>("test_provider_connections", { apiFilePath });
}

export function submitMeshyImageGeneration(
  apiFilePath: string,
  imagePath: string,
  options: { shouldTexture?: boolean; enablePbr?: boolean; targetPolycount?: number } = {},
) {
  return invoke<GenerationSubmission>("submit_meshy_image_generation", {
    apiFilePath,
    imagePath,
    options,
  });
}

export function submitPrintPalImageGeneration(
  apiFilePath: string,
  imagePath: string,
  options: { quality?: string; format?: string } = {},
) {
  return invoke<GenerationSubmission>("submit_printpal_image_generation", {
    apiFilePath,
    imagePath,
    options,
  });
}

export function getGenerationStatus(apiFilePath: string, provider: ProviderKey, jobId: string) {
  return invoke<GenerationStatus>("get_generation_status", { apiFilePath, provider, jobId });
}

export function downloadGenerationAsset(apiFilePath: string, provider: ProviderKey, jobId: string, format: string, outputPath: string) {
  return invoke<DownloadedGenerationAsset>("download_generation_asset", { apiFilePath, provider, jobId, format, outputPath });
}
