import { invoke } from "@tauri-apps/api/core";
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
  WorkbenchState,
} from "./contracts";
import { WorkbenchRepository } from "./repository";

const FORGEPACK_FORMAT = "fenrir-foundry-workbench-forgepack";
const FORGEPACK_VERSION = 1;

type PortableFoundryFile = Omit<FoundryFile, "storagePath" | "ownedByFoundry">;

type ForgepackFileDeclaration = {
  fileId: WorkbenchId;
  archivePath: string;
  sha256: string;
};

export type WorkbenchForgepackManifest = {
  format: typeof FORGEPACK_FORMAT;
  formatVersion: typeof FORGEPACK_VERSION;
  exportedAt: string;
  exportedBy: string;
  rootAssetId: WorkbenchId;
  files: ForgepackFileDeclaration[];
  graph: {
    assets: FoundryAsset[];
    fileRecords: PortableFoundryFile[];
    revisions: AssetRevision[];
    relationships: AssetRelationship[];
    variants: FoundryVariant[];
    assemblies: FoundryAssembly[];
    manufacturingSpecs: ManufacturingSpec[];
    inspections: InspectionResult[];
    preparations: PreparationRecord[];
    printRecords: PrintRecord[];
  };
};

type NativeExportFile = {
  fileId: string;
  fileName: string;
  storagePath: string;
  sha256: string;
};

type NativeExportResult = {
  outputPath: string;
  fileCount: number;
  totalBytes: number;
};

type NativeImportedFile = {
  fileId: string;
  archivePath: string;
  managedPath: string;
  sha256: string;
  sizeBytes: number;
  reusedExisting: boolean;
};

type NativeImportResult = {
  manifestJson: string;
  packagePath: string;
  files: NativeImportedFile[];
};

export type ForgepackImportSummary = {
  assetIds: WorkbenchId[];
  rootAssetId: WorkbenchId;
  reusedFileCount: number;
  importedFileCount: number;
};

function safeArchiveName(file: FoundryFile): string {
  const cleanName = file.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "asset";
  const cleanId = file.fileId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `assets/${cleanId}/${cleanName}`;
}

function portableFile(file: FoundryFile): PortableFoundryFile {
  const { storagePath: _storagePath, ownedByFoundry: _ownedByFoundry, ...portable } = file;
  return portable;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function equivalent<T>(left: T, right: T): boolean {
  return stableJson(left) === stableJson(right);
}

function includeAssetClosure(state: WorkbenchState, rootAssetId: WorkbenchId): Set<WorkbenchId> {
  const included = new Set<WorkbenchId>([rootAssetId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const variant of state.variants) {
      if (included.has(variant.parentAssetId) && !included.has(variant.assetId)) {
        included.add(variant.assetId);
        changed = true;
      }
    }
    for (const assembly of state.assemblies) {
      if (!included.has(assembly.assetId)) continue;
      for (const component of assembly.components) {
        if (!included.has(component.assetId)) {
          included.add(component.assetId);
          changed = true;
        }
      }
    }
  }
  return included;
}

function collectManifest(state: WorkbenchState, rootAssetId: WorkbenchId): { manifest: WorkbenchForgepackManifest; nativeFiles: NativeExportFile[] } {
  const root = state.assets.find((asset) => asset.assetId === rootAssetId);
  if (!root) throw new Error(`Unknown Workbench asset: ${rootAssetId}`);

  const assetIds = includeAssetClosure(state, rootAssetId);
  const assets = state.assets.filter((asset) => assetIds.has(asset.assetId));
  const revisions = state.revisions.filter((revision) => assetIds.has(revision.assetId));
  const revisionIds = new Set(revisions.map((revision) => revision.revisionId));
  const variants = state.variants.filter((variant) => assetIds.has(variant.assetId) && assetIds.has(variant.parentAssetId));
  const assemblies = state.assemblies.filter((assembly) => assetIds.has(assembly.assetId));
  const manufacturingSpecs = state.manufacturingSpecs.filter((spec) => assetIds.has(spec.assetId) && revisionIds.has(spec.revisionId));
  const inspections = state.inspections.filter((inspection) => assetIds.has(inspection.assetId) && revisionIds.has(inspection.revisionId));
  const preparations = state.preparations.filter((preparation) => assetIds.has(preparation.assetId) && revisionIds.has(preparation.revisionId));
  const printRecords = state.printRecords.filter((record) => assetIds.has(record.assetId) && revisionIds.has(record.revisionId));
  const relationships = state.relationships.filter((relationship) => assetIds.has(relationship.fromAssetId) && assetIds.has(relationship.toAssetId));

  const fileIds = new Set<WorkbenchId>();
  for (const revision of revisions) {
    revision.sourceFileIds.forEach((fileId) => fileIds.add(fileId));
    revision.outputFileIds.forEach((fileId) => fileIds.add(fileId));
  }
  for (const preparation of preparations) preparation.generatedFileIds.forEach((fileId) => fileIds.add(fileId));
  for (const record of printRecords) record.evidenceFileIds.forEach((fileId) => fileIds.add(fileId));

  const files = state.files.filter((file) => fileIds.has(file.fileId));
  const missing = [...fileIds].filter((fileId) => !files.some((file) => file.fileId === fileId));
  if (missing.length) throw new Error(`Forgepack cannot export because ${missing.length} referenced Foundry file record(s) are missing.`);
  const unmanaged = files.filter((file) => !file.ownedByFoundry || !file.storagePath.trim());
  if (unmanaged.length) {
    throw new Error(`Forgepack requires managed-file ownership. ${unmanaged.length} referenced file(s) must pass through controlled Intake first.`);
  }

  const declarations = files.map((file) => ({
    fileId: file.fileId,
    archivePath: safeArchiveName(file),
    sha256: file.sha256,
  }));
  const manifest: WorkbenchForgepackManifest = {
    format: FORGEPACK_FORMAT,
    formatVersion: FORGEPACK_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: "forgekeeper:local-owner",
    rootAssetId,
    files: declarations,
    graph: {
      assets,
      fileRecords: files.map(portableFile),
      revisions,
      relationships,
      variants,
      assemblies,
      manufacturingSpecs,
      inspections,
      preparations,
      printRecords,
    },
  };
  return {
    manifest,
    nativeFiles: files.map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      storagePath: file.storagePath,
      sha256: file.sha256,
    })),
  };
}

