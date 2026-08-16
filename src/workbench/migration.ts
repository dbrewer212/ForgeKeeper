import type { AppData, Product, ProductStatus } from "../types/domain";
import type {
  AssetLifecycleStatus,
  AssetRelationship,
  AssetRevision,
  FoundryAsset,
  FoundryFile,
  FoundryVariant,
  ManufacturingSpec,
  PreparationRecord,
  WorkbenchState,
} from "./contracts";

export type LegacyWorkbenchMigration = {
  state: WorkbenchState;
  migratedProductIds: string[];
  migratedOrderIds: string[];
  pendingIntakeStlIds: string[];
};

function assetId(productId: string): string { return `asset:legacy:${productId}`; }
function revisionId(productId: string): string { return `revision:legacy:${productId}:baseline`; }
function specId(productId: string): string { return `mfgspec:legacy:${productId}:baseline`; }
function variantAssetId(variantId: string): string { return `asset:legacy-variant:${variantId}`; }

function lifecycle(status: ProductStatus): AssetLifecycleStatus {
  switch (status) {
    case "Concept": return "concept";
    case "Prototype": return "in-development";
    case "Production": return "manufacturing-review";
    case "Active": return "registered";
    case "Archived": return "archived";
  }
}

function assetType(product: Product): FoundryAsset["assetType"] {
  const category = product.category.toLowerCase();
  if (category.includes("character") || category.includes("creature")) return "character";
  if (category.includes("tool") || category.includes("fixture")) return "tooling";
  if (category.includes("component") || category.includes("part")) return "component";
  return "product";
}

function verifiedLibraryFiles(data: AppData): FoundryFile[] {
  return data.libraryAssets
    .filter((item) => Boolean(item.sha256?.trim()))
    .map((item) => ({
      fileId: `file:library:${item.id}`,
      sha256: item.sha256.trim(),
      fileName: item.name,
      storagePath: item.libraryPath,
      format: item.name.includes(".") ? item.name.split(".").pop()!.toLowerCase() : "unknown",
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      role: item.assetType === "Production Reference" ? "reference" : item.assetType === "Model" ? "geometry" : item.assetType === "Document" ? "documentation" : "reference",
      source: { sourceType: "manual", sourceLabel: "ForgeKeeper Library migration", importedAt: item.modifiedAt },
      ownedByFoundry: true,
      importedAt: item.modifiedAt,
    }));
}

