import { inspectLocalPaths } from "../lib/recovery";
import type { AssetProvenance, FileRole, FoundryAsset } from "./contracts";
import { WORKBENCH_EVENT_SCHEMA_VERSION, type WorkbenchEvent } from "./events";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";

export type IntakeRequest = {
  assetId: string;
  filePath: string;
  role?: FileRole;
  provenance: AssetProvenance;
  revisionLabel?: string;
  reason?: string;
};

export type IntakeResult = {
  assetId: string;
  revisionId: string;
  fileId: string;
  sha256: string;
  sizeBytes: number;
  duplicateFileReused: boolean;
  inspectionJobId: string;
};

const SUPPORTED_EXTENSIONS = new Set(["stl", "3mf", "obj", "step", "stp", "glb", "gltf"]);

function eventId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

function extension(path: string): string {
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function mimeFor(format: string): string | undefined {
  if (format === "stl") return "model/stl";
  if (format === "3mf") return "model/3mf";
  if (format === "obj") return "model/obj";
  if (format === "step" || format === "stp") return "model/step";
  if (format === "glb") return "model/gltf-binary";
  if (format === "gltf") return "model/gltf+json";
  return undefined;
}

async function appendIntakeEvent(
  repository: WorkbenchRepository,
  eventType: WorkbenchEvent["eventType"],
  asset: FoundryAsset,
  correlationId: string,
  payload: Record<string, unknown>,
  revisionId?: string,
): Promise<void> {
  await repository.appendEvent({
    eventId: eventId("event"),
    eventType,
    timestamp: new Date().toISOString(),
    actorId: "forgekeeper:intake",
    correlationId,
    projectId: asset.owningProjectId,
    assetId: asset.assetId,
    revisionId,
    schemaVersion: WORKBENCH_EVENT_SCHEMA_VERSION,
    payload,
  });
}

export class WorkbenchIntakeService {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly service = getWorkbenchService(),
  ) {}

  async registerLocalFile(request: IntakeRequest): Promise<IntakeResult> {
    const path = request.filePath.trim();
    if (!path) throw new Error("Choose or enter a local geometry file path before Intake.");

    const format = extension(path);
    if (!SUPPORTED_EXTENSIONS.has(format)) {
      throw new Error(`Unsupported Intake format .${format || "unknown"}. Supported geometry: STL, 3MF, OBJ, STEP/STP, GLB, GLTF.`);
    }

    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === request.assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${request.assetId}`);

    const correlationId = eventId("intake");
    await appendIntakeEvent(this.repository, "asset.intake.started", asset, correlationId, { filePath: path, format });

    const inspections = await inspectLocalPaths([path]);
    const inspected = inspections?.[0];
    if (!inspected) throw new Error("Native file inspection is unavailable. Intake must run in the desktop ForgeKeeper app.");
    if (!inspected.exists) throw new Error(inspected.error || `File does not exist: ${path}`);
    if (!inspected.isFile) throw new Error(`Intake path is not a file: ${path}`);
    if (!inspected.sha256 || !/^[a-f0-9]{64}$/i.test(inspected.sha256)) throw new Error("File inspection did not return a valid SHA-256 fingerprint.");

    const prior = state.files.find((item) => item.sha256.toLowerCase() === inspected.sha256!.toLowerCase());
    const registered = await this.service.registerFile({
      sha256: inspected.sha256,
      fileName: fileName(path),
      storagePath: path,
      format,
      mimeType: mimeFor(format),
      sizeBytes: inspected.sizeBytes ?? 0,
      role: request.role ?? "geometry",
      source: { ...request.provenance, importedAt: request.provenance.importedAt ?? new Date().toISOString() },
      ownedByFoundry: request.provenance.sourceType !== "download",
      license: request.provenance.license,
    });

    const parentRevisionId = asset.currentRevisionId;
    const revision = await this.service.createRevision({
      assetId: asset.assetId,
      parentRevisionId,
      revisionLabel: request.revisionLabel?.trim() || `intake-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      authorActorId: "forgekeeper:intake",
      process: "controlled-intake",
      reason: request.reason?.trim() || `Controlled Intake of ${registered.fileName}.`,
      sourceFileIds: [registered.fileId],
      outputFileIds: [],
      inspectionResultIds: [],
      manufacturingApproval: "not-reviewed",
    });

    await this.repository.upsertAsset({
      ...asset,
      currentRevisionId: revision.revisionId,
      lifecycleStatus: "inspection-required",
      provenance: asset.provenance.sourceType === "manual" && asset.provenance.sourceLabel?.includes("Legacy ForgeKeeper")
        ? request.provenance
        : asset.provenance,
      updatedAt: new Date().toISOString(),
    });

    const inspection = await this.service.requestInspection(asset.assetId, revision.revisionId);

    await appendIntakeEvent(this.repository, "asset.intake.completed", asset, correlationId, {
      fileId: registered.fileId,
      sha256: registered.sha256,
      duplicateFileReused: Boolean(prior),
      inspectionJobId: inspection.jobId,
    }, revision.revisionId);

    return {
      assetId: asset.assetId,
      revisionId: revision.revisionId,
      fileId: registered.fileId,
      sha256: registered.sha256,
      sizeBytes: inspected.sizeBytes ?? 0,
      duplicateFileReused: Boolean(prior),
      inspectionJobId: inspection.jobId,
    };
  }
}

let singleton: WorkbenchIntakeService | null = null;
export function getWorkbenchIntakeService(): WorkbenchIntakeService {
  singleton ??= new WorkbenchIntakeService();
  return singleton;
}
