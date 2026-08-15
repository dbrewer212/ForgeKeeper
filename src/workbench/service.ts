import type {
  AssetRelationship,
  AssetRevision,
  FoundryAssembly,
  FoundryAsset,
  FoundryFile,
  FoundryVariant,
  ManufacturingSpec,
  PreparationRecord,
  PrintRecord,
  WorkbenchId,
} from "./contracts";
import { HumanAuthority } from "../mesh/domainServices";
import { getFoundryMeshRuntime } from "../mesh/runtime";
import { WORKBENCH_EVENT_SCHEMA_VERSION, type WorkbenchEvent, type WorkbenchEventType } from "./events";
import type {
  CreateAssemblyInput,
  CreateAssetInput,
  CreatePreparationInput,
  CreateRevisionInput,
  CreateVariantInput,
  LinkRelationshipInput,
  RecordPrintResultInput,
  RegisterFileInput,
  WorkbenchFmi,
} from "./fmi";
import { WorkbenchRepository } from "./repository";

function id(prefix: string): WorkbenchId {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

export class WorkbenchService implements WorkbenchFmi {
  constructor(private readonly repository = new WorkbenchRepository(), private readonly actorId = "forgekeeper:local-owner") {}

  async initialize(): Promise<boolean> {
    return this.repository.initialize();
  }

  private async emit(type: WorkbenchEventType, payload: Record<string, unknown>, options: { assetId?: string; revisionId?: string; projectId?: string; correlationId?: string } = {}): Promise<void> {
    const event: WorkbenchEvent = {
      eventId: id("event"),
      eventType: type,
      timestamp: new Date().toISOString(),
      actorId: this.actorId,
      correlationId: options.correlationId ?? id("correlation"),
      projectId: options.projectId,
      assetId: options.assetId,
      revisionId: options.revisionId,
      schemaVersion: WORKBENCH_EVENT_SCHEMA_VERSION,
      payload,
    };
    await this.repository.appendEvent(event);
  }

  async registerFile(input: RegisterFileInput): Promise<FoundryFile> {
    const state = await this.repository.loadState();
    const duplicate = input.sha256 ? state.files.find((file) => file.sha256 === input.sha256) : undefined;
    if (duplicate) return duplicate;
    const value: FoundryFile = { ...input, fileId: id("file"), importedAt: input.importedAt ?? new Date().toISOString() };
    await this.repository.upsertFile(value);
    await this.emit("file.registered", { fileId: value.fileId, sha256: value.sha256, role: value.role });
    return value;
  }

  async createAsset(input: CreateAssetInput): Promise<FoundryAsset> {
    const now = new Date().toISOString();
    const value: FoundryAsset = { ...input, assetId: id("asset"), createdAt: now, updatedAt: now };
    await this.repository.upsertAsset(value);
    await this.emit("asset.created", { name: value.name, assetType: value.assetType, lifecycleStatus: value.lifecycleStatus }, { assetId: value.assetId, projectId: value.owningProjectId });
    return value;
  }

  async createRevision(input: CreateRevisionInput): Promise<AssetRevision> {
    const value: AssetRevision = { ...input, revisionId: id("revision"), createdAt: new Date().toISOString() };
    await this.repository.upsertRevision(value);
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === value.assetId);
    if (asset) await this.repository.upsertAsset({ ...asset, currentRevisionId: value.revisionId, updatedAt: new Date().toISOString() });
    await this.emit("asset.revision.created", { revisionLabel: value.revisionLabel, manufacturingApproval: value.manufacturingApproval }, { assetId: value.assetId, revisionId: value.revisionId });
    return value;
  }

  async linkRelationship(input: LinkRelationshipInput): Promise<AssetRelationship> {
    const value: AssetRelationship = { ...input, relationshipId: id("relationship"), createdAt: new Date().toISOString() };
    await this.repository.upsertRelationship(value);
    await this.emit("asset.relationship.changed", { relationshipId: value.relationshipId, relationshipType: value.type, toAssetId: value.toAssetId }, { assetId: value.fromAssetId, revisionId: value.fromRevisionId });
    return value;
  }

  async requestInspection(assetId: WorkbenchId, revisionId: WorkbenchId): Promise<{ jobId: WorkbenchId }> {
    const state = await this.repository.loadState();
    if (!state.assets.some((item) => item.assetId === assetId)) throw new Error(`Unknown Workbench asset: ${assetId}`);
    if (!state.revisions.some((item) => item.revisionId === revisionId && item.assetId === assetId)) throw new Error(`Revision ${revisionId} does not belong to ${assetId}.`);
    const jobId = id("inspection-job");
    await this.emit("asset.inspection.requested", { jobId }, { assetId, revisionId, correlationId: jobId });
    return { jobId };
  }

  async getInspection(inspectionResultId: WorkbenchId) {
    const state = await this.repository.loadState();
    return state.inspections.find((item) => item.inspectionResultId === inspectionResultId);
  }

  async createVariant(input: CreateVariantInput): Promise<FoundryVariant> {
    const now = new Date().toISOString();
    const value: FoundryVariant = { ...input, variantId: id("variant"), createdAt: now, updatedAt: now };
    await this.repository.upsertVariant(value);
    await this.emit("variant.created", { variantId: value.variantId, parentAssetId: value.parentAssetId, parentRevisionId: value.parentRevisionId }, { assetId: value.assetId });
    return value;
  }

  async createAssembly(input: CreateAssemblyInput): Promise<FoundryAssembly> {
    const value: FoundryAssembly = { ...input, assemblyId: id("assembly"), updatedAt: new Date().toISOString() };
    await this.repository.upsertAssembly(value);
    await this.emit("assembly.changed", { assemblyId: value.assemblyId, componentCount: value.components.length }, { assetId: value.assetId, revisionId: value.revisionId });
    return value;
  }

  async updateManufacturingSpec(spec: ManufacturingSpec): Promise<ManufacturingSpec> {
    const value = { ...spec, updatedAt: new Date().toISOString() };
    await this.repository.upsertManufacturingSpec(value);
    if (value.approvalState === "approved") {
      await this.emit("manufacturing_spec.approved", { manufacturingSpecId: value.manufacturingSpecId }, { assetId: value.assetId, revisionId: value.revisionId });
    }
    return value;
  }

  async createPreparation(input: CreatePreparationInput): Promise<PreparationRecord> {
    const value: PreparationRecord = { ...input, preparationId: id("preparation"), createdAt: new Date().toISOString() };
    await this.repository.upsertPreparation(value);
    if (value.status === "validated" || value.status === "approved") {
      await this.emit("preparation.completed", { preparationId: value.preparationId, status: value.status }, { assetId: value.assetId, revisionId: value.revisionId });
    }
    return value;
  }

  async submitProductionCandidate(preparationId: WorkbenchId): Promise<{ productionJobId: WorkbenchId }> {
    const state = await this.repository.loadState();
    const preparation = state.preparations.find((item) => item.preparationId === preparationId);
    if (!preparation) throw new Error(`Unknown preparation: ${preparationId}`);
    if (preparation.status === "submitted" && preparation.productionJobId) {
      return { productionJobId: preparation.productionJobId };
    }
    const spec = state.manufacturingSpecs.find((item) => item.manufacturingSpecId === preparation.manufacturingSpecId);
    if (!spec || spec.approvalState !== "approved") throw new Error("Production submission requires an approved ManufacturingSpec.");
    if (preparation.status !== "approved" && preparation.status !== "validated") throw new Error("Production submission requires a validated or approved preparation.");
    const asset = state.assets.find((item) => item.assetId === preparation.assetId);
    if (!asset) throw new Error(`Production preparation references unknown asset: ${preparation.assetId}`);

    const productionJobId = id("production-job");
    const runtime = getFoundryMeshRuntime();
    await runtime.initialize();
    await runtime.productionSteward.acceptProductionCandidate({
      productionItemId: productionJobId,
      name: `${asset.name} · ${preparation.preparationId}`,
      projectId: asset.owningProjectId,
      assetId: preparation.assetId,
      revisionId: preparation.revisionId,
      preparationId: preparation.preparationId,
      printerId: preparation.printerId,
    }, {
      requestedBy: HumanAuthority,
      authorizedBy: HumanAuthority,
      correlationId: productionJobId,
      reason: `Release validated Workbench preparation ${preparation.preparationId} to Production Steward.`,
    });

    await this.repository.upsertPreparation({ ...preparation, status: "submitted", productionJobId });
    await this.emit("production_candidate.approved", {
      preparationId,
      productionJobId,
      stewardAccepted: true,
    }, {
      assetId: preparation.assetId,
      revisionId: preparation.revisionId,
      projectId: asset.owningProjectId,
      correlationId: productionJobId,
    });
    return { productionJobId };
  }

  async recordPrintResult(input: RecordPrintResultInput): Promise<PrintRecord> {
    const state = await this.repository.loadState();
    const preparation = state.preparations.find((item) => item.preparationId === input.preparationId);
    if (!preparation) throw new Error(`Print result references unknown preparation: ${input.preparationId}`);
    if (preparation.assetId !== input.assetId || preparation.revisionId !== input.revisionId) {
      throw new Error("Print result asset/revision does not match its preparation record.");
    }
    if (!preparation.productionJobId || preparation.productionJobId !== input.productionJobId) {
      throw new Error("Print result production job does not match the submitted preparation.");
    }
    if (preparation.printerId && preparation.printerId !== input.printerId) {
      throw new Error(`Print result printer ${input.printerId} does not match prepared printer ${preparation.printerId}.`);
    }

    const runtime = getFoundryMeshRuntime();
    await runtime.initialize();
    const productionItem = await runtime.domain.get().production.get(input.productionJobId);
    if (!productionItem) throw new Error(`Print result references unknown Production Steward item: ${input.productionJobId}`);
    if (productionItem.workbench && (
      productionItem.workbench.assetId !== input.assetId
      || productionItem.workbench.revisionId !== input.revisionId
      || productionItem.workbench.preparationId !== input.preparationId
    )) {
      throw new Error("Print result does not match the Workbench linkage recorded on the Production Steward item.");
    }

    const value: PrintRecord = { ...input, printRecordId: id("print-record"), createdAt: new Date().toISOString() };
    await this.repository.upsertPrintRecord(value);

    const succeeded = value.outcome === "success";
    const partial = value.outcome === "partial-success";
    await runtime.domainState.upsertProductionItem({
      ...productionItem,
      stage: succeeded ? "completed" : partial ? "evidence-review" : "stopped",
      status: succeeded ? "completed" : "attention-required",
      nextAction: succeeded
        ? undefined
        : `Review PrintRecord ${value.printRecordId} and decide whether to revise, retry, or close the job.`,
      blocker: succeeded
        ? undefined
        : partial
          ? `Print returned partial-success; review physical evidence before further production.`
          : `Print returned ${value.outcome}; production requires operator review.`,
    }, {
      requestedBy: HumanAuthority,
      authorizedBy: HumanAuthority,
      correlationId: value.productionJobId,
      reason: `Returned Workbench print evidence ${value.printRecordId} with outcome ${value.outcome}.`,
    });

    await this.emit("print_record.created", { printRecordId: value.printRecordId, productionJobId: value.productionJobId, outcome: value.outcome }, { assetId: value.assetId, revisionId: value.revisionId, correlationId: value.productionJobId });
    await this.emit("asset.production_evidence.changed", { printRecordId: value.printRecordId, outcome: value.outcome }, { assetId: value.assetId, revisionId: value.revisionId, correlationId: value.productionJobId });
    return value;
  }

  async exportForgepack(_assetId: WorkbenchId, _options?: Record<string, unknown>): Promise<{ outputPath: string }> {
    throw new Error("Workbench Forgepack export is defined by FMI but is not commissioned until the managed-file storage layer is active.");
  }

  async importForgepack(_path: string): Promise<{ assetIds: WorkbenchId[] }> {
    throw new Error("Workbench Forgepack import is defined by FMI but is not commissioned until Intake and managed-file validation are active.");
  }
}

let singleton: WorkbenchService | null = null;
export function getWorkbenchService(): WorkbenchService {
  singleton ??= new WorkbenchService();
  return singleton;
}
