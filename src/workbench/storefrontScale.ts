import { invoke } from "@tauri-apps/api/core";
import type { PrinterRecord } from "../types/domain";
import type { FoundryFile, FoundryVariant, InspectionResult, WorkbenchOperation } from "./contracts";
import { getWorkbenchInspectorService } from "./inspector";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";
import {
  calculateUniformProfileScale,
  getScaleProfile,
  type FoundryScaleProfile,
  type ScaleProfileId,
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
  profile: FoundryScaleProfile;
  nativeResult: NativeStorefrontScaleResult;
  derivedInspection: InspectionResult;
  reusedExisting: boolean;
};

function id(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

function fileStem(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "Foundry_Model";
}

function latestInspection(inspections: InspectionResult[], assetId: string, revisionId: string): InspectionResult | undefined {
  return inspections
    .filter((item) => item.assetId === assetId && item.revisionId === revisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function profileFromVariant(variant: FoundryVariant): ScaleProfileId | undefined {
  const scale = variant.transformationGraph.find((operation) => operation.type === "scale");
  const value = scale?.parameters.profileId;
  return typeof value === "string" ? value as ScaleProfileId : undefined;
}

function targetAxisValue(bounds: { x: number; y: number; z: number }, axis: "x" | "y" | "z"): number {
  return bounds[axis];
}

export class WorkbenchStorefrontScaleService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly service = getWorkbenchService(),
  ) {}

  async prepare(assetId: string, profileId: ScaleProfileId, printers: PrinterRecord[]): Promise<StorefrontScalePreparation> {
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${assetId}`);
    if (asset.tags.some((tag) => tag.toLowerCase() === "derived-scale-profile")) {
      throw new Error("This asset is already a scaled derivative. Select its canonical/master asset instead.");
    }
    if (!asset.currentRevisionId) throw new Error("Scale-profile preparation requires a current registered asset revision.");

    const revision = state.revisions.find((item) => item.revisionId === asset.currentRevisionId && item.assetId === asset.assetId);
    if (!revision) throw new Error("The current asset revision could not be resolved.");
    const inspection = latestInspection(state.inspections, asset.assetId, revision.revisionId);
    if (!inspection?.geometry.boundsMm) {
      throw new Error("Run Inspector on the exact current revision before applying a scale profile.");
    }

    const profile = getScaleProfile(profileId);
    const projection = calculateUniformProfileScale(inspection.geometry.boundsMm, profile);

    const existingVariant = state.variants.find((variant) =>
      variant.family === "foundry-scale-profile"
      && variant.parentAssetId === asset.assetId
      && variant.parentRevisionId === revision.revisionId
      && profileFromVariant(variant) === profile.profileId
    );
    if (existingVariant?.currentRevisionId) {
      const existingRevision = state.revisions.find((item) => item.assetId === existingVariant.assetId && item.revisionId === existingVariant.currentRevisionId);
      const generatedFile = existingRevision?.outputFileIds
        .map((fileId) => state.files.find((file) => file.fileId === fileId))
        .find((file): file is FoundryFile => Boolean(file && file.role === "geometry"));
      if (generatedFile && existingRevision) {
        let derivedInspection = latestInspection(state.inspections, existingVariant.assetId, existingRevision.revisionId);
        if (!derivedInspection) {
          derivedInspection = (await getWorkbenchInspectorService().inspectRevision(existingVariant.assetId, existingRevision.revisionId, printers)).inspection;
        }
        return {
          variant: existingVariant,
          generatedFile,
          profile,
          nativeResult: {
            sourcePath: "existing-profile-derivative",
            outputPath: generatedFile.storagePath,
            sha256: generatedFile.sha256,
            sizeBytes: generatedFile.sizeBytes,
            scaleFactor: projection.scaleFactor,
            sourceBoundsMm: inspection.geometry.boundsMm,
            outputBoundsMm: derivedInspection.geometry.boundsMm ?? projection.scaledBoundsMm,
            format: "stl",
          },
          derivedInspection,
          reusedExisting: true,
        };
      }
    }

    const sourceFiles = [...revision.outputFileIds, ...revision.sourceFileIds]
      .map((fileId) => state.files.find((file) => file.fileId === fileId))
      .filter((file): file is FoundryFile => Boolean(file));
    const geometry = sourceFiles.find((file) => file.role === "geometry") ?? sourceFiles[0];
    if (!geometry) throw new Error("The current revision has no registered geometry file to scale.");

    // The native scaler currently accepts a maximum-dimension target. Convert the selected
    // axis profile into an equivalent maximum-dimension target so the resulting uniform
    // scale factor is exactly targetAxis/sourceAxis while preserving every proportion.
    const sourceMaxMm = Math.max(inspection.geometry.boundsMm.x, inspection.geometry.boundsMm.y, inspection.geometry.boundsMm.z);
    const equivalentTargetMaxMm = sourceMaxMm * projection.scaleFactor;
    const nativeResult = await invoke<NativeStorefrontScaleResult>("workbench_scale_geometry", {
      path: geometry.storagePath,
      targetMaxMm: equivalentTargetMaxMm,
    });

    const generatedFile = await this.service.registerFile({
      sha256: nativeResult.sha256,
      fileName: `${fileStem(asset.name)}_${profile.fileSuffix}.stl`,
      storagePath: nativeResult.outputPath,
      format: "stl",
      mimeType: "model/stl",
      sizeBytes: nativeResult.sizeBytes,
      role: "geometry",
      source: {
        sourceType: "other",
        sourceLabel: `Forgekeeper scale profile: ${profile.label}`,
        creator: "Forgekeeper",
        license: asset.provenance.license,
      },
      ownedByFoundry: true,
      license: asset.provenance.license,
    });

    const derivedAsset = await this.service.createAsset({
      name: `${asset.name} · ${profile.label}`,
      assetType: asset.assetType,
      owningProjectId: asset.owningProjectId,
      collectionId: asset.collectionId,
      lifecycleStatus: "inspection-required",
      canonicalAssetId: asset.canonicalAssetId ?? asset.assetId,
      canonicalRevisionId: revision.revisionId,
      provenance: {
        sourceType: "other",
        sourceLabel: `Forgekeeper derived scale profile: ${profile.label}`,
        creator: "Forgekeeper",
        license: asset.provenance.license,
        importedAt: new Date().toISOString(),
      },
      tags: Array.from(new Set([
        ...asset.tags,
        "derived-scale-profile",
        "digital-storefront",
        "thangs",
        `scale-profile:${profile.profileId}`,
      ])),
      notes: `Derived geometry using ${profile.label}. ${profile.targetAxis.toUpperCase()} targets ${profile.targetInches.toFixed(2)} in / ${profile.targetDimensionMm.toFixed(1)} mm with proportions preserved. Master geometry remains unchanged. Physical-product sizing is intentionally independent.`,
    });

    const derivedRevision = await this.service.createRevision({
      assetId: derivedAsset.assetId,
      revisionLabel: profile.fileSuffix,
      authorActorId: "forgekeeper:scale-profile",
      process: "forgekeeper-scale-profile",
      reason: `Create a non-destructive ${profile.label} derivative from ${asset.name}.`,
      sourceFileIds: [geometry.fileId],
      outputFileIds: [generatedFile.fileId],
      inspectionResultIds: [],
      manufacturingApproval: "not-reviewed",
    });

    const derivedInspection = (await getWorkbenchInspectorService().inspectRevision(
      derivedAsset.assetId,
      derivedRevision.revisionId,
      printers,
    )).inspection;

    const inspectedBounds = derivedInspection.geometry.boundsMm;
    if (!inspectedBounds) {
      throw new Error("Derived geometry inspection did not return physical bounds.");
    }
    const inspectedTarget = targetAxisValue(inspectedBounds, profile.targetAxis);
    if (Math.abs(inspectedTarget - profile.targetDimensionMm) > 0.1) {
      throw new Error(`Derived geometry failed scale verification: ${profile.targetAxis.toUpperCase()} measured ${inspectedTarget.toFixed(3)} mm instead of ${profile.targetDimensionMm.toFixed(3)} mm.`);
    }

    const scaleOperation: WorkbenchOperation = {
      operationId: id("operation"),
      type: "scale",
      parameters: {
        x: nativeResult.scaleFactor,
        y: nativeResult.scaleFactor,
        z: nativeResult.scaleFactor,
        profileId: profile.profileId,
        profileLabel: profile.label,
        targetAxis: profile.targetAxis,
        targetInches: profile.targetInches,
        targetDimensionMm: profile.targetDimensionMm,
        sourceDimensionMm: projection.sourceDimensionMm,
        preserveProportions: true,
      },
      inputRevisionId: revision.revisionId,
      outputRevisionId: derivedRevision.revisionId,
      createdAt: new Date().toISOString(),
    };

    const blockingFindings = derivedInspection.findings.some((finding) => finding.severity === "critical" || finding.severity === "error");
    const variant = await this.service.createVariant({
      assetId: derivedAsset.assetId,
      parentAssetId: asset.assetId,
      parentRevisionId: revision.revisionId,
      name: `${asset.name} · ${profile.label}`,
      family: "foundry-scale-profile",
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
        purpose: profile.purpose,
        marketplace: "Thangs",
        profileId: profile.profileId,
        profileLabel: profile.label,
        targetAxis: profile.targetAxis,
        targetInches: profile.targetInches,
        targetDimensionMm: profile.targetDimensionMm,
        scaleFactor: nativeResult.scaleFactor,
        preserveProportions: true,
        derivedInspectionResultId: derivedInspection.inspectionResultId,
        masterGeometryPreserved: true,
        physicalProductSizingIndependent: true,
      },
      createdBy: "forgekeeper:scale-profile",
    });

    return { variant, generatedFile, profile, nativeResult, derivedInspection, reusedExisting: false };
  }
}

let singleton: WorkbenchStorefrontScaleService | null = null;
export function getWorkbenchStorefrontScaleService(): WorkbenchStorefrontScaleService {
  singleton ??= new WorkbenchStorefrontScaleService();
  return singleton;
}
