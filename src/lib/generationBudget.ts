import type { GenerationJobRecord, GenerationProvider } from "../types/domain";

export const PRINTPAL_CREDIT_COSTS = {
  default: 4,
  high: 6,
  ultra: 8,
  super: 20,
  superplus: 30,
} as const;

export type PrintPalQuality = keyof typeof PRINTPAL_CREDIT_COSTS;

export function expectedGenerationCredits(provider: GenerationProvider, quality: string, shouldTexture = false) {
  if (provider === "meshy") return shouldTexture ? 30 : 20;
  return PRINTPAL_CREDIT_COSTS[quality as PrintPalQuality] ?? Number.POSITIVE_INFINITY;
}

export function generationSpend(jobs: GenerationJobRecord[], productId: string) {
  const productJobs = jobs.filter((job) => job.productId === productId);
  const actual = productJobs.reduce((total, job) => total + (job.creditsUsed ?? 0), 0);
  const committed = productJobs.reduce(
    (total, job) => total + (job.creditsUsed ?? job.expectedCredits ?? 0),
    0,
  );
  return {
    attempts: productJobs.length,
    actual,
    committed,
    rejected: productJobs.filter((job) => job.reviewStatus === "rejected").length,
  };
}

export function isRetryStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  return ["failed", "failure", "rejected", "error", "cancelled", "canceled"].includes(normalized);
}
