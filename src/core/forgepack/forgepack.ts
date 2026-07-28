import type {
  ActivityEvent,
  AppData,
  ConceptSpec,
  DesignLine,
  DesignProject,
  DesignTier,
  ForgepackAsset,
  ForgepackAssetKind,
  ForgepackGate,
  ForgepackGateStatus,
  ForgepackImportRecord,
  ForgepackPipeline,
  ForgepackStage,
  ForgepackTrialStatus,
  STLRecord,
} from "../../types/domain";
import { syncPlanningProductToDesign } from "./planningPromotion";

export const FORGEPACK_FORMAT = "fenrir-forgepack";
export const FORGEPACK_FORMAT_VERSION = 1;

const stages: ForgepackStage[] = [
  "Planning",
  "Concept Approved",
  "Engineering",
  "Prototype",
  "Print Trial",
  "Production Approved",
  "Released",
];
const gateStatuses: ForgepackGateStatus[] = ["Pending", "Approved", "Changes Required", "Blocked"];
const trialStatuses: ForgepackTrialStatus[] = ["Not Started", "In Progress", "Passed", "Failed"];
const assetKinds: ForgepackAssetKind[] = [
  "concept-image",
  "measurement-image",
  "reference",
  "stl",
  "3mf",
  "document",
  "other",
];
const designLines: DesignLine[] = ["ForgeTech", "Foundry", "Relics of the Nine Realms", "Runehallow Relics"];
const stageRank = new Map(stages.map((stage, index) => [stage, index]));

type UnknownRecord = Record<string, unknown>;

export type NativeForgepackImport = {
  manifestJson: string;
  packagePath: string;
  assetRoot: string;
  alreadyExtracted: boolean;
  assets: Array<{ archivePath: string; importedPath: string }>;
};

export type ForgepackManifest = {
  format: typeof FORGEPACK_FORMAT;
  formatVersion: typeof FORGEPACK_FORMAT_VERSION;
  packetId: string;
  product: {
    id: string;
    name: string;
    tier: DesignTier;
    line: DesignLine;
    category: string;
    collection: string;
    stage: ForgepackStage;
    purpose: string;
    measurements: string;
    conceptRevision: string;
  };
  canonGate: ForgepackGate;
  forgeability: ForgepackGate & {
    assessedAt?: string;
    risks: string[];
    requirements: string[];
    unknowns: string[];
  };
  pipeline: ForgepackPipeline;
  assets: Array<{
    id: string;
    kind: ForgepackAssetKind;
    label: string;
    path: string;
    sha256: string;
    version: string;
    primary: boolean;
  }>;
  provenance: {
    createdAt: string;
    createdBy: string;
    conversationRef: string;
    notes: string;
  };
};

export type ForgepackApplicationResult = {
  data: AppData;
  record: ForgepackImportRecord;
  createdPlanningRecord: boolean;
  createdDesignProject: boolean;
  updatedDesignProject: boolean;
  importedAssetCount: number;
};

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as UnknownRecord;
}

function stringValue(value: unknown, label: string, required = true): string {
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new Error(`${label} must be ${required ? "a non-empty " : "a "}string.`);
  }
  return value.trim();
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return stringValue(value, label);
}

function parseGate(value: unknown, label: string): ForgepackGate {
  const source = record(value, label);
  return {
    status: enumValue(source.status, gateStatuses, `${label}.status`),
    summary: stringValue(source.summary ?? "", `${label}.summary`, false),
    approvedBy: optionalString(source.approvedBy, `${label}.approvedBy`),
    approvedAt: optionalString(source.approvedAt, `${label}.approvedAt`),
  };
}

function isSafeArchivePath(value: string): boolean {
  const normalized = value.split("\\").join("/");
  return normalized.startsWith("assets/")
    && !normalized.startsWith("/")
    && !normalized.split("/").includes("..")
    && normalized.length < 260;
}

function validateMilestoneGates(manifest: ForgepackManifest): void {
  const rank = stageRank.get(manifest.product.stage) ?? 0;
  const conceptApproved = stageRank.get("Concept Approved") ?? 1;
  const productionApproved = stageRank.get("Production Approved") ?? 5;

  if (rank >= conceptApproved && manifest.canonGate.status !== "Approved") {
    throw new Error("Concept Approved and later packets require an approved canon gate.");
  }
  if (rank >= productionApproved) {
    if (manifest.forgeability.status !== "Approved") {
      throw new Error("Production Approved and Released packets require an approved forgeability gate.");
    }
    if (manifest.pipeline.physicalTestStatus !== "Passed") {
      throw new Error("Production Approved and Released packets require a passed physical print trial.");
    }
    if (!manifest.assets.some((asset) => asset.kind === "stl" || asset.kind === "3mf")) {
      throw new Error("Production Approved and Released packets require an STL or 3MF asset.");
    }
  }
}

