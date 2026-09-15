import { MeshEvents } from "../mesh/events";
import type { MeshPersistence } from "../mesh/persistence";
import type { FoundryEvent } from "../mesh/types";

export type ExperienceCategory = "incident" | "action" | "system" | "production" | "change" | "other";
export type ExperienceOutcome = "success" | "failure" | "denied" | "resolved" | "observed" | "unknown";

export interface ExperienceRecord {
  id: string;
  occurredAt: string;
  eventType: string;
  category: ExperienceCategory;
  outcome: ExperienceOutcome;
  sourceWorkerId: string;
  subjectId?: string;
  correlationId?: string;
  summary: string;
}

export interface ExperienceSearchRequest {
  query?: string;
  limit?: number;
  category?: ExperienceCategory;
  subjectId?: string;
  correlationId?: string;
}

export class FoundryExperienceMemory {
  constructor(private readonly persistence: MeshPersistence) {}

  async recent(limit = 30): Promise<ExperienceRecord[]> {
    const bounded = Math.max(1, Math.min(200, Math.floor(limit)));
    const events = await this.persistence.readRecentEvents(Math.max(250, bounded));
    return events.slice(-bounded).reverse().map((event) => projectEvent(event));
  }

  async search(request: ExperienceSearchRequest): Promise<ExperienceRecord[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(request.limit ?? 20)));
    const events = await this.persistence.readRecentEvents(2000);
    const queryTokens = tokenize(request.query ?? "");

    return events
      .map((event) => projectEvent(event))
      .filter((record) => !request.category || record.category === request.category)
      .filter((record) => !request.subjectId || record.subjectId === request.subjectId)
      .filter((record) => !request.correlationId || record.correlationId === request.correlationId)
      .map((record) => ({ record, score: relevanceScore(record, queryTokens) }))
      .filter(({ score }) => queryTokens.length === 0 || score > 0)
      .sort((a, b) => b.score - a.score || b.record.occurredAt.localeCompare(a.record.occurredAt))
      .slice(0, limit)
      .map(({ record }) => record);
  }
}

function projectEvent(event: FoundryEvent): ExperienceRecord {
  const payload = asRecord(event.payload);
  const base: Omit<ExperienceRecord, "category" | "outcome" | "summary"> = {
    id: event.id,
    occurredAt: event.occurredAt,
    eventType: event.type,
    sourceWorkerId: event.sourceWorkerId,
    subjectId: event.subjectId,
    correlationId: event.correlationId,
  };

  if (event.type === MeshEvents.watcherFindingPublished) {
    const finding = asRecord(payload.finding);
    const kind = typeof payload.kind === "string" ? payload.kind : "observed";
    const summary = typeof finding.summary === "string" ? finding.summary : "Watcher finding changed.";
    return {
      ...base,
      category: "incident",
      outcome: kind === "resolved" ? "resolved" : "observed",
      summary: `Watcher ${kind}: ${summary}`,
    };
  }

  if (event.type === MeshEvents.watcherProviderUnavailable) {
    return { ...base, category: "incident", outcome: "failure", summary: `Watcher provider ${event.subjectId ?? "unknown"} became unavailable.` };
  }
  if (event.type === MeshEvents.watcherProviderRecovered) {
    return { ...base, category: "incident", outcome: "resolved", summary: `Watcher provider ${event.subjectId ?? "unknown"} recovered.` };
  }

  if (event.type === MeshEvents.actionCompleted) {
    return { ...base, category: "action", outcome: "success", summary: actionSummary(payload, "completed") };
  }
  if (event.type === MeshEvents.actionFailed) {
    return { ...base, category: "action", outcome: "failure", summary: actionSummary(payload, "failed") };
  }
  if (event.type === MeshEvents.actionDenied) {
    return { ...base, category: "action", outcome: "denied", summary: actionSummary(payload, "was denied") };
  }

  if (event.type === MeshEvents.serviceStateChanged) {
    const previous = asRecord(payload.previous);
    const current = asRecord(payload.current);
    const from = typeof previous.runtimeState === "string" ? previous.runtimeState : "unknown";
    const to = typeof current.runtimeState === "string" ? current.runtimeState : "unknown";
    const name = typeof current.name === "string" ? current.name : event.subjectId ?? "service";
    return { ...base, category: "system", outcome: to === "failed" ? "failure" : "observed", summary: `${name} changed from ${from} to ${to}.` };
  }

  if (event.type === MeshEvents.systemSafeModeEntered) {
    return { ...base, category: "system", outcome: "observed", summary: "Foundry entered Safe Mode." };
  }
  if (event.type === MeshEvents.systemSafeModeExited) {
    return { ...base, category: "system", outcome: "resolved", summary: "Foundry exited Safe Mode." };
  }

  if (event.type.startsWith("production.")) {
    return { ...base, category: "production", outcome: event.type.endsWith("completed") ? "success" : "observed", summary: `Production event: ${event.type}${event.subjectId ? ` (${event.subjectId})` : ""}.` };
  }
  if (event.type === MeshEvents.domainRecordChanged) {
    const entityType = typeof payload.entityType === "string" ? payload.entityType : "record";
    const operation = typeof payload.operation === "string" ? payload.operation : "changed";
    return { ...base, category: "change", outcome: "observed", summary: `${entityType} ${event.subjectId ?? "record"}: ${operation}.` };
  }

  return {
    ...base,
    category: "other",
    outcome: "unknown",
    summary: `${event.type}${event.subjectId ? ` (${event.subjectId})` : ""}.`,
  };
}

function actionSummary(payload: Record<string, unknown>, verb: string): string {
  const request = asRecord(payload.request);
  const operation =
    (typeof payload.operationId === "string" && payload.operationId) ||
    (typeof request.operationId === "string" && request.operationId) ||
    (typeof request.capabilityId === "string" && request.capabilityId) ||
    "governed action";
  return `${operation} ${verb}.`;
}

function relevanceScore(record: ExperienceRecord, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 1;
  const searchable = `${record.eventType} ${record.category} ${record.outcome} ${record.sourceWorkerId} ${record.subjectId ?? ""} ${record.summary}`.toLowerCase();
  return queryTokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLowerCase().split(/[^a-z0-9_.:-]+/).map((token) => token.trim()).filter((token) => token.length >= 3))];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