function parseManifest(json: string): WorkbenchForgepackManifest {
  const parsed = JSON.parse(json) as Partial<WorkbenchForgepackManifest>;
  if (parsed.format !== FORGEPACK_FORMAT || parsed.formatVersion !== FORGEPACK_VERSION || !parsed.graph || !parsed.rootAssetId || !Array.isArray(parsed.files)) {
    throw new Error("Forgepack manifest is not a supported Foundry Workbench packet.");
  }
  return parsed as WorkbenchForgepackManifest;
}

function assertNoConflicts<T extends Record<string, unknown>>(
  label: string,
  incoming: T[],
  existing: T[],
  identity: (value: T) => string,
  normalize: (value: T) => unknown = (value) => value,
): void {
  const existingById = new Map(existing.map((value) => [identity(value), value]));
  const conflicts: string[] = [];
  for (const value of incoming) {
    const prior = existingById.get(identity(value));
    if (prior && !equivalent(normalize(prior), normalize(value))) conflicts.push(identity(value));
  }
  if (conflicts.length) {
    throw new Error(`Forgepack import blocked: ${label} identity conflict for ${conflicts.slice(0, 8).join(", ")}${conflicts.length > 8 ? "…" : ""}. Existing Foundry truth was not overwritten.`);
  }
}

export async function exportWorkbenchForgepack(
  repository: WorkbenchRepository,
  assetId: WorkbenchId,
  outputName?: string,
): Promise<NativeExportResult> {
  const state = await repository.loadState();
  const { manifest, nativeFiles } = collectManifest(state, assetId);
  const root = manifest.graph.assets.find((asset) => asset.assetId === assetId)!;
  const name = outputName?.trim() || `${root.name}-${new Date().toISOString().slice(0, 10)}`;
  return invoke<NativeExportResult>("workbench_export_forgepack", {
    manifestJson: JSON.stringify(manifest),
    files: nativeFiles,
    outputName: name,
  });
}

