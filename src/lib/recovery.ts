import type {
  AppData,
  AuditEvent,
  AuditEventOutcome,
  AuditEventType,
  CredentialHealthRecord,
  IntegrityFinding,
  IntegrityScanRecord,
} from "../types/domain";
import { isLegacyPlaceholderSpool } from "./filamentInventory";

export const BACKUP_FORMAT = "forgekeeper.backup";
export const BACKUP_SCHEMA_VERSION = 3;
export const RECOVERY_STORAGE_KEY = "forgekeeper.recovery.checkpoints.v1";
const MAX_CHECKPOINTS = 6;

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  createdAt: string;
  reason: string;
  checksumAlgorithm: "SHA-256";
  checksum: string;
  data: AppData;
};

export type RecoveryCheckpoint = {
  id: string;
  createdAt: string;
  reason: string;
  checksum: string;
  envelope: BackupEnvelope;
};

export type LocalPathInspection = {
  path: string;
  exists: boolean;
  isFile: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  error: string | null;
};

export type CredentialFileHealth = {
  filePath: string;
  readable: boolean;
  meshyConfigured: boolean;
  printpalConfigured: boolean;
  message: string;
};

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encodeUtf8(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createBackupEnvelope(data: AppData, reason: string): Promise<BackupEnvelope> {
  const checksum = await sha256Text(JSON.stringify(data));
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    reason,
    checksumAlgorithm: "SHA-256",
    checksum,
    data,
  };
}

export async function verifyBackupEnvelope(value: unknown): Promise<{ valid: boolean; envelope?: BackupEnvelope; message: string; legacyData?: AppData }> {
  if (!value || typeof value !== "object") return { valid: false, message: "The file is not a Forgekeeper backup object." };
  const candidate = value as Partial<BackupEnvelope> & Partial<AppData>;
  if (candidate.format !== BACKUP_FORMAT) {
    if (Array.isArray(candidate.products) && Array.isArray(candidate.orders) && Array.isArray(candidate.filament) && Array.isArray(candidate.printers)) {
      return { valid: true, message: "Legacy backup detected. It has no embedded checksum and must be treated as unverified.", legacyData: candidate as AppData };
    }
    return { valid: false, message: "The file does not contain the required Forgekeeper records." };
  }
  if (!candidate.data || candidate.checksumAlgorithm !== "SHA-256" || !candidate.checksum) {
    return { valid: false, message: "The backup envelope is incomplete." };
  }
  if (![1, 2, BACKUP_SCHEMA_VERSION].includes(Number(candidate.schemaVersion))) {
    return { valid: false, message: `Unsupported backup schema ${String(candidate.schemaVersion)}.` };
  }
  const actual = await sha256Text(JSON.stringify(candidate.data));
  if (actual !== candidate.checksum) return { valid: false, message: "Backup checksum mismatch. The file may be damaged or modified." };
  const migrationNote = candidate.schemaVersion === BACKUP_SCHEMA_VERSION ? "" : ` Legacy schema ${candidate.schemaVersion} will be migrated during restore.`;
  return { valid: true, envelope: candidate as BackupEnvelope, message: `SHA-256 checksum verified.${migrationNote}` };
}

export function loadRecoveryCheckpoints(): RecoveryCheckpoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECOVERY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecoveryCheckpoint[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecoveryCheckpoint(data: AppData, reason: string): Promise<RecoveryCheckpoint> {
  const envelope = await createBackupEnvelope(data, reason);
  const checkpoint: RecoveryCheckpoint = {
    id: `CHECKPOINT-${Date.now()}`,
    createdAt: envelope.createdAt,
    reason,
    checksum: envelope.checksum,
    envelope,
  };
  const retained = [checkpoint, ...loadRecoveryCheckpoints()].slice(0, MAX_CHECKPOINTS);
  window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(retained));
  return checkpoint;
}

export function removeRecoveryCheckpoint(id: string): void {
  const retained = loadRecoveryCheckpoints().filter((checkpoint) => checkpoint.id !== id);
  window.localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(retained));
}

export function createAuditEvent(type: AuditEventType, action: string, outcome: AuditEventOutcome, summary: string, subjectId?: string): AuditEvent {
  return { id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, occurredAt: new Date().toISOString(), type, action, outcome, summary, subjectId };
}

