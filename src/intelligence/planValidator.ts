import type { FoundrySkillCatalog, FoundrySkillDescriptor } from "./skillCatalog";

export interface FoundryPlanStep {
  id: string;
  skillId: string;
  arguments: Record<string, unknown>;
  rationale: string;
  expectedOutcome: string;
}

export interface FoundryPlan {
  schemaVersion: 1;
  goal: string;
  steps: FoundryPlanStep[];
}

export type PlanValidationSeverity = "warning" | "error";

export interface PlanValidationIssue {
  severity: PlanValidationSeverity;
  code: string;
  message: string;
  stepId?: string;
  skillId?: string;
}

export interface PlanValidationResult {
  valid: boolean;
  issues: PlanValidationIssue[];
  resolvedSkills: Array<{ stepId: string; skill: FoundrySkillDescriptor }>;
}

export class FoundryPlanValidator {
  constructor(private readonly skills: FoundrySkillCatalog) {}

  validate(plan: FoundryPlan): PlanValidationResult {
    const issues: PlanValidationIssue[] = [];
    const resolvedSkills: Array<{ stepId: string; skill: FoundrySkillDescriptor }> = [];

    if (!plan.goal.trim()) {
      issues.push({ severity: "error", code: "plan.goal.missing", message: "Plan goal must be explicit." });
    }
    if (plan.steps.length === 0) {
      issues.push({ severity: "error", code: "plan.steps.empty", message: "Plan contains no steps." });
    }

    const seenStepIds = new Set<string>();
    for (const step of plan.steps) {
      if (!step.id.trim()) {
        issues.push({ severity: "error", code: "plan.step.id-missing", message: "Every plan step needs a stable id." });
        continue;
      }
      if (seenStepIds.has(step.id)) {
        issues.push({ severity: "error", code: "plan.step.id-duplicate", message: `Duplicate plan step id ${step.id}.`, stepId: step.id });
      }
      seenStepIds.add(step.id);

      const skill = this.skills.get(step.skillId);
      if (!skill) {
        issues.push({
          severity: "error",
          code: "plan.skill.unknown",
          message: `Plan step ${step.id} references unknown governed skill ${step.skillId}.`,
          stepId: step.id,
          skillId: step.skillId,
        });
        continue;
      }
      resolvedSkills.push({ stepId: step.id, skill });

      if (!skill.enabled) {
        issues.push({
          severity: "error",
          code: "plan.skill.disabled",
          message: `Governed skill ${skill.id} is disabled.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }

      if (skill.risk !== "read" && skill.owner === "unassigned") {
        issues.push({
          severity: "error",
          code: "plan.skill.owner-unknown",
          message: `Mutating skill ${skill.id} has no declared operational owner.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }

      if (skill.risk !== "read" && skill.reversibility === "unknown") {
        issues.push({
          severity: "warning",
          code: "plan.skill.reversibility-unknown",
          message: `Mutating skill ${skill.id} has unknown reversibility and must not be described as reversible.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }

      if ((skill.risk === "moderate" || skill.risk === "high" || skill.risk === "critical") && skill.verification.length === 0) {
        issues.push({
          severity: "error",
          code: "plan.skill.verification-missing",
          message: `Risk-bearing skill ${skill.id} has no declared verification method.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }

      if (!step.rationale.trim()) {
        issues.push({
          severity: "warning",
          code: "plan.step.rationale-missing",
          message: `Plan step ${step.id} has no rationale.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }
      if (!step.expectedOutcome.trim()) {
        issues.push({
          severity: "error",
          code: "plan.step.outcome-missing",
          message: `Plan step ${step.id} has no expected outcome to verify.`,
          stepId: step.id,
          skillId: skill.id,
        });
      }
    }

    return {
      valid: !issues.some((issue) => issue.severity === "error"),
      issues,
      resolvedSkills,
    };
  }
}
