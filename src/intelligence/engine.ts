import type { FoundryModelOutput, FoundryModelRouter, ModelPrivacyMode, ModelTaskClass } from "./modelProvider";
import type { FoundryPlanValidator, PlanValidationResult } from "./planValidator";
import type { FoundryIntelligenceRequestAssembler, FoundryIntelligenceRequestEnvelope } from "./requestAssembler";

export interface FoundryIntelligenceEngineRequest {
  text: string;
  taskClass?: ModelTaskClass;
  privacyMode?: ModelPrivacyMode;
  preferredProviderId?: string;
  focusEntityIds?: string[];
}

export interface IntelligenceEvidenceIssue {
  code: string;
  message: string;
  referenceId: string;
}

export interface FoundryIntelligenceProposal {
  schemaVersion: 1;
  request: FoundryIntelligenceRequestEnvelope;
  provider: { id: string; name: string; locality: "local" | "cloud"; model?: string };
  output: FoundryModelOutput;
  outputIssues: string[];
  evidenceIssues: IntelligenceEvidenceIssue[];
  planValidation?: PlanValidationResult;
  proposalValid: boolean;
  executionPerformed: false;
}

export class FoundryIntelligenceEngine {
  constructor(
    private readonly requests: FoundryIntelligenceRequestAssembler,
    private readonly models: FoundryModelRouter,
    private readonly plans: FoundryPlanValidator,
  ) {}

  async propose(input: FoundryIntelligenceEngineRequest): Promise<FoundryIntelligenceProposal> {
    const taskClass = input.taskClass ?? "conversation";
    const envelope = await this.requests.assemble({ text: input.text, focusEntityIds: input.focusEntityIds });
    const provider = await this.models.select({
      taskClass,
      privacyMode: input.privacyMode,
      preferredProviderId: input.preferredProviderId,
    });
    const descriptor = provider.descriptor();
    const output = await provider.generate({
      taskClass,
      envelope,
      instructions: modelInstructions(taskClass),
    });
    const outputIssues = validateOutput(output);
    const evidenceIssues = validateEvidence(output, envelope);
    const planValidation = output.plan ? this.plans.validate(output.plan) : undefined;
    const proposalValid = outputIssues.length === 0 && evidenceIssues.length === 0 && (planValidation?.valid ?? true);

    return {
      schemaVersion: 1,
      request: envelope,
      provider: {
        id: descriptor.id,
        name: descriptor.name,
        locality: descriptor.locality,
        model: descriptor.model,
      },
      output,
      outputIssues,
      evidenceIssues,
      planValidation,
      proposalValid,
      executionPerformed: false,
    };
  }
}

function modelInstructions(taskClass: ModelTaskClass): string {
  return [
    `Task class: ${taskClass}.`,
    "Use only the supplied current context, experience records, and candidate governed skills as operational evidence.",
    "Never claim that an action has been executed.",
    "If proposing action, return a structured plan using only registered skill ids from the request envelope.",
    "Do not invent OS commands, filesystem paths, applications, equipment state, or capabilities.",
    "Cite supporting World Model entity ids and Experience Memory record ids in the structured evidence fields.",
    "The Mesh tool gateway performs final permission, approval, execution, and verification outside the model.",
  ].join(" ");
}

function validateOutput(output: FoundryModelOutput): string[] {
  const issues: string[] = [];
  if (output.schemaVersion !== 1) issues.push("Unsupported model-output schema version.");
  if (!output.response?.trim()) issues.push("Model response is empty.");
  if (!output.intent?.trim()) issues.push("Model intent is empty.");
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) {
    issues.push("Model confidence must be a finite value between 0 and 1.");
  }
  if (!Array.isArray(output.evidenceEntityIds)) issues.push("Model evidenceEntityIds must be an array.");
  if (!Array.isArray(output.evidenceExperienceIds)) issues.push("Model evidenceExperienceIds must be an array.");
  if (!Array.isArray(output.assumptions)) issues.push("Model assumptions must be an array.");
  return issues;
}

function validateEvidence(output: FoundryModelOutput, envelope: FoundryIntelligenceRequestEnvelope): IntelligenceEvidenceIssue[] {
  const availableEntities = new Set(envelope.context.entities.map((entity) => entity.id));
  const availableExperience = new Set(envelope.experience.map((record) => record.id));
  const issues: IntelligenceEvidenceIssue[] = [];

  for (const id of output.evidenceEntityIds ?? []) {
    if (!availableEntities.has(id)) {
      issues.push({ code: "evidence.entity.unknown", message: `Model cited World Model entity ${id} that was not present in its request context.`, referenceId: id });
    }
  }
  for (const id of output.evidenceExperienceIds ?? []) {
    if (!availableExperience.has(id)) {
      issues.push({ code: "evidence.experience.unknown", message: `Model cited Experience Memory record ${id} that was not present in its request context.`, referenceId: id });
    }
  }
  return issues;
}