export async function importWorkbenchForgepack(
  repository: WorkbenchRepository,
  path: string,
): Promise<ForgepackImportSummary> {
  const native = await invoke<NativeImportResult>("workbench_import_forgepack", { packagePath: path });
  const manifest = parseManifest(native.manifestJson);
  const current = await repository.loadState();

  const importedFilesById = new Map(native.files.map((file) => [file.fileId, file]));
  if (manifest.graph.fileRecords.length !== manifest.files.length || native.files.length !== manifest.files.length) {
    throw new Error("Forgepack import blocked because file metadata and extracted file counts do not agree.");
  }

  const reconstructedFiles: FoundryFile[] = manifest.graph.fileRecords.map((portable) => {
    const extracted = importedFilesById.get(portable.fileId);
    const declaration = manifest.files.find((file) => file.fileId === portable.fileId);
    if (!extracted || !declaration || extracted.sha256.toLowerCase() !== portable.sha256.toLowerCase() || declaration.sha256.toLowerCase() !== portable.sha256.toLowerCase()) {
      throw new Error(`Forgepack import blocked because file ${portable.fileId} did not survive checksum/identity verification.`);
    }
    return {
      ...portable,
      storagePath: extracted.managedPath,
      sizeBytes: extracted.sizeBytes,
      ownedByFoundry: true,
      source: {
        ...portable.source,
        sourceType: portable.source.sourceType,
      },
    };
  });

  assertNoConflicts("asset", manifest.graph.assets as unknown as Record<string, unknown>[], current.assets as unknown as Record<string, unknown>[], (value) => String(value.assetId));
  assertNoConflicts("file", reconstructedFiles as unknown as Record<string, unknown>[], current.files as unknown as Record<string, unknown>[], (value) => String(value.fileId), (value) => {
    const { storagePath: _storagePath, ownedByFoundry: _ownedByFoundry, ...portable } = value as unknown as FoundryFile;
    return portable;
  });
  assertNoConflicts("revision", manifest.graph.revisions as unknown as Record<string, unknown>[], current.revisions as unknown as Record<string, unknown>[], (value) => String(value.revisionId));
  assertNoConflicts("relationship", manifest.graph.relationships as unknown as Record<string, unknown>[], current.relationships as unknown as Record<string, unknown>[], (value) => String(value.relationshipId));
  assertNoConflicts("variant", manifest.graph.variants as unknown as Record<string, unknown>[], current.variants as unknown as Record<string, unknown>[], (value) => String(value.variantId));
  assertNoConflicts("assembly", manifest.graph.assemblies as unknown as Record<string, unknown>[], current.assemblies as unknown as Record<string, unknown>[], (value) => String(value.assemblyId));
  assertNoConflicts("manufacturing specification", manifest.graph.manufacturingSpecs as unknown as Record<string, unknown>[], current.manufacturingSpecs as unknown as Record<string, unknown>[], (value) => String(value.manufacturingSpecId));
  assertNoConflicts("inspection", manifest.graph.inspections as unknown as Record<string, unknown>[], current.inspections as unknown as Record<string, unknown>[], (value) => String(value.inspectionResultId));
  assertNoConflicts("preparation", manifest.graph.preparations as unknown as Record<string, unknown>[], current.preparations as unknown as Record<string, unknown>[], (value) => String(value.preparationId));
  assertNoConflicts("print record", manifest.graph.printRecords as unknown as Record<string, unknown>[], current.printRecords as unknown as Record<string, unknown>[], (value) => String(value.printRecordId));

  for (const asset of manifest.graph.assets) await repository.upsertAsset(asset);
  for (const file of reconstructedFiles) await repository.upsertFile(file);
  for (const revision of manifest.graph.revisions) await repository.upsertRevision(revision);
  for (const relationship of manifest.graph.relationships) await repository.upsertRelationship(relationship);
  for (const variant of manifest.graph.variants) await repository.upsertVariant(variant);
  for (const assembly of manifest.graph.assemblies) await repository.upsertAssembly(assembly);
  for (const spec of manifest.graph.manufacturingSpecs) await repository.upsertManufacturingSpec(spec);
  for (const inspection of manifest.graph.inspections) await repository.upsertInspection(inspection);
  for (const preparation of manifest.graph.preparations) await repository.upsertPreparation(preparation);
  for (const record of manifest.graph.printRecords) await repository.upsertPrintRecord(record);

  return {
    assetIds: manifest.graph.assets.map((asset) => asset.assetId),
    rootAssetId: manifest.rootAssetId,
    reusedFileCount: native.files.filter((file) => file.reusedExisting).length,
    importedFileCount: native.files.length,
  };
}
