import { invoke } from "@tauri-apps/api/core";
import type { FoundryFile, FoundryVariant, InspectionResult, WorkbenchOperation } from "./contracts";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";
import {
  calculateUniformStorefrontScale,
  recommendStorefrontScale,
  type StorefrontScaleRecommendation,
  type StorefrontScaleTier,
} from "./storefrontScalePolicy";

export type NativeStorefrontScaleResult = {
  sourcePath: string;
  outputPath: string;
  sha256: string;
  sizeBytes: number;
  scaleFactor: number;
  sourceBoundsMm: { x: number; y: number; z: number };
  outputBoundsMm: { x: number; y: number; z: number };
  format: "stl";
};

export type StorefrontScalePreparation = {
  variant: FoundryVariant;
  generatedFile: FoundryFile;
  recommendation: StorefrontScaleRecommendation;
  appliedTier: StorefrontScaleTier;
  nativeResult: NativeStorefrontScaleResult;
  reusedExisting: boolean;
};

function id(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "foundry-model";
}

function latestInspection(inspections: InspectionResult[], assetId: string, revisionId: string): InspectionResult | undefined {
  return inspections
    .filter((item) => item.assetId === assetId && item.revisionId === revisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function tierFromVariant(variant: FoundryVariant): StorefrontScaleTier | undefined {
  const scale = variant.transformationGraph.find((operation) => operation.type === "scale");
  const value = Number(scale?.parameters.targetInches);
  return value === 3 || value === 4 || value === 5 ? value : undefined;
}

export class WorkbenchStorefrontScaleService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly service = getWorkbenchService(),
  ) {}

  async prepare(assetId: string, overrideTier?: StorefrontScaleTier): Promise<StorefrontScalePreparation> {
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${assetId}`);
    if (asset.tags.some((tag) => tag.toLowerCase() === "digital-storefront")) {
      throw new Error("This asset is already a digital storefront derivative. Select its canonical/master asset instead.");
    }
    if (!asset.currentRevisionId) throw new Error("Storefront scaling requires a current registered asset revision.");

    const revision = state.revisions.find((item) => item.revisionId === asset.currentRevisionId && item.assetId === asset.assetId);
    if (!revision) throw new Error("The current asset revision could not be resolved.");
    const inspection = latestInspection(state.inspections, asset.assetId, revision.revisionId);
    if (!inspection?.geometry.boundsMm) {
      throw new Error("Run Inspector on the exact current revision before preparing a storefront-scaled model.");
    }

    const recommendation = recommendStorefrontScale(asset, inspection);
    const appliedTier = overrideTier ?? recommendation.targetInches;
    const projection = calculateUniformStorefrontScale(inspection.geometry.boundsMm, appliedTier);

    const existingVariant = state.variants.find((variant) =>
      variant.family === "thangs-storefront"
      && variant.parentAssetId === asset.assetId
      && variant.parentRevisionId === revision.revisionId
      && tierFromVariant(variant) === appliedTier
    );
    if (existingVariant?.currentRevisionId) {
      const existingRevision = state.revisions.find((item) => item.assetId === existingVariant.assetId && item.revisionId === existingVariant.currentRevisionId);
      const generatedFile = existingRevision?.outputFileIds
        .map((fileId) => state.files.find((file) => file.fileId === fileId))
        .find((file): file is FoundryFile => Boolean(file && file.role === "geometry"));
      if (generatedFile) {
        return {
          variant: existingVariant,
          generatedFile,
          recommendation,
          appliedTier,
          nativeResult: {
            sourcePath: "existing-storefront-derivative",
            outputPath: generatedFile.storagePath,
            sha256: generatedFile.sha256,
            sizeBytes: generatedFile.sizeBytes,
            scaleFactor: projection.scaleFactor,
            sourceBoundsMm: inspection.geometry.boundsMm,
            outputBoundsMm: projection.scaledBoundsMm,
            format: "stl",
          },
          reusedExisting: true,
        };
      }
    }

    const sourceFiles = [...revision.outputFileIds, ...revision.sourceFileIds]
      .map((fileId) => state.files.find((file) => file.fileId === fileId))
      .filter((file): file is FoundryFile => Boolean(file));
    const geometry = sourceFiles.find((file) => file.role === "geometry") ?? sourceFiles[0];
    if (!geometry) throw new Error("The current revision has no registered geometry file to scale.");

    const nativeResult = await invoke<NativeStorefrontScaleResult>("workbench_scale_geometry", {
      path: geometry.storagePath,
      targetMaxMm: projection.targetMaxMm,
    });

    const generatedFile = await this.service.registerFile({
      sha256: nativeResult.sha256,
      fileName: `${slug(asset.name)}-${appliedTier}in-storefront.stl`,
      storagePath: nativeResult.outputPath,
      format: "stl",
      mimeType: "model/stl",
      sizeBytes: nativeResult.sizeBytes,
      role: "geometry",
      source: {
        sourceType: "other",
        sourceLabel: `Forgekeeper digital storefront ${appliedTier}-inch auto-scale`,
        creator: "Forgekeeper",
        license: asset.provenance.license,
      },
      ownedByFoundry: true,
      license: asset.provenance.license,
    });

    const derivedAsset = await this.service.createAsset({
      name: `${asset.name} · Storefront ${appliedTier}in`,
      assetType: asset.assetType,
      owningProjectId: asset.owningProjectId,
      collectionId: asset.collectionId,
      lifecycleStatus: "registered",
      canonicalAssetId: asset.canonicalAssetId ?? asset.assetId,
      canonicalRevisionId: revision.revisionId,
      provenance: {
        sourceType: "other",
        sourceLabel: "Forgekeeper digital storefront derivative",
        creator: "Forgekeeper",
        license: asset.provenance.license,
        importedAt: new Date().toISOString(),
      },
      tags: Array.from(new Set([...asset.tags, "digital-storefront", "thangs", `storefront-${appliedTier}in`])),
      notes: `Derived digital-download geometry. Master geometry remains unchanged. Uniform scale factor ${nativeResult.scaleFactor.toFixed(6)} targets a ${appliedTier}-inch (${projection.targetMaxMm.toFixed(1)} mm) maximum overall dimension. Physical-product sizing is intentionally independent.`,
    });

    const derivedRevision = await this.service.createRevision({
      assetId: derivedAsset.assetId,
      revisionLabel: `storefront-${appliedTier}in`,
      authorActorId: "forgekeeper:storefront-scale",
      process: "forgekeeper-storefront-autoscale",
      reason: `Create a non-destructive ${appliedTier}-inch digital storefront release from ${asset.name}.`,
      sourceFileIds: [geometry.fileId],
      outputFileIds: [generatedFile.fileId],
      inspectionResultIds: [],
      manufacturingApproval: "not-reviewed",
    });

    const scaleOperation: WorkbenchOperation = {
      operationId: id("operation"),
      type: "scale",
      parameters: {
        x: nativeResult.scaleFactor,
        y: nativeResult.scaleFactor,
        z: nativeResult.scaleFactor,
        targetInches: appliedTier,
        targetMaxMm: projection.targetMaxMm,
        sourceMaxMm: projection.sourceMaxMm,
        policy: overrideTier ? "manual-tier-override" : recommendation.source,
      },
      inputRevisionId: revision.revisionId,
      outputRevisionId: derivedRevision.revisionId,
      createdAt: new Date().toISOString(),
    };

    const blockingFindings = inspection.findings.some((finding) => finding.severity === "critical" || finding.severity === "error");
    const variant = await this.service.createVariant({
      assetId: derivedAsset.assetId,
      parentAssetId: asset.assetId,
      parentRevisionId: revision.revisionId,
      name: `${asset.name} · ${appliedTier}in Digital Storefront`,
      family: "thangs-storefront",
      transformationGraph: [scaleOperation],
      currentRevisionId: derivedRevision.revisionId,
      reviewRequired: blockingFindings,
    });

    await this.service.linkRelationship({
      type: "variant-of",
      fromAssetId: derivedAsset.assetId,
      fromRevisionId: derivedRevision.revisionId,
      toAssetId: asset.assetId,
      toRevisionId: revision.revisionId,
      metadata: {
        purpose: "digital-storefront",
        marketplace: "Thangs",
        targetInches: appliedTier,
        targetMaxMm: projection.targetMaxMm,
        scaleFactor: nativeResult.scaleFactor,
        masterGeometryPreserved: true,
        physicalProductSizingIndependent: true,
      },
      createdBy: "forgekeeper:storefront-scale",
    });

    return { variant, generatedFile, recommendation, appliedTier, nativeResult, reusedExisting: false };
  }
}

let singleton: WorkbenchStorefrontScaleService | null = null;
export function getWorkbenchStorefrontScaleService(): WorkbenchStorefrontScaleService {
  singleton ??= new WorkbenchStorefrontScaleService();
  return singleton;
}
