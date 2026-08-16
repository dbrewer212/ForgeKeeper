import { invoke } from "@tauri-apps/api/core";
import type { PrinterRecord } from "../types/domain";
import type { InspectionFinding, InspectionResult } from "./contracts";
import { WORKBENCH_EVENT_SCHEMA_VERSION } from "./events";
import { WorkbenchRepository } from "./repository";

export type NativeGeometryInspection = {
  path: string;
  format: string;
  boundsMm?: { x: number; y: number; z: number };
  triangleCount?: number;
  shellCount?: number;
  openEdgeCount?: number;
  manifold?: boolean;
  vertexCount?: number;
  warnings: string[];
};

export type InspectorRunResult = {
  inspection: InspectionResult;
  sourceFileId: string;
  sourcePath: string;
};

function id(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}

function parseBuildVolume(value: string): { x: number; y: number; z: number } | null {
  const matches = value.match(/([\d.]+)\s*[x×]\s*([\d.]+)\s*[x×]\s*([\d.]+)/i);
  if (!matches) return null;
  const [x, y, z] = matches.slice(1).map(Number);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function fitsEnvelope(bounds: { x: number; y: number; z: number }, volume: { x: number; y: number; z: number }): boolean {
  const model = [bounds.x, bounds.y, bounds.z].sort((a, b) => a - b);
  const machine = [volume.x, volume.y, volume.z].sort((a, b) => a - b);
  return model.every((dimension, index) => dimension <= machine[index]);
}

function findingsFromNative(native: NativeGeometryInspection): InspectionFinding[] {
  const findings: InspectionFinding[] = [];
  if (native.manifold === false) {
    findings.push({
      findingId: id("finding"),
      category: "integrity",
      severity: "error",
      summary: "Mesh is not manifold.",
      evidence: { openEdgeCount: native.openEdgeCount, shellCount: native.shellCount },
      recommendation: "Repair mesh topology before manufacturing approval.",
      confidence: 1,
    });
  }
  if ((native.openEdgeCount ?? 0) > 0) {
    findings.push({
      findingId: id("finding"),
      category: "geometry",
      severity: "warning",
      summary: `${native.openEdgeCount} open boundary edge(s) detected.`,
      evidence: { openEdgeCount: native.openEdgeCount },
      recommendation: "Inspect whether the opening is intentional; repair if the part is intended to be watertight.",
      confidence: 1,
    });
  }
  if ((native.shellCount ?? 1) > 1) {
    findings.push({
      findingId: id("finding"),
      category: "geometry",
      severity: "warning",
      summary: `${native.shellCount} disconnected geometric shell(s) detected.`,
      evidence: { shellCount: native.shellCount },
      recommendation: "Confirm each shell is intentional and manufacturable as part of this asset revision.",
      confidence: 1,
    });
  }
  for (const warning of native.warnings ?? []) {
    if (findings.some((item) => item.summary.includes(warning))) continue;
    findings.push({
      findingId: id("finding"),
      category: "geometry",
      severity: "info",
      summary: warning,
      confidence: 1,
    });
  }
  if (!findings.length) {
    findings.push({
      findingId: id("finding"),
      category: "integrity",
      severity: "info",
      summary: "No deterministic topology warnings detected by the native Inspector.",
      confidence: 1,
    });
  }
  return findings;
}

export class WorkbenchInspectorService {
  constructor(private readonly repository = new WorkbenchRepository()) {}

  async inspectRevision(assetId: string, revisionId: string, printers: PrinterRecord[]): Promise<InspectorRunResult> {
    const state = await this.repository.loadState();
    const asset = state.assets.find((item) => item.assetId === assetId);
    if (!asset) throw new Error(`Unknown Workbench asset: ${assetId}`);
    const revision = state.revisions.find((item) => item.revisionId === revisionId && item.assetId === assetId);
    if (!revision) throw new Error(`Revision ${revisionId} does not belong to ${assetId}.`);

    const sourceFiles = revision.sourceFileIds
      .map((fileId) => state.files.find((file) => file.fileId === fileId))
      .filter((file): file is NonNullable<typeof file> => Boolean(file));
    const geometry = sourceFiles.find((file) => file.role === "geometry") ?? sourceFiles[0];
    if (!geometry) throw new Error("This revision has no registered source geometry. Run controlled Intake first.");

    const native = await invoke<NativeGeometryInspection>("inspect_geometry", { path: geometry.storagePath });
    const bounds = native.boundsMm;
    const machineCompatibility = printers.map((printer) => {
      const volume = parseBuildVolume(printer.buildVolume);
      if (!bounds) return { printerId: printer.id, compatible: false, reasons: ["Geometry bounds are unavailable."] };
      if (!volume) return { printerId: printer.id, compatible: false, reasons: [`Printer build volume could not be parsed: ${printer.buildVolume}`] };
      const compatible = fitsEnvelope(bounds, volume);
      return {
        printerId: printer.id,
        compatible,
        reasons: compatible
          ? [`Fits ${printer.buildVolume} build envelope by bounding-box dimensions.`]
          : [`Bounding box ${bounds.x.toFixed(2)} × ${bounds.y.toFixed(2)} × ${bounds.z.toFixed(2)} mm exceeds ${printer.buildVolume}.`],
      };
    });

    const inspection: InspectionResult = {
      inspectionResultId: id("inspection"),
      assetId,
      revisionId,
      engineId: "foundry-native-inspector",
      engineVersion: "1",
      geometry: {
        boundsMm: native.boundsMm,
        triangleCount: native.triangleCount,
        shellCount: native.shellCount,
        manifold: native.manifold,
        openEdgeCount: native.openEdgeCount,
        disconnectedShellCount: native.shellCount && native.shellCount > 1 ? native.shellCount : 0,
      },
      findings: findingsFromNative(native),
      machineCompatibility,
      createdAt: new Date().toISOString(),
    };

    await this.repository.upsertInspection(inspection);
    await this.repository.upsertRevision({
      ...revision,
      inspectionResultIds: Array.from(new Set([...revision.inspectionResultIds, inspection.inspectionResultId])),
    });
    await this.repository.upsertAsset({
      ...asset,
      lifecycleStatus: asset.lifecycleStatus === "inspection-required" ? "in-development" : asset.lifecycleStatus,
      updatedAt: new Date().toISOString(),
    });
    await this.repository.appendEvent({
      eventId: id("event"),
      eventType: "inspection.completed",
      timestamp: inspection.createdAt,
      actorId: "forgekeeper:model-inspector",
      correlationId: id("inspection-run"),
      projectId: asset.owningProjectId,
      assetId,
      revisionId,
      schemaVersion: WORKBENCH_EVENT_SCHEMA_VERSION,
      payload: {
        inspectionResultId: inspection.inspectionResultId,
        sourceFileId: geometry.fileId,
        engineId: inspection.engineId,
        findingCount: inspection.findings.length,
      },
    });

    return { inspection, sourceFileId: geometry.fileId, sourcePath: geometry.storagePath };
  }
}

let singleton: WorkbenchInspectorService | null = null;
export function getWorkbenchInspectorService(): WorkbenchInspectorService {
  singleton ??= new WorkbenchInspectorService();
  return singleton;
}
