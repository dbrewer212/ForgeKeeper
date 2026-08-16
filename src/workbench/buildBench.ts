import type { ForgekeeperState } from "../state/useForgekeeperState";
import type { PreparationRecord, WorkbenchOperation } from "./contracts";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";

export type BuildBenchDraft = {
  assetId: string;
  revisionId: string;
  manufacturingSpecId: string;
  printerId?: string;
  materialProfileId?: string;
  physicalSpoolIds?: string[];
  slicerId?: string;
  slicerProfileRef?: string;
  supportIntent?: string;
  assumptions: string[];
  operationGraph: WorkbenchOperation[];
};

export type BuildBenchValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function latestInspectionFor(assetId: string, revisionId: string, inspections: Awaited<ReturnType<WorkbenchRepository["loadState"]>>["inspections"]) {
  return inspections
    .filter((item) => item.assetId === assetId && item.revisionId === revisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export class WorkbenchBuildBenchService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly service = getWorkbenchService(),
  ) {}

  async validate(draft: BuildBenchDraft, state: ForgekeeperState): Promise<BuildBenchValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const workbench = await this.repository.loadState();
    const asset = workbench.assets.find((item) => item.assetId === draft.assetId);
    const revision = workbench.revisions.find((item) => item.revisionId === draft.revisionId && item.assetId === draft.assetId);
    const spec = workbench.manufacturingSpecs.find((item) => item.manufacturingSpecId === draft.manufacturingSpecId && item.assetId === draft.assetId);

    if (!asset) errors.push("The selected Workbench asset no longer exists.");
    if (!revision) errors.push("The selected revision is not registered to this asset.");
    if (!spec) errors.push("A ManufacturingSpec for this asset/revision is required.");
    if (spec && spec.revisionId !== draft.revisionId) errors.push("The selected ManufacturingSpec belongs to a different revision.");

    const inspection = latestInspectionFor(draft.assetId, draft.revisionId, workbench.inspections);
    if (!inspection) warnings.push("This revision has no Inspector evidence yet. Build Bench can save a draft, but it cannot be validated for production preparation.");
    else if (inspection.findings.some((item) => item.severity === "critical" || item.severity === "error")) {
      errors.push("Inspector evidence contains blocking geometry findings.");
    }

    if (draft.printerId) {
      const printer = state.printers.find((item) => item.id === draft.printerId);
      if (!printer) errors.push("The selected printer is not in the Foundry printer roster.");
      else if (printer.status === "Offline") warnings.push(`${printer.name} is currently Offline.`);

      const compatibility = inspection?.machineCompatibility.find((item) => item.printerId === draft.printerId);
      if (compatibility && !compatibility.compatible) {
        errors.push(`Inspector reports that the selected revision does not fit the selected printer: ${compatibility.reasons.join("; ")}`);
      }
    }

    const physicalSpoolIds = [...new Set(draft.physicalSpoolIds ?? [])];
    if (physicalSpoolIds.length && !draft.materialProfileId) {
      errors.push("Physical spools cannot be assigned without a material profile.");
    }
    for (const spoolId of physicalSpoolIds) {
      const spool = state.filament.find((item) => item.id === spoolId);
      if (!spool) {
        errors.push(`Selected physical spool ${spoolId} is not in the Foundry material inventory.`);
        continue;
      }
      if (draft.materialProfileId && spool.profileId !== draft.materialProfileId) {
        errors.push(`${spool.foundrySpoolCode} does not match the selected material profile.`);
      }
      if (spool.status === "Archived" || spool.status === "Empty" || spool.condition === "Empty") {
        errors.push(`${spool.foundrySpoolCode} is ${spool.status.toLowerCase()} and cannot be assigned to a production preparation.`);
      }
      if (spool.quantityConfidence === "Unknown") {
        warnings.push(`${spool.foundrySpoolCode} has unknown remaining quantity. Measure or estimate it before relying on material sufficiency.`);
      }
    }
    if (draft.materialProfileId && !physicalSpoolIds.length) {
      warnings.push("A material profile is selected but no physical spool is reserved. Production may proceed only after an operator assigns the actual spool used.");
    }

    for (const operation of draft.operationGraph) {
      if (!operation.type) errors.push(`Operation ${operation.operationId} has no operation type.`);
      if (operation.inputRevisionId && operation.inputRevisionId !== draft.revisionId) {
        warnings.push(`Operation ${operation.operationId} references a different input revision.`);
      }
    }

    return { valid: errors.length === 0 && Boolean(inspection), errors, warnings };
  }

  async save(draft: BuildBenchDraft, state: ForgekeeperState, requestValidation: boolean): Promise<{ preparation: PreparationRecord; validation: BuildBenchValidation }> {
    const validation = await this.validate(draft, state);
    const status: PreparationRecord["status"] = requestValidation && validation.valid ? "validated" : "draft";

    const preparation = await this.service.createPreparation({
      assetId: draft.assetId,
      revisionId: draft.revisionId,
      manufacturingSpecId: draft.manufacturingSpecId,
      printerId: draft.printerId || undefined,
      materialProfileId: draft.materialProfileId || undefined,
      physicalSpoolIds: draft.physicalSpoolIds?.length ? [...new Set(draft.physicalSpoolIds)] : undefined,
      slicerId: draft.slicerId || undefined,
      slicerProfileRef: draft.slicerProfileRef || undefined,
      supportIntent: draft.supportIntent || undefined,
      assumptions: draft.assumptions.filter(Boolean),
      operationGraph: draft.operationGraph,
      generatedFileIds: [],
      status,
      createdBy: "forgekeeper:build-bench",
    });

    return { preparation, validation };
  }
}

let singleton: WorkbenchBuildBenchService | null = null;
export function getWorkbenchBuildBenchService(): WorkbenchBuildBenchService {
  singleton ??= new WorkbenchBuildBenchService();
  return singleton;
}

export function newWorkbenchOperation(type: WorkbenchOperation["type"], inputRevisionId?: string): WorkbenchOperation {
  const operationId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `operation:${crypto.randomUUID()}`
    : `operation:${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { operationId, type, parameters: {}, inputRevisionId, createdAt: new Date().toISOString() };
}
