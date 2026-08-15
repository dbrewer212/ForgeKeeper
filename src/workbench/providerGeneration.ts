import { expectedGenerationCredits, type PrintPalQuality } from "../lib/generationBudget";
import {
  getGenerationStatus,
  submitMeshyImageGeneration,
  submitPrintPalImageGeneration,
  type GenerationStatus,
  type GenerationSubmission,
  type ProviderKey,
} from "../lib/generationProviders";
import { WORKBENCH_EVENT_SCHEMA_VERSION, type WorkbenchEvent } from "./events";
import { WorkbenchRepository } from "./repository";

export type SubmitWorkbenchGenerationInput = {
  apiFilePath: string;
  assetId: string;
  provider: ProviderKey;
  imagePath: string;
  printPalQuality?: PrintPalQuality;
  meshyShouldTexture?: boolean;
  meshyTargetPolycount?: number;
};

export type WorkbenchGenerationSubmission = GenerationSubmission & {
  assetId: string;
  authorizedCredits: number;
};

function id(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

export class WorkbenchProviderGenerationService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly actorId = "forgekeeper:local-owner",
  ) {}

  async submit(input: SubmitWorkbenchGenerationInput): Promise<WorkbenchGenerationSubmission> {
    const apiFilePath = input.apiFilePath.trim();
    const imagePath = input.imagePath.trim();
    if (!apiFilePath) throw new Error("Link the local API credential file before submitting generation work.");
    if (!imagePath) throw new Error("A source image path is required for provider generation.");

    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === input.assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${input.assetId}`);

    const quality = input.printPalQuality ?? "superplus";
    const shouldTexture = Boolean(input.meshyShouldTexture);
    const authorizedCredits = expectedGenerationCredits(input.provider, quality, shouldTexture);
    if (!Number.isFinite(authorizedCredits)) throw new Error("Generation settings do not have a valid credit authorization ceiling.");

    const submission = input.provider === "printpal"
      ? await submitPrintPalImageGeneration(apiFilePath, imagePath, {
          quality,
          format: "stl",
          authorizedCredits,
        })
      : await submitMeshyImageGeneration(apiFilePath, imagePath, {
          shouldTexture,
          enablePbr: false,
          targetPolycount: input.meshyTargetPolycount ?? 100_000,
          authorizedCredits,
        });

    const event: WorkbenchEvent = {
      eventId: id("event"),
      eventType: "provider.generation.submitted",
      timestamp: new Date().toISOString(),
      actorId: this.actorId,
      correlationId: `provider-job:${input.provider}:${submission.jobId}`,
      projectId: asset.owningProjectId,
      assetId: asset.assetId,
      schemaVersion: WORKBENCH_EVENT_SCHEMA_VERSION,
      payload: {
        provider: input.provider,
        externalJobId: submission.jobId,
        sourceImagePath: imagePath,
        authorizedCredits,
        expectedCredits: authorizedCredits,
        printPalQuality: input.provider === "printpal" ? quality : undefined,
        meshyShouldTexture: input.provider === "meshy" ? shouldTexture : undefined,
        meshyTargetPolycount: input.provider === "meshy" ? input.meshyTargetPolycount ?? 100_000 : undefined,
        submissionStatus: submission.status,
      },
    };
    await this.repository.appendEvent(event);

    return { ...submission, assetId: asset.assetId, authorizedCredits };
  }

  async status(apiFilePath: string, assetId: string, provider: ProviderKey, jobId: string): Promise<GenerationStatus> {
    const status = await getGenerationStatus(apiFilePath.trim(), provider, jobId.trim());
    if (isTerminal(status.status)) {
      const state = await this.repository.loadState();
      const asset = state.assets.find((item) => item.assetId === assetId);
      if (asset) {
        const event: WorkbenchEvent = {
          eventId: id("event"),
          eventType: "provider.generation.terminal",
          timestamp: new Date().toISOString(),
          actorId: this.actorId,
          correlationId: `provider-job:${provider}:${jobId}`,
          projectId: asset.owningProjectId,
          assetId,
          schemaVersion: WORKBENCH_EVENT_SCHEMA_VERSION,
          payload: {
            provider,
            externalJobId: jobId,
            status: status.status,
            progress: status.progress,
            creditsUsed: status.creditsUsed,
            error: status.error,
            outputFormats: Object.keys(status.outputUrls ?? {}),
          },
        };
        await this.repository.appendEvent(event);
      }
    }
    return status;
  }
}

function isTerminal(status: string): boolean {
  return ["succeeded", "success", "completed", "complete", "finished", "failed", "failure", "error", "cancelled", "canceled", "rejected"]
    .includes(status.trim().toLowerCase());
}

let singleton: WorkbenchProviderGenerationService | null = null;
export function getWorkbenchProviderGenerationService(): WorkbenchProviderGenerationService {
  singleton ??= new WorkbenchProviderGenerationService();
  return singleton;
}