export function migrateLegacyAppDataToWorkbench(data: AppData, migratedAt = new Date().toISOString()): LegacyWorkbenchMigration {
  const assets: FoundryAsset[] = [];
  const revisions: AssetRevision[] = [];
  const relationships: AssetRelationship[] = [];
  const variants: FoundryVariant[] = [];
  const manufacturingSpecs: ManufacturingSpec[] = [];
  const preparations: PreparationRecord[] = [];
  const pendingIntakeStlIds: string[] = [];

  for (const product of data.products) {
    const id = assetId(product.id);
    const revId = revisionId(product.id);
    const linkedStls = data.stls.filter((stl) => stl.productId === product.id);
    pendingIntakeStlIds.push(...linkedStls.filter((stl) => Boolean(stl.filePath || stl.fileName)).map((stl) => stl.id));

    assets.push({
      assetId: id,
      name: product.name,
      assetType: assetType(product),
      collectionId: product.collection ? `collection:legacy:${product.collection}` : undefined,
      lifecycleStatus: lifecycle(product.status),
      provenance: { sourceType: "manual", sourceLabel: "Legacy ForgeKeeper migration", importedAt: migratedAt },
      tags: [product.line, product.category, product.tier].filter(Boolean),
      currentRevisionId: revId,
      notes: product.notes,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    });

    revisions.push({
      revisionId: revId,
      assetId: id,
      revisionLabel: "legacy-baseline",
      authorActorId: "migration:forgekeeper-legacy",
      process: "legacy-workspace-migration",
      reason: linkedStls.length
        ? `Baseline imported from legacy ForgeKeeper. ${linkedStls.length} STL record(s) remain pending controlled Intake/hash registration: ${linkedStls.map((item) => item.id).join(", ")}.`
        : "Baseline imported from legacy ForgeKeeper without registered geometry.",
      sourceFileIds: [],
      outputFileIds: [],
      inspectionResultIds: [],
      manufacturingApproval: "not-reviewed",
      createdAt: migratedAt,
    });

    manufacturingSpecs.push({
      manufacturingSpecId: specId(product.id),
      assetId: id,
      revisionId: revId,
      intendedProcess: "legacy-unspecified-additive",
      approvedMaterialProfileIds: [],
      toleranceRequirements: [],
      criticalFeatures: [],
      preferredOrientations: [],
      forbiddenOrientations: [],
      machineConstraints: [],
      approvedPrinterIds: [],
      approvedProfileRefs: [],
      supportRules: [],
      approvalState: "not-reviewed",
      updatedAt: migratedAt,
    });
  }

  for (const legacyVariant of data.variants) {
    const parent = data.products.find((product) => product.id === legacyVariant.productId);
    if (!parent) continue;
    const parentAssetId = assetId(parent.id);
    const childAssetId = variantAssetId(legacyVariant.id);
    assets.push({
      assetId: childAssetId,
      name: legacyVariant.name,
      assetType: assetType(parent),
      collectionId: parent.collection ? `collection:legacy:${parent.collection}` : undefined,
      lifecycleStatus: legacyVariant.isActive ? "in-development" : "retired",
      canonicalAssetId: parentAssetId,
      provenance: { sourceType: "manual", sourceLabel: "Legacy ForgeKeeper variant migration", importedAt: migratedAt },
      tags: [parent.line, parent.category, legacyVariant.realm],
      notes: legacyVariant.notes,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    });
    variants.push({
      variantId: `variant:legacy:${legacyVariant.id}`,
      assetId: childAssetId,
      parentAssetId,
      parentRevisionId: revisionId(parent.id),
      name: legacyVariant.name,
      family: legacyVariant.realm,
      transformationGraph: [],
      reviewRequired: true,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    });
    relationships.push({
      relationshipId: `relationship:legacy-variant:${legacyVariant.id}`,
      type: "variant-of",
      fromAssetId: childAssetId,
      toAssetId: parentAssetId,
      toRevisionId: revisionId(parent.id),
      metadata: { legacyVariantId: legacyVariant.id, realm: legacyVariant.realm },
      createdBy: "migration:forgekeeper-legacy",
      createdAt: migratedAt,
    });
  }

  for (const order of data.orders) {
    const product = data.products.find((item) => item.id === order.productId);
    if (!product) continue;
    const spool = order.filamentId ? data.filament.find((item) => item.id === order.filamentId) : undefined;
    preparations.push({
      preparationId: `preparation:legacy-order:${order.id}`,
      assetId: assetId(product.id),
      revisionId: revisionId(product.id),
      manufacturingSpecId: specId(product.id),
      printerId: order.printerId,
      materialProfileId: spool?.profileId,
      orientation: undefined,
      supportIntent: undefined,
      assumptions: [
        `Migrated from legacy production record ${order.id}.`,
        `Legacy status was ${order.status}; this migration does not imply manufacturing approval.`,
        "Customer/contact details remain in compatibility storage and are not copied into manufacturing identity.",
      ],
      operationGraph: [],
      generatedFileIds: [],
      status: order.status === "Queued" ? "draft" : "submitted",
      createdBy: "migration:forgekeeper-legacy",
      createdAt: migratedAt,
    });
  }

  return {
    state: {
      assets,
      files: verifiedLibraryFiles(data),
      revisions,
      relationships,
      variants,
      assemblies: [],
      manufacturingSpecs,
      inspections: [],
      preparations,
      printRecords: [],
    },
    migratedProductIds: data.products.map((item) => item.id),
    migratedOrderIds: data.orders.map((item) => item.id),
    pendingIntakeStlIds: Array.from(new Set(pendingIntakeStlIds)),
  };
}
