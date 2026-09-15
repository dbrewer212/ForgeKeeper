import type { FoundryContextAssembler, FoundryContextPacket } from "./contextAssembler";
import type { ExperienceRecord, FoundryExperienceMemory } from "./experienceMemory";
import type { FoundrySkillCatalog, FoundrySkillDescriptor } from "./skillCatalog";

export interface FoundryIntelligenceRequest {
  text: string;
  focusEntityIds?: string[];
  maxContextEntities?: number;
  maxExperienceRecords?: number;
  maxCandidateSkills?: number;
}

export interface FoundryIntelligenceRequestEnvelope {
  schemaVersion: 1;
  requestId: string;
  assembledAt: string;
  text: string;
  context: FoundryContextPacket;
  experience: ExperienceRecord[];
  candidateSkills: FoundrySkillDescriptor[];
  constraints: {
    modelMayExecuteDirectly: false;
    executionAuthority: "mesh-tool-gateway";
    worldModelAuthority: "derived-read-model";
    experienceAuthority: "derived-event-projection";
    unknownSkillPolicy: "reject";
    finalPermissionEvaluation: "required-at-execution";
  };
}

export class FoundryIntelligenceRequestAssembler {
  constructor(
    private readonly context: FoundryContextAssembler,
    private readonly experience: FoundryExperienceMemory,
    private readonly skills: FoundrySkillCatalog,
  ) {}

  async assemble(request: FoundryIntelligenceRequest): Promise<FoundryIntelligenceRequestEnvelope> {
    const context = this.context.assemble({
      text: request.text,
      focusEntityIds: request.focusEntityIds,
      maxEntities: request.maxContextEntities,
    });
    const maxExperienceRecords = bound(request.maxExperienceRecords ?? 12, 0, 50);
    const maxCandidateSkills = bound(request.maxCandidateSkills ?? 24, 1, 100);
    const experience = maxExperienceRecords === 0
      ? []
      : await this.experience.search({ query: request.text, limit: maxExperienceRecords });
    const candidateSkills = selectSkills(this.skills.list(), request.text, maxCandidateSkills);

    return {
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      assembledAt: new Date().toISOString(),
      text: request.text,
      context,
      experience,
      candidateSkills,
      constraints: {
        modelMayExecuteDirectly: false,
        executionAuthority: "mesh-tool-gateway",
        worldModelAuthority: "derived-read-model",
        experienceAuthority: "derived-event-projection",
        unknownSkillPolicy: "reject",
        finalPermissionEvaluation: "required-at-execution",
      },
    };
  }
}

function selectSkills(skills: FoundrySkillDescriptor[], text: string, limit: number): FoundrySkillDescriptor[] {
  const tokens = tokenize(text);
  return skills
    .map((skill) => ({ skill, score: skillScore(skill, tokens) }))
    .filter(({ skill, score }) => skill.enabled && (score > 0 || skill.risk === "read"))
    .sort((a, b) => b.score - a.score || riskRank(a.skill.risk) - riskRank(b.skill.risk) || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limit)
    .map(({ skill }) => structuredClone(skill));
}

function skillScore(skill: FoundrySkillDescriptor, tokens: string[]): number {
  const searchable = `${skill.id} ${skill.capabilityId} ${skill.description} ${skill.owner}`.toLowerCase();
  const matches = tokens.reduce((score, token) => score + (searchable.includes(token) ? 10 : 0), 0);
  const exactIdTail = skill.id.split(".").some((part) => part.length >= 3 && tokens.includes(part.toLowerCase()));
  return matches + (exactIdTail ? 25 : 0);
}

function riskRank(risk: FoundrySkillDescriptor["risk"]): number {
  return { read: 0, low: 1, moderate: 2, high: 3, critical: 4 }[risk];
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9_.:-]+/).map((token) => token.trim()).filter((token) => token.length >= 3))];
}

function bound(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