export function parseForgepackManifest(value: unknown): ForgepackManifest {
  const source = record(value, "manifest");
  if (source.format !== FORGEPACK_FORMAT) {
    throw new Error(`Unsupported packet format. Expected ${FORGEPACK_FORMAT}.`);
  }
  if (source.formatVersion !== FORGEPACK_FORMAT_VERSION) {
    throw new Error(`Unsupported .forgepack version. Expected ${FORGEPACK_FORMAT_VERSION}.`);
  }

  const product = record(source.product, "product");
  const forgeabilitySource = record(source.forgeability, "forgeability");
  const pipelineSource = record(source.pipeline, "pipeline");
  const provenanceSource = record(source.provenance, "provenance");
  if (!Array.isArray(source.assets)) throw new Error("assets must be an array.");

  const assets = source.assets.map((value, index) => {
    const asset = record(value, `assets[${index}]`);
    const path = stringValue(asset.path, `assets[${index}].path`);
    const sha256 = stringValue(asset.sha256, `assets[${index}].sha256`).toLowerCase();
    if (!isSafeArchivePath(path)) {
      throw new Error(`assets[${index}].path must be a safe path under assets/.`);
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`assets[${index}].sha256 must be a SHA-256 hex digest.`);
    }
    return {
      id: stringValue(asset.id, `assets[${index}].id`),
      kind: enumValue(asset.kind, assetKinds, `assets[${index}].kind`),
      label: stringValue(asset.label, `assets[${index}].label`),
      path,
      sha256,
      version: stringValue(asset.version ?? "v001", `assets[${index}].version`),
      primary: asset.primary === true,
    };
  });
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) {
    throw new Error("Asset identifiers must be unique inside a packet.");
  }
  if (new Set(assets.map((asset) => asset.path)).size !== assets.length) {
    throw new Error("Asset paths must be unique inside a packet.");
  }

  const manifest: ForgepackManifest = {
    format: FORGEPACK_FORMAT,
    formatVersion: FORGEPACK_FORMAT_VERSION,
    packetId: stringValue(source.packetId, "packetId"),
    product: {
      id: stringValue(product.id, "product.id"),
      name: stringValue(product.name, "product.name"),
      tier: enumValue(product.tier, ["Hero", "Utility"], "product.tier"),
      line: enumValue(product.line, designLines, "product.line"),
      category: stringValue(product.category ?? "Unassigned", "product.category"),
      collection: stringValue(product.collection ?? "Unassigned", "product.collection"),
      stage: enumValue(product.stage, stages, "product.stage"),
      purpose: stringValue(product.purpose ?? "", "product.purpose", false),
      measurements: stringValue(product.measurements ?? "", "product.measurements", false),
      conceptRevision: stringValue(product.conceptRevision ?? "v001", "product.conceptRevision"),
    },
    canonGate: parseGate(source.canonGate, "canonGate"),
    forgeability: {
      ...parseGate(source.forgeability, "forgeability"),
      assessedAt: optionalString(forgeabilitySource.assessedAt, "forgeability.assessedAt"),
      risks: stringList(forgeabilitySource.risks ?? [], "forgeability.risks"),
      requirements: stringList(forgeabilitySource.requirements ?? [], "forgeability.requirements"),
      unknowns: stringList(forgeabilitySource.unknowns ?? [], "forgeability.unknowns"),
    },
    pipeline: {
      nextGate: stringValue(pipelineSource.nextGate ?? "", "pipeline.nextGate", false),
      nextAction: stringValue(pipelineSource.nextAction ?? "", "pipeline.nextAction", false),
      blockedBy: stringList(pipelineSource.blockedBy ?? [], "pipeline.blockedBy"),
      physicalTestStatus: enumValue(
        pipelineSource.physicalTestStatus ?? "Not Started",
        trialStatuses,
        "pipeline.physicalTestStatus",
      ),
      targetPrinters: stringList(pipelineSource.targetPrinters ?? [], "pipeline.targetPrinters"),
      intendedMaterials: stringList(pipelineSource.intendedMaterials ?? [], "pipeline.intendedMaterials"),
    },
    assets,
    provenance: {
      createdAt: stringValue(provenanceSource.createdAt, "provenance.createdAt"),
      createdBy: stringValue(provenanceSource.createdBy, "provenance.createdBy"),
      conversationRef: stringValue(provenanceSource.conversationRef ?? "", "provenance.conversationRef", false),
      notes: stringValue(provenanceSource.notes ?? "", "provenance.notes", false),
    },
  };

  validateMilestoneGates(manifest);
  return manifest;
}

