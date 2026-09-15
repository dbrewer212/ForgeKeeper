import type { FoundryPlan } from "./planValidator";
import type { FoundryIntelligenceRequestEnvelope } from "./requestAssembler";

export type ModelLocality = "local" | "cloud";
export type ModelTaskClass = "conversation" | "planning" | "diagnosis" | "summarization";
export type ModelPrivacyMode = "local-only" | "local-preferred" | "cloud-allowed";

export interface FoundryModelProviderDescriptor {
  id: string;
  name: string;
  locality: ModelLocality;
  enabled: boolean;
  model?: string;
  supportsStructuredOutput: boolean;
  taskClasses: ModelTaskClass[];
}

export interface FoundryModelRequest {
  taskClass: ModelTaskClass;
  envelope: FoundryIntelligenceRequestEnvelope;
  instructions: string;
}

export interface FoundryModelOutput {
  schemaVersion: 1;
  response: string;
  intent: string;
  confidence: number;
  evidenceEntityIds: string[];
  evidenceExperienceIds: string[];
  assumptions: string[];
  plan?: FoundryPlan;
}

export interface FoundryModelProvider {
  descriptor(): FoundryModelProviderDescriptor;
  probe(): Promise<{ available: boolean; detail?: string }>;
  generate(request: FoundryModelRequest): Promise<FoundryModelOutput>;
}

export interface ModelRouteRequest {
  taskClass: ModelTaskClass;
  privacyMode?: ModelPrivacyMode;
  preferredProviderId?: string;
}

export class FoundryModelRouter {
  private readonly providers = new Map<string, FoundryModelProvider>();

  register(provider: FoundryModelProvider): void {
    const descriptor = provider.descriptor();
    if (!descriptor.id.trim()) throw new Error("Model provider id is required.");
    this.providers.set(descriptor.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  list(): FoundryModelProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => structuredClone(provider.descriptor()));
  }

  async select(request: ModelRouteRequest): Promise<FoundryModelProvider> {
    const privacyMode = request.privacyMode ?? "local-preferred";
    const candidates = [...this.providers.values()]
      .filter((provider) => {
        const descriptor = provider.descriptor();
        if (!descriptor.enabled || !descriptor.supportsStructuredOutput) return false;
        if (!descriptor.taskClasses.includes(request.taskClass)) return false;
        if (privacyMode === "local-only" && descriptor.locality !== "local") return false;
        return true;
      })
      .sort((a, b) => routeScore(b.descriptor(), request) - routeScore(a.descriptor(), request));

    for (const provider of candidates) {
      const probe = await provider.probe().catch((error) => ({
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      }));
      if (probe.available) return provider;
    }

    throw new Error(`No commissioned model provider is available for ${request.taskClass} under ${privacyMode}.`);
  }
}

function routeScore(descriptor: FoundryModelProviderDescriptor, request: ModelRouteRequest): number {
  let score = 0;
  if (request.preferredProviderId && descriptor.id === request.preferredProviderId) score += 1000;
  if ((request.privacyMode ?? "local-preferred") === "local-preferred" && descriptor.locality === "local") score += 100;
  if (descriptor.locality === "local") score += 10;
  return score;
}
