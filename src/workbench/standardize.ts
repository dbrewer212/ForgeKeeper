import type { FoundryFile } from "./contracts";
import { storeManagedWorkbenchFile } from "./managedFiles";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";

export type StandardizeRevisionRequest = {
  assetId: string;
  targetHeightMm: number;
  profileId: string;
  profileLabel: string;
};

export type StandardizeRevisionResult = {
  assetId: string;
  sourceRevisionId: string;
  revisionId: string;
  fileId: string;
  managedPath: string;
  sha256: string;
  scaleFactor: number;
  targetHeightMm: number;
  inspectionJobId: string;
};

export class WorkbenchStandardizationService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly workbench = getWorkbenchService(),
  ) {}

  async standardizeCurrentRevision(request: StandardizeRevisionRequest): Promise<StandardizeRevisionResult> {
    if (!Number.isFinite(request.targetHeightMm) || request.targetHeightMm <= 0) {
      throw new Error("Choose a positive target height before standardizing geometry.");
    }

    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === request.assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${request.assetId}`);
    if (!asset.currentRevisionId) throw new Error("This asset has no current geometry revision to standardize.");

    const sourceRevision = state.revisions.find((item) => item.revisionId === asset.currentRevisionId && item.assetId === asset.assetId);
    if (!sourceRevision) throw new Error(`Current revision ${asset.currentRevisionId} could not be loaded.`);

    const sourceFiles = sourceRevision.sourceFileIds
      .map((fileId) => state.files.find((file) => file.fileId === fileId))
      .filter((file): file is FoundryFile => Boolean(file));
    const geometry = sourceFiles.find((file) => file.role === "geometry" && file.format.toLowerCase() === "stl")
      ?? sourceFiles.find((file) => file.format.toLowerCase() === "stl");
    if (!geometry) throw new Error("Scale standardization currently requires an STL source on the current revision.");

    const managed = await storeManagedWorkbenchFile(geometry.storagePath, geometry.sha256, request.targetHeightMm);
    if (!managed.scaleFactor || !Number.isFinite(managed.scaleFactor)) {
      throw new Error("Native scale standardization did not return a valid scale factor.");
    }

    const registered = await this.workbench.registerFile({
      sha256: managed.sha256,
      fileName: `${safeName(asset.name)}-${request.profileId}.stl`,
      storagePath: managed.managedPath,
      format: "stl",
      mimeType: "model/stl",
      sizeBytes: managed.sizeBytes,
      role: "geometry",
      source: {
        sourceType: "other",
        sourceLabel: `ForgeKeeper standardized geometry · ${request.profileLabel}`,
        sourceUri: `workbench:revision:${sourceRevision.revisionId}`,
        externalId: sourceRevision.revisionId,
        importedAt: new Date().toISOString(),
      },
      ownedByFoundry: true,
    });

    const revision = await this.workbench.createRevision({
      assetId: asset.assetId,
      parentRevisionId: sourceRevision.revisionId,
      revisionLabel: `standardized-${request.profileId}`,
      authorActorId: "forgekeeper:production-orchestrator",
      process: "uniform-scale-standardization",
      reason: `Uniformly scaled XYZ by ${managed.scaleFactor.toFixed(6)} to target Z height ${request.targetHeightMm.toFixed(2)} mm using ${request.profileLabel}.`,
      sourceFileIds: [registered.fileId],
      outputFileIds: [registered.fileId],
      inspectionResultIds: [],
      manufacturingApproval: "not-reviewed",
    });

    await this.repository.upsertAsset({
      ...asset,
      currentRevisionId: revision.revisionId,
      lifecycleStatus: "inspection-required",
      updatedAt: new Date().toISOString(),
    });

    const inspection = await this.workbench.requestInspection(asset.assetId, revision.revisionId);
    return {
      assetId: asset.assetId,
      sourceRevisionId: sourceRevision.revisionId,
      revisionId: revision.revisionId,
      fileId: registered.fileId,
      managedPath: managed.managedPath,
      sha256: managed.sha256,
      scaleFactor: managed.scaleFactor,
      targetHeightMm: request.targetHeightMm,
      inspectionJobId: inspection.jobId,
    };
  }
}

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
}

let singleton: WorkbenchStandardizationService | null = null;
export function getWorkbenchStandardizationService(): WorkbenchStandardizationService {
  singleton ??= new WorkbenchStandardizationService();
  return singleton;
}