function mapDesignStatus(stage: ForgepackStage): DesignProject["status"] {
  if (stage === "Released") return "Active";
  if (stage === "Production Approved") return "Production";
  if (stage === "Engineering" || stage === "Prototype" || stage === "Print Trial") return "Prototype";
  return "Concept";
}

function findPrimaryAsset(assets: ForgepackAsset[], kinds: ForgepackAssetKind[]): ForgepackAsset | undefined {
  return assets.find((asset) => kinds.includes(asset.kind) && asset.primary)
    ?? assets.find((asset) => kinds.includes(asset.kind));
}

function notesForManifest(manifest: ForgepackManifest): string {
  return [
    manifest.product.purpose,
    manifest.pipeline.nextAction ? `Next action: ${manifest.pipeline.nextAction}` : "",
    manifest.pipeline.blockedBy.length ? `Blocked by: ${manifest.pipeline.blockedBy.join("; ")}` : "",
    `Canon gate: ${manifest.canonGate.status}${manifest.canonGate.summary ? ` - ${manifest.canonGate.summary}` : ""}`,
    `Forgeability: ${manifest.forgeability.status}${manifest.forgeability.summary ? ` - ${manifest.forgeability.summary}` : ""}`,
  ].filter(Boolean).join("\n");
}

export function applyForgepackImport(data: AppData, nativeImport: NativeForgepackImport, importedAt = new Date().toISOString()): ForgepackApplicationResult {
  const manifest = parseForgepackManifest(JSON.parse(nativeImport.manifestJson));
  const importedPaths = new Map(nativeImport.assets.map((asset) => [asset.archivePath.split("\\").join("/"), asset.importedPath]));
  const assets: ForgepackAsset[] = manifest.assets.map((asset) => {
    const importedPath = importedPaths.get(asset.path.split("\\").join("/"));
    if (!importedPath) throw new Error(`Native import did not return a path for ${asset.path}.`);
    return {
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      archivePath: asset.path,
      importedPath,
      sha256: asset.sha256,
      version: asset.version,
      primary: asset.primary,
    };
  });

  const intakeRecord: ForgepackImportRecord = {
    packetId: manifest.packetId,
    formatVersion: manifest.formatVersion,
    productId: manifest.product.id,
    productName: manifest.product.name,
    stage: manifest.product.stage,
    sourcePackagePath: nativeImport.packagePath,
    assetRoot: nativeImport.assetRoot,
    importedAt,
    conceptRevision: manifest.product.conceptRevision,
    product: {
      tier: manifest.product.tier,
      line: manifest.product.line,
      category: manifest.product.category,
      collection: manifest.product.collection,
      purpose: manifest.product.purpose,
      measurements: manifest.product.measurements,
    },
    canonGate: manifest.canonGate,
    forgeability: manifest.forgeability,
    pipeline: manifest.pipeline,
    assets,
    provenance: manifest.provenance,
  };

  const next: AppData = {
    ...data,
    designProjects: [...data.designProjects],
    concepts: [...data.concepts],
    stls: [...data.stls],
    prototypes: [...data.prototypes],
    intakePackets: [
      intakeRecord,
      ...data.intakePackets.filter((packet) => packet.packetId !== manifest.packetId),
    ],
    activityLog: [...data.activityLog],
  };

  const existingPrototypeIndex = next.prototypes.findIndex((prototype) => prototype.id === manifest.product.id);
  const planningNotes = notesForManifest(manifest);
  const planningRecord = {
    id: manifest.product.id,
    designName: manifest.product.name,
    family: manifest.product.category,
    collection: manifest.product.collection,
    tier: manifest.product.tier,
    status: manifest.product.stage === "Planning" ? "Active Idea" as const : "In Progress" as const,
    priority: "Medium" as const,
    printerFit: manifest.pipeline.targetPrinters.join(", "),
    nextStep: manifest.pipeline.nextAction || manifest.pipeline.nextGate || "Review imported product packet.",
    notes: planningNotes,
  };
  const createdPlanningRecord = existingPrototypeIndex < 0;
  if (existingPrototypeIndex >= 0) next.prototypes[existingPrototypeIndex] = planningRecord;
  else next.prototypes.unshift(planningRecord);

  const rank = stageRank.get(manifest.product.stage) ?? 0;
  const conceptApproved = stageRank.get("Concept Approved") ?? 1;
  let createdDesignProject = false;
  let updatedDesignProject = false;

  if (rank >= conceptApproved) {
    const primaryConcept = findPrimaryAsset(assets, ["concept-image"]);
    const existingDesignIndex = next.designProjects.findIndex((design) => design.id === manifest.product.id);
    const previous = existingDesignIndex >= 0 ? next.designProjects[existingDesignIndex] : undefined;
    const design: DesignProject = {
      id: manifest.product.id,
      name: manifest.product.name,
      tier: manifest.product.tier,
      line: manifest.product.line,
      category: manifest.product.category,
      collection: manifest.product.collection,
      status: mapDesignStatus(manifest.product.stage),
      targetPrice: previous?.targetPrice ?? 0,
      estimatedFilamentGrams: previous?.estimatedFilamentGrams ?? 0,
      estimatedPrintHours: previous?.estimatedPrintHours ?? 0,
      available: previous?.available ?? 0,
      reorderPoint: previous?.reorderPoint ?? 0,
      designImagePath: previous?.designImagePath ?? "",
      conceptImagePath: primaryConcept?.importedPath ?? previous?.conceptImagePath ?? "",
      supportedRealmVariants: previous?.supportedRealmVariants ?? [],
      notes: [planningNotes, previous?.notes ?? ""].filter(Boolean).join("\n\n"),
    };
    if (existingDesignIndex >= 0) {
      next.designProjects[existingDesignIndex] = design;
      updatedDesignProject = true;
    } else {
      next.designProjects.unshift(design);
      createdDesignProject = true;
    }

    const conceptAsset = findPrimaryAsset(assets, ["concept-image"]);
    if (conceptAsset) {
      const measurementAsset = findPrimaryAsset(assets, ["measurement-image"]);
      const conceptId = `CON-${manifest.product.id}-${manifest.product.conceptRevision}`;
      const concept: ConceptSpec = {
        id: conceptId,
        designProjectId: manifest.product.id,
        title: `${manifest.product.name} ${manifest.product.conceptRevision}`,
        imageName: conceptAsset.archivePath.split("/").pop() ?? conceptAsset.label,
        imagePath: conceptAsset.importedPath,
        measurementImagePath: measurementAsset?.importedPath ?? "",
        referenceFolderPath: nativeImport.assetRoot,
        measurements: manifest.product.measurements,
        description: manifest.product.purpose,
        notes: planningNotes,
        linkedStlIds: [],
      };
      const conceptIndex = next.concepts.findIndex((item) => item.id === conceptId);
      if (conceptIndex >= 0) next.concepts[conceptIndex] = concept;
      else next.concepts.unshift(concept);
    }

    const modelAssets = assets.filter((asset) => asset.kind === "stl" || asset.kind === "3mf");
    for (const asset of modelAssets) {
      const stlId = `STL-${manifest.product.id}-${asset.id}`;
      const stl: STLRecord = {
        id: stlId,
        designProjectId: manifest.product.id,
        name: asset.label,
        fileName: asset.archivePath.split("/").pop() ?? asset.label,
        filePath: asset.importedPath,
        folderPath: nativeImport.assetRoot,
        libraryPath: asset.importedPath,
        version: asset.version,
        isPrimary: asset.primary || modelAssets.length === 1,
        assetStatus: "Linked",
        notes: manifest.forgeability.summary,
      };
      const stlIndex = next.stls.findIndex((item) => item.id === stlId);
      if (stlIndex >= 0) next.stls[stlIndex] = stl;
      else next.stls.unshift(stl);
    }
  } else {
    const synchronized = syncPlanningProductToDesign(next, manifest.product.id, {
      createIfMissing: false,
      recordActivity: false,
      occurredAt: importedAt,
    });
    if (synchronized) {
      Object.assign(next, synchronized.data);
      updatedDesignProject = true;
    }
  }

  const importEvent: ActivityEvent = {
    id: `ACT-${manifest.packetId}`,
    occurredAt: importedAt,
    kind: "import",
    station: rank >= conceptApproved ? "design-library" : "planning",
    summary: `Imported ${manifest.product.name} .forgepack at ${manifest.product.stage}.`,
    recordId: manifest.product.id,
  };
  next.activityLog = [
    importEvent,
    ...next.activityLog.filter((event) => event.id !== importEvent.id),
  ].slice(0, 500);

  return {
    data: next,
    record: intakeRecord,
    createdPlanningRecord,
    createdDesignProject,
    updatedDesignProject,
    importedAssetCount: assets.length,
  };
}
