import type {
  FoundryModelOutput,
  FoundryModelProvider,
  FoundryModelProviderDescriptor,
  FoundryModelRequest,
} from "./modelProvider";

export interface OllamaStructuredRequest {
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export interface OllamaStructuredTransport {
  probe(): Promise<{ available: boolean; detail?: string }>;
  generateStructured(request: OllamaStructuredRequest): Promise<unknown>;
}

export interface OllamaFoundryProviderOptions {
  model: string;
  enabled?: boolean;
  providerId?: string;
  name?: string;
}

export class OllamaFoundryProvider implements FoundryModelProvider {
  private readonly id: string;
  private readonly name: string;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor(
    private readonly transport: OllamaStructuredTransport,
    options: OllamaFoundryProviderOptions,
  ) {
    this.model = options.model.trim();
    if (!this.model) throw new Error("Ollama Foundry provider requires a model name.");
    this.id = options.providerId?.trim() || "ollama-local";
    this.name = options.name?.trim() || "Ollama Local Inference";
    this.enabled = options.enabled ?? true;
  }

  descriptor(): FoundryModelProviderDescriptor {
    return {
      id: this.id,
      name: this.name,
      locality: "local",
      enabled: this.enabled,
      model: this.model,
      supportsStructuredOutput: true,
      taskClasses: ["conversation", "planning", "diagnosis", "summarization"],
    };
  }

  probe(): Promise<{ available: boolean; detail?: string }> {
    return this.transport.probe();
  }

  async generate(request: FoundryModelRequest): Promise<FoundryModelOutput> {
    const raw = await this.transport.generateStructured({
      model: this.model,
      system: buildSystemPrompt(request),
      prompt: JSON.stringify(request.envelope),
      schema: foundryModelOutputSchema(),
    });
    return parseFoundryModelOutput(raw);
  }
}

export function foundryModelOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "number", enum: [1] },
      response: { type: "string" },
      intent: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      evidenceEntityIds: { type: "array", items: { type: "string" } },
      evidenceExperienceIds: { type: "array", items: { type: "string" } },
      assumptions: { type: "array", items: { type: "string" } },
      plan: {
        type: ["object", "null"],
        properties: {
          schemaVersion: { type: "number", enum: [1] },
          goal: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                skillId: { type: "string" },
                arguments: { type: "object" },
                rationale: { type: "string" },
                expectedOutcome: { type: "string" },
              },
              required: ["id", "skillId", "arguments", "rationale", "expectedOutcome"],
              additionalProperties: false,
            },
          },
        },
        required: ["schemaVersion", "goal", "steps"],
        additionalProperties: false,
      },
    },
    required: ["schemaVersion", "response", "intent", "confidence", "evidenceEntityIds", "evidenceExperienceIds", "assumptions"],
    additionalProperties: false,
  };
}

function buildSystemPrompt(request: FoundryModelRequest): string {
  return [
    "You are an inference provider inside Foundry Intelligence, not an execution authority.",
    request.instructions,
    "Return only output conforming to the supplied structured schema.",
    "Never claim an action happened unless the supplied request envelope contains verified historical evidence that it already happened.",
    "A proposed plan is advisory until the Foundry Mesh validates, authorizes, executes, and verifies it.",
  ].join(" ");
}

function parseFoundryModelOutput(raw: unknown): FoundryModelOutput {
  const value = unwrapObject(raw);
  if (!value) throw new Error("Ollama returned a non-object structured response.");

  const output: FoundryModelOutput = {
    schemaVersion: value.schemaVersion === 1 ? 1 : Number(value.schemaVersion) as 1,
    response: typeof value.response === "string" ? value.response : "",
    intent: typeof value.intent === "string" ? value.intent : "",
    confidence: typeof value.confidence === "number" ? value.confidence : Number(value.confidence),
    evidenceEntityIds: stringArray(value.evidenceEntityIds),
    evidenceExperienceIds: stringArray(value.evidenceExperienceIds),
    assumptions: stringArray(value.assumptions),
    plan: parsePlan(value.plan),
  };

  if (!Number.isFinite(output.confidence)) output.confidence = -1;
  return output;
}

function parsePlan(value: unknown): FoundryModelOutput["plan"] {
  if (value === undefined || value === null) return undefined;
  const record = unwrapObject(value);
  if (!record) return undefined;
  const steps = Array.isArray(record.steps)
    ? record.steps.map((step, index) => {
        const item = unwrapObject(step) ?? {};
        return {
          id: typeof item.id === "string" ? item.id : `invalid-step-${index + 1}`,
          skillId: typeof item.skillId === "string" ? item.skillId : "",
          arguments: unwrapObject(item.arguments) ?? {},
          rationale: typeof item.rationale === "string" ? item.rationale : "",
          expectedOutcome: typeof item.expectedOutcome === "string" ? item.expectedOutcome : "",
        };
      })
    : [];
  return {
    schemaVersion: record.schemaVersion === 1 ? 1 : Number(record.schemaVersion) as 1,
    goal: typeof record.goal === "string" ? record.goal : "",
    steps,
  };
}

function unwrapObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