function finding(category: IntegrityFinding["category"], severity: IntegrityFinding["severity"], title: string, detail: string, subjectId?: string): IntegrityFinding {
  return { id: `FINDING-${category}-${subjectId ?? title}`.replace(/\s+/g, "-"), category, severity, title, detail, subjectId, status: "Open" };
}

export function collectStructuralFindings(data: AppData): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const productIds = new Set(data.products.map((item) => item.id));
  const conceptIds = new Set(data.concepts.map((item) => item.id));
  const referenceIds = new Set(data.productionReferences.map((item) => item.id));
  const verificationIds = new Set(data.modelVerifications.map((item) => item.id));
  const assetIds = new Set(data.libraryAssets.map((item) => item.id));
  const profileIds = new Set((data.filamentProfiles ?? []).map((item) => item.id));
  const spoolCodes = new Map<string, string>();

  data.filament.forEach((spool) => {
    if (!profileIds.has(spool.profileId)) findings.push(finding("Inventory", "Critical", "Spool has no filament profile", `${spool.foundrySpoolCode || spool.id} points to missing profile ${spool.profileId || "(none)"}.`, spool.id));
    if (isLegacyPlaceholderSpool(spool)) findings.push(finding("Inventory", "Critical", "Fictional seed spool remains", `${spool.id} matches a retired demonstration record and must not count as physical stock.`, spool.id));
    if (!spool.foundrySpoolCode) findings.push(finding("Inventory", "Warning", "Spool has no Foundry ID", `${spool.id} cannot be scanned or labeled until it has a Foundry spool code.`, spool.id));
    const prior = spoolCodes.get(spool.foundrySpoolCode);
    if (spool.foundrySpoolCode && prior) findings.push(finding("Inventory", "Critical", "Duplicate Foundry spool ID", `${spool.foundrySpoolCode} is used by both ${prior} and ${spool.id}.`, spool.id));
    else if (spool.foundrySpoolCode) spoolCodes.set(spool.foundrySpoolCode, spool.id);
    if (spool.quantityConfidence === "Unknown" && spool.gramsAvailable !== 0) findings.push(finding("Inventory", "Warning", "Unknown spool carries a numeric balance", `${spool.foundrySpoolCode} must be measured or estimated before its quantity counts toward stock.`, spool.id));
  });

  data.concepts.forEach((concept) => {
    if (!productIds.has(concept.productId)) findings.push(finding("Relationship", "Critical", "Concept has no product", `${concept.title} references missing product ${concept.productId}.`, concept.id));
    if (concept.generationReferenceId && !referenceIds.has(concept.generationReferenceId)) findings.push(finding("Relationship", "Critical", "Generator reference is missing", `${concept.title} points to missing reference ${concept.generationReferenceId}.`, concept.id));
  });
  data.stls.forEach((stl) => {
    if (!productIds.has(stl.productId)) findings.push(finding("Relationship", "Critical", "Model has no product", `${stl.name} references missing product ${stl.productId}.`, stl.id));
    if (stl.linkedConceptId && !conceptIds.has(stl.linkedConceptId)) findings.push(finding("Relationship", "Critical", "Model concept link is missing", `${stl.name} points to missing concept ${stl.linkedConceptId}.`, stl.id));
    if (stl.assetStatus === "Linked" && !(stl.filePath ?? stl.fileName).trim()) findings.push(finding("Asset", "Critical", "Linked model has no path", `${stl.name} is marked Linked without a file path.`, stl.id));
  });
  data.canonRecords.forEach((record) => record.assetLinks.forEach((link) => {
    if (!assetIds.has(link.assetId)) findings.push(finding("Relationship", "Critical", "Canon asset link is broken", `${record.name} points to missing Library asset ${link.assetId}.`, record.id));
  }));
  data.libraryAssets.forEach((asset) => {
    if (!/^[a-f0-9]{64}$/i.test(asset.sha256)) findings.push(finding("Checksum", "Critical", "Library fingerprint is invalid", `${asset.name} does not have a valid SHA-256 fingerprint.`, asset.id));
    if (!asset.libraryFileId || !asset.fileId || !asset.libraryPath) findings.push(finding("Asset", "Critical", "Library identity is incomplete", `${asset.name} is missing stable identity or path metadata.`, asset.id));
  });

  const externalIds = new Map<string, string>();
  data.generationJobs.forEach((job) => {
    if (!productIds.has(job.productId) || !conceptIds.has(job.conceptId)) findings.push(finding("Provider Job", "Critical", "Provider job owner is missing", `${job.provider} job ${job.externalJobId} is detached from its product or concept.`, job.id));
    if (job.productionReferenceId && !referenceIds.has(job.productionReferenceId)) findings.push(finding("Provider Job", "Critical", "Submitted reference record is missing", `${job.provider} job ${job.externalJobId} points to missing production reference ${job.productionReferenceId}.`, job.id));
    const key = `${job.provider}:${job.externalJobId}`;
    const prior = externalIds.get(key);
    if (prior) findings.push(finding("Provider Job", "Critical", "Duplicate provider job identity", `${key} is recorded by both ${prior} and ${job.id}. Never submit or reconcile it twice.`, job.id));
    else externalIds.set(key, job.id);
  });
  data.printTrials.forEach((trial) => {
    const verification = data.modelVerifications.find((item) => item.id === trial.modelVerificationId);
    if (!verificationIds.has(trial.modelVerificationId)) findings.push(finding("Relationship", "Critical", "Print Trial verification is missing", `${trial.id} points to missing model verification ${trial.modelVerificationId}.`, trial.id));
    else if (verification && (verification.modelSha256 !== trial.modelSha256 || verification.modelRevision !== trial.modelRevision)) findings.push(finding("Checksum", "Warning", "Print Trial evidence is stale", `${trial.id} no longer matches the controlling model revision and checksum.`, trial.id));
  });
  return findings;
}

