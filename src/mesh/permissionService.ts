import type {
  PermissionDecision,
  PermissionRule,
  WorkerIdentity,
} from "./types";

export interface PermissionService {
  evaluate(worker: WorkerIdentity, capabilityId: string): PermissionDecision;
  addRule(rule: PermissionRule): void;
  removeRule(ruleId: string): void;
  listRules(): PermissionRule[];
}

export class InMemoryPermissionService implements PermissionService {
  private readonly rules = new Map<string, PermissionRule>();

  constructor(initialRules: PermissionRule[] = []) {
    for (const rule of initialRules) this.rules.set(rule.id, rule);
  }

  addRule(rule: PermissionRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  listRules(): PermissionRule[] {
    return [...this.rules.values()];
  }

  evaluate(worker: WorkerIdentity, capabilityId: string): PermissionDecision {
    if (!worker.enabled) {
      return { effect: "deny", reason: `Worker ${worker.name} is disabled.` };
    }

    if (!worker.capabilities.includes(capabilityId)) {
      return {
        effect: "deny",
        reason: `Worker ${worker.name} does not advertise capability ${capabilityId}.`,
      };
    }

    const candidates = [...this.rules.values()].filter(
      (rule) =>
        rule.capabilityId === capabilityId &&
        (rule.workerId === worker.id || rule.workerKind === worker.kind || (!rule.workerId && !rule.workerKind)),
    );

    const exactWorkerRule = candidates.find((rule) => rule.workerId === worker.id);
    const kindRule = candidates.find((rule) => !rule.workerId && rule.workerKind === worker.kind);
    const globalRule = candidates.find((rule) => !rule.workerId && !rule.workerKind);
    const matched = exactWorkerRule ?? kindRule ?? globalRule;

    if (!matched) {
      return {
        effect: "approval-required",
        reason: `No explicit permission rule exists for ${worker.name} to use ${capabilityId}.`,
      };
    }

    return {
      effect: matched.effect,
      matchedRuleId: matched.id,
      reason: matched.reason ?? `Permission resolved by rule ${matched.id}.`,
    };
  }
}
