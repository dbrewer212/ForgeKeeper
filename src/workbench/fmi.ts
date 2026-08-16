import type {
  AssetRelationship,
  AssetRevision,
  FoundryAssembly,
  FoundryAsset,
  FoundryFile,
  FoundryVariant,
  InspectionResult,
  ManufacturingSpec,
  PreparationRecord,
  PrintRecord,
  WorkbenchId,
} from "./contracts";

export type RegisterFileInput = Omit<FoundryFile, "fileId" | "importedAt"> & { importedAt?: string };
export type CreateAssetInput = Omit<FoundryAsset, "assetId" | "createdAt" | "updatedAt">;
export type CreateRevisionInput = Omit<AssetRevision, "revisionId" | "createdAt">;
export type LinkRelationshipInput = Omit<AssetRelationship, "relationshipId" | "createdAt">;
export type CreateVariantInput = Omit<FoundryVariant, "variantId" | "createdAt" | "updatedAt">;
export type CreateAssemblyInput = Omit<FoundryAssembly, "assemblyId" | "updatedAt">;
export type CreatePreparationInput = Omit<PreparationRecord, "preparationId" | "createdAt">;
export type RecordPrintResultInput = Omit<PrintRecord, "printRecordId" | "createdAt">;

export interface WorkbenchFmi {
  registerFile(input: RegisterFileInput): Promise<FoundryFile>;
  createAsset(input: CreateAssetInput): Promise<FoundryAsset>;
  createRevision(input: CreateRevisionInput): Promise<AssetRevision>;
  linkRelationship(input: LinkRelationshipInput): Promise<AssetRelationship>;
  requestInspection(assetId: WorkbenchId, revisionId: WorkbenchId): Promise<{ jobId: WorkbenchId }>;
  getInspection(inspectionResultId: WorkbenchId): Promise<InspectionResult | undefined>;
  createVariant(input: CreateVariantInput): Promise<FoundryVariant>;
  createAssembly(input: CreateAssemblyInput): Promise<FoundryAssembly>;
  updateManufacturingSpec(spec: ManufacturingSpec): Promise<ManufacturingSpec>;
  createPreparation(input: CreatePreparationInput): Promise<PreparationRecord>;
  submitProductionCandidate(preparationId: WorkbenchId): Promise<{ productionJobId: WorkbenchId }>;
  recordPrintResult(input: RecordPrintResultInput): Promise<PrintRecord>;
  exportForgepack(assetId: WorkbenchId, options?: Record<string, unknown>): Promise<{ outputPath: string }>;
  importForgepack(path: string): Promise<{ assetIds: WorkbenchId[] }>;
}