export function collectInspectablePaths(data: AppData): string[] {
  const paths = [
    ...data.stls.map((item) => item.filePath ?? item.fileName),
    ...data.productionReferences.map((item) => item.outputPath),
    ...data.modelVerifications.flatMap((item) => [item.modelPath, ...Object.values(item.inspectionViews)]),
    ...data.printTrials.flatMap((item) => item.evidencePaths),
  ];
  return [...new Set(paths.map((path) => path?.trim()).filter((path): path is string => Boolean(path) && !/^https?:/i.test(path)))];
}

export async function inspectLocalPaths(paths: string[]): Promise<LocalPathInspection[] | null> {
  if (!isTauriRuntime()) return null;
  const api = await import("@tauri-apps/api/core");
  return api.invoke<LocalPathInspection[]>("inspect_local_paths", { paths });
}

export async function inspectCredentialFile(filePath: string): Promise<CredentialFileHealth | null> {
  if (!isTauriRuntime()) return null;
  const api = await import("@tauri-apps/api/core");
  return api.invoke<CredentialFileHealth>("inspect_credential_file", { apiFilePath: filePath });
}

export function createIntegrityScan(data: AppData, structural: IntegrityFinding[], paths: LocalPathInspection[] | null, startedAt: string): IntegrityScanRecord {
  const pathFindings = (paths ?? []).filter((item) => !item.exists || !item.isFile).map((item) => finding("Asset", "Critical", "Local asset is unavailable", `${item.path}: ${item.error ?? "file was not found"}`, item.path));
  const expectedHashes = new Map(
    data.modelVerifications
      .filter((item) => item.modelPath && /^[a-f0-9]{64}$/i.test(item.modelSha256))
      .map((item) => [item.modelPath.trim().toLowerCase(), { hash: item.modelSha256.toLowerCase(), id: item.id }]),
  );
  const checksumFindings = (paths ?? []).flatMap((item) => {
    const expected = expectedHashes.get(item.path.trim().toLowerCase());
    if (!expected || !item.sha256 || item.sha256.toLowerCase() === expected.hash) return [];
    return [finding("Checksum", "Critical", "Model fingerprint changed", `${item.path} no longer matches the SHA-256 recorded by ${expected.id}. Existing verification and Print Trial evidence must not be reused.`, expected.id)];
  });
  const now = new Date().toISOString();
  return {
    id: `SCAN-${Date.now()}`,
    startedAt,
    completedAt: now,
    desktopFileChecksAvailable: paths !== null,
    checkedPathCount: paths?.length ?? 0,
    findings: [...structural, ...pathFindings, ...checksumFindings],
  };
}

export function credentialHealthRecord(health: CredentialFileHealth | null, filePath: string): CredentialHealthRecord {
  if (!health) return { checkedAt: new Date().toISOString(), filePath, readable: false, meshyConfigured: false, printpalConfigured: false, message: "Credential inspection is available only in the desktop app. No key material was read into Forgekeeper data." };
  return { ...health, checkedAt: new Date().toISOString() };
}
