import { defaultSettings } from "../../data/seed";
import { workshopPrinterProfiles } from "../../data/printerProfiles";
import { defaultExternalTools } from "../../lib/externalTools";
import type { AppData } from "../../types/domain";

export const CURRENT_WORKSPACE_SCHEMA = 6;

export function createEmptyWorkspaceData(): AppData {
  return {
    designProjects: [],
    stls: [],
    concepts: [],
    variants: [],
    collections: [],
    releases: [],
    productionJobs: [],
    productionBatches: [],
    filament: [],
    materialMovements: [],
    printers: workshopPrinterProfiles.map((printer) => ({
      ...printer,
      supportedMaterials: [...printer.supportedMaterials],
      nozzleOptions: [...printer.nozzleOptions],
    })),
    maintenance: [],
    costSnapshots: [],
    activityLog: [],
    intakePackets: [],
    settings: { ...defaultExternalTools, ...defaultSettings },
    prototypes: [],
    plannedFilament: [],
    designPlanning: [],
    realmMaterials: [],
  };
}

export type WorkspaceIntegrityIssue = {
  code: string;
  message: string;
  recordId?: string;
};

export function inspectWorkspaceIntegrity(data: AppData): WorkspaceIntegrityIssue[] {
  const issues: WorkspaceIntegrityIssue[] = [];
  const designIds = new Set(data.designProjects.map((item) => item.id));
  const printerIds = new Set(data.printers.map((item) => item.id));
  const filamentIds = new Set(data.filament.map((item) => item.id));
  const batchIds = new Set(data.productionBatches.map((item) => item.id));
  const jobIds = new Set(data.productionJobs.map((item) => item.id));
  const intakePacketIds = new Set<string>();

  const checkDuplicates = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value || seen.has(value)) {
        issues.push({ code: `duplicate-${label}`, message: `${label} identifiers must be present and unique.`, recordId: value || undefined });
      }
      seen.add(value);
    }
  };

  checkDuplicates("design", data.designProjects.map((item) => item.id));
  checkDuplicates("job", data.productionJobs.map((item) => item.id));
  checkDuplicates("batch", data.productionBatches.map((item) => item.id));
  checkDuplicates("filament", data.filament.map((item) => item.id));
  checkDuplicates("printer", data.printers.map((item) => item.id));

  for (const packet of data.intakePackets) {
    if (!packet.packetId || intakePacketIds.has(packet.packetId)) {
      issues.push({
        code: "duplicate-intake-packet",
        message: "Foundry packet identifiers must be present and unique.",
        recordId: packet.packetId || undefined,
      });
    }
    intakePacketIds.add(packet.packetId);
    if (packet.stage !== "Planning" && packet.canonGate.status !== "Approved") {
      issues.push({
        code: "intake-canon-gate",
        message: `${packet.productName} cannot advance beyond Planning without an approved canon gate.`,
        recordId: packet.packetId,
      });
    }
    if ((packet.stage === "Production Approved" || packet.stage === "Released")
      && (packet.forgeability.status !== "Approved" || packet.pipeline.physicalTestStatus !== "Passed")) {
      issues.push({
        code: "intake-production-gate",
        message: `${packet.productName} requires approved forgeability and a passed print trial before production approval.`,
        recordId: packet.packetId,
      });
    }
  }

  for (const job of data.productionJobs) {
    if (!designIds.has(job.designProjectId)) {
      issues.push({ code: "job-design-missing", message: `${job.name} references a missing design project.`, recordId: job.id });
    }
    if (job.printerId && !printerIds.has(job.printerId)) {
      issues.push({ code: "job-printer-missing", message: `${job.name} references a missing printer.`, recordId: job.id });
    }
    if (job.filamentId && !filamentIds.has(job.filamentId)) {
      issues.push({ code: "job-filament-missing", message: `${job.name} references a missing material spool.`, recordId: job.id });
    }
    if (job.batchId && !batchIds.has(job.batchId)) {
      issues.push({ code: "job-batch-missing", message: `${job.name} references a missing production batch.`, recordId: job.id });
    }
  }

  for (const movement of data.materialMovements) {
    if (!filamentIds.has(movement.filamentId)) {
      issues.push({ code: "movement-filament-missing", message: "A material movement references a missing spool.", recordId: movement.id });
    }
    if (movement.productionJobId && !jobIds.has(movement.productionJobId)) {
      issues.push({ code: "movement-job-missing", message: "A material movement references a missing production job.", recordId: movement.id });
    }
  }

  return issues;
}

export function isForgekeeperBackup(value: unknown): value is Partial<AppData> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  return Array.isArray(data.designProjects ?? data.products)
    && Array.isArray(data.productionJobs ?? data.orders);
}
