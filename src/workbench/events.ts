import type { IsoTimestamp, WorkbenchId } from "./contracts";

export type WorkbenchEventType =
  | "asset.intake.started"
  | "file.registered"
  | "asset.created"
  | "asset.revision.created"
  | "asset.relationship.changed"
  | "asset.preview.ready"
  | "asset.inspection.requested"
  | "asset.intake.completed"
  | "inspection.completed"
  | "variant.created"
  | "assembly.changed"
  | "manufacturing_spec.approved"
  | "preparation.completed"
  | "production_candidate.approved"
  | "production.job.started"
  | "production.job.completed"
  | "production.job.failed"
  | "print_record.created"
  | "asset.production_evidence.changed"
  | "provider.generation.submitted"
  | "provider.generation.terminal"
  | "forgepack.exported"
  | "forgepack.imported";

export type WorkbenchEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: WorkbenchId;
  eventType: WorkbenchEventType;
  timestamp: IsoTimestamp;
  actorId: string;
  correlationId: WorkbenchId;
  projectId?: WorkbenchId;
  assetId?: WorkbenchId;
  revisionId?: WorkbenchId;
  schemaVersion: number;
  payload: TPayload;
};

export const WORKBENCH_EVENT_SCHEMA_VERSION = 1;
