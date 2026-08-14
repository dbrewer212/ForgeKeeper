import { legacySeedFilament, legacySeedOrders } from "../data/seed";
import { uid } from "./ids";
import type {
  FilamentMaterial,
  FilamentProfile,
  FilamentQuantityConfidence,
  FilamentRecord,
  FilamentSpoolCondition,
  OrderRecord,
  ProductVariant,
  MaterialImportRecord,
} from "../types/domain";

const MIGRATION_TIMESTAMP = "2026-08-09T00:00:00.000Z";

const materialValues: FilamentMaterial[] = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "Other"];
const confidenceValues: FilamentQuantityConfidence[] = ["Exact", "Nominal", "Estimated", "Unknown"];
const conditionValues: FilamentSpoolCondition[] = ["Sealed", "Used", "Empty"];

export type FilamentCensusMigration = {
  profiles: FilamentProfile[];
  spools: FilamentRecord[];
  removedPlaceholderSpoolIds: string[];
};

export type FilamentSpoolDraft = {
  condition: FilamentSpoolCondition;
  quantityConfidence: FilamentQuantityConfidence;
  gramsAvailable: number;
  grossWeightGrams?: number;
  estimatedPercent?: number;
  spoolPrice?: number;
  storageLocation?: string;
  purchaseDate?: string;
  lotNumber?: string;
  dryingStatus?: FilamentRecord["dryingStatus"];
  notes?: string;
};

function sameLegacyPlaceholder(candidate: Partial<FilamentRecord>, legacy: typeof legacySeedFilament[number]): boolean {
  return candidate.id === legacy.id
    && candidate.brand === legacy.brand
    && candidate.material === legacy.material
    && candidate.colorName === legacy.colorName
    && candidate.colorFamily === legacy.colorFamily
    && Number(candidate.gramsAvailable) === legacy.gramsAvailable
    && Number(candidate.reorderPointGrams) === legacy.reorderPointGrams
    && Number(candidate.spoolPrice) === legacy.spoolPrice
    && Number(candidate.spoolWeightGrams) === legacy.spoolWeightGrams
    && candidate.notes === legacy.notes;
}

export function isLegacyPlaceholderSpool(candidate: Partial<FilamentRecord>): boolean {
  return legacySeedFilament.some((legacy) => sameLegacyPlaceholder(candidate, legacy));
}

export function isLegacyPlaceholderOrder(candidate: Partial<OrderRecord>): boolean {
  return legacySeedOrders.some((legacy) => candidate.id === legacy.id
    && candidate.productId === legacy.productId
    && candidate.customer === legacy.customer
    && candidate.filamentId === legacy.filamentId
    && candidate.quotedPrice === legacy.quotedPrice);
}

function profileIdentity(profile: Pick<FilamentProfile, "brand" | "productLine" | "material" | "colorName" | "diameterMm" | "nominalWeightGrams">): string {
  return [profile.brand, profile.productLine, profile.material, profile.colorName, profile.diameterMm, profile.nominalWeightGrams]
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

function profileFromLegacy(spool: Partial<FilamentRecord>): FilamentProfile {
  return {
    id: spool.profileId || `FP-MIGRATED-${spool.id || uid("FIL")}`,
    brand: spool.brand || "Unknown",
    productLine: "",
    material: materialValues.includes(spool.material as FilamentMaterial) ? spool.material as FilamentMaterial : "Other",
    colorName: spool.colorName || "Unknown",
    colorFamily: spool.colorFamily || "Unknown",
    diameterMm: 1.75,
    nominalWeightGrams: Math.max(1, Number(spool.spoolWeightGrams) || 1000),
    emptySpoolWeightGrams: spool.emptySpoolWeightGrams,
    reorderPointGrams: Math.max(0, Number(spool.reorderPointGrams) || 0),
    defaultSpoolPrice: Math.max(0, Number(spool.spoolPrice) || 0),
    supplier: "",
    supplierSku: "",
    notes: "Migrated from the earlier combined filament record.",
    createdAt: spool.createdAt || MIGRATION_TIMESTAMP,
    updatedAt: spool.updatedAt || MIGRATION_TIMESTAMP,
  };
}

export function nextFoundrySpoolCode(spools: Array<Pick<FilamentRecord, "foundrySpoolCode">>): string {
  const highest = spools.reduce((maximum, spool) => {
    const match = spool.foundrySpoolCode?.match(/^FF-SP-(\d+)$/i);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0);
  return `FF-SP-${String(highest + 1).padStart(6, "0")}`;
}

export function migrateFilamentInventory(
  sourceSpools: Partial<FilamentRecord>[] | undefined,
  sourceProfiles: FilamentProfile[] | undefined,
): FilamentCensusMigration {
  const removedPlaceholderSpoolIds = (sourceSpools ?? []).filter(isLegacyPlaceholderSpool).map((spool) => spool.id!).filter(Boolean);
  const retained = (sourceSpools ?? []).filter((spool) => !isLegacyPlaceholderSpool(spool));
  const profiles = (sourceProfiles ?? []).map((profile) => ({ ...profile, supplier: profile.supplier ?? "", supplierSku: profile.supplierSku ?? "" }));
  const byIdentity = new Map(profiles.map((profile) => [profileIdentity(profile), profile]));
  const spools: FilamentRecord[] = [];

  retained.forEach((source) => {
    let profile = profiles.find((item) => item.id === source.profileId);
    if (!profile) {
      const proposed = profileFromLegacy(source);
      profile = byIdentity.get(profileIdentity(proposed));
      if (!profile) {
        profile = proposed;
        profiles.push(profile);
        byIdentity.set(profileIdentity(profile), profile);
      }
    }

    const nominal = Math.max(1, Number(source.spoolWeightGrams) || profile.nominalWeightGrams);
    const available = Math.max(0, Number(source.gramsAvailable) || 0);
    const condition = source.condition ?? (available <= 0 ? "Empty" : available >= nominal ? "Sealed" : "Used");
    const confidence = source.quantityConfidence ?? (condition === "Sealed" ? "Nominal" : available > 0 ? "Estimated" : "Exact");
    const record: FilamentRecord = {
      id: source.id || uid("FIL"),
      profileId: profile.id,
      foundrySpoolCode: source.foundrySpoolCode || nextFoundrySpoolCode(spools),
      brand: profile.brand,
      material: profile.material,
      colorName: profile.colorName,
      colorFamily: profile.colorFamily,
      gramsAvailable: confidence === "Unknown" ? 0 : available,
      quantityConfidence: confidence,
      condition,
      status: source.status ?? (condition === "Empty" ? "Empty" : "In Stock"),
      grossWeightGrams: source.grossWeightGrams,
      estimatedPercent: source.estimatedPercent,
      reorderPointGrams: profile.reorderPointGrams,
      spoolPrice: Math.max(0, Number(source.spoolPrice) || profile.defaultSpoolPrice),
      spoolWeightGrams: nominal,
      emptySpoolWeightGrams: source.emptySpoolWeightGrams ?? profile.emptySpoolWeightGrams,
      storageLocation: source.storageLocation ?? "",
      purchaseDate: source.purchaseDate ?? "",
      lotNumber: source.lotNumber ?? "",
      dryingStatus: source.dryingStatus ?? "Unknown",
      dryingHistory: source.dryingHistory ?? "",
      notes: source.notes ?? "",
      createdAt: source.createdAt ?? MIGRATION_TIMESTAMP,
      updatedAt: source.updatedAt ?? MIGRATION_TIMESTAMP,
    };
    spools.push(record);
  });

  return { profiles, spools, removedPlaceholderSpoolIds };
}

export function cleanLegacyOrderAndVariantLinks(
  orders: OrderRecord[],
  variants: ProductVariant[],
  removedSpoolIds: string[],
): { orders: OrderRecord[]; variants: ProductVariant[] } {
  const removed = new Set(removedSpoolIds);
  return {
    orders: orders.filter((order) => !isLegacyPlaceholderOrder(order)).map((order) => removed.has(order.filamentId ?? "") ? { ...order, filamentId: undefined } : order),
    variants: variants.map((variant) => removed.has(variant.filamentId ?? "") ? { ...variant, filamentId: undefined } : variant),
  };
}

export function createPhysicalSpools(
  profile: FilamentProfile,
  drafts: FilamentSpoolDraft[],
  existing: FilamentRecord[],
): FilamentRecord[] {
  const created: FilamentRecord[] = [];
  drafts.forEach((draft) => {
    const now = new Date().toISOString();
    const code = nextFoundrySpoolCode([...existing, ...created]);
    const condition = draft.condition;
    created.push({
      id: uid("FIL"),
      profileId: profile.id,
      foundrySpoolCode: code,
      brand: profile.brand,
      material: profile.material,
      colorName: profile.colorName,
      colorFamily: profile.colorFamily,
      gramsAvailable: draft.quantityConfidence === "Unknown" ? 0 : Math.max(0, draft.gramsAvailable),
      quantityConfidence: draft.quantityConfidence,
      condition,
      status: condition === "Empty" ? "Empty" : "In Stock",
      grossWeightGrams: draft.grossWeightGrams,
      estimatedPercent: draft.estimatedPercent,
      reorderPointGrams: profile.reorderPointGrams,
      spoolPrice: Math.max(0, draft.spoolPrice ?? profile.defaultSpoolPrice),
      spoolWeightGrams: profile.nominalWeightGrams,
      emptySpoolWeightGrams: profile.emptySpoolWeightGrams,
      storageLocation: draft.storageLocation ?? "",
      purchaseDate: draft.purchaseDate ?? "",
      lotNumber: draft.lotNumber ?? "",
      dryingStatus: draft.dryingStatus ?? "Unknown",
      dryingHistory: "",
      notes: draft.notes ?? "",
      createdAt: now,
      updatedAt: now,
    });
  });
  return created;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseFilamentCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ""])));
}

function numberCell(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function materialFromCsv(value: string | undefined): FilamentMaterial {
  const found = materialValues.find((material) => material.toLowerCase() === value?.trim().toLowerCase());
  return found ?? "Other";
}

export function confidenceFromCsv(value: string | undefined): FilamentQuantityConfidence {
  return confidenceValues.find((item) => item.toLowerCase() === value?.trim().toLowerCase()) ?? "Unknown";
}

export function conditionFromCsv(value: string | undefined): FilamentSpoolCondition {
  return conditionValues.find((item) => item.toLowerCase() === value?.trim().toLowerCase()) ?? "Used";
}

export function profileFromCsv(row: Record<string, string>): Omit<FilamentProfile, "id" | "createdAt" | "updatedAt"> {
  return {
    brand: row.brand || "Unknown",
    productLine: row.productLine || "",
    material: materialFromCsv(row.material),
    colorName: row.colorName || "Unknown",
    colorFamily: row.colorFamily || "Unknown",
    diameterMm: numberCell(row.diameterMm, 1.75),
    nominalWeightGrams: numberCell(row.nominalWeightGrams, 1000),
    emptySpoolWeightGrams: row.emptySpoolWeightGrams ? numberCell(row.emptySpoolWeightGrams) : undefined,
    reorderPointGrams: numberCell(row.reorderPointGrams, 250),
    defaultSpoolPrice: numberCell(row.spoolPrice),
    supplier: row.supplier || "",
    supplierSku: row.supplierSku || "",
    notes: row.profileNotes || "",
  };
}

export function filamentProfileIdentity(profile: Parameters<typeof profileIdentity>[0]): string {
  return profileIdentity(profile);
}

export function filamentCsvTemplate(): Array<Record<string, unknown>> {
  return [{
    brand: "Elegoo", productLine: "Rapid PLA+", material: "PLA+", colorName: "Black", colorFamily: "Black",
    diameterMm: 1.75, nominalWeightGrams: 1000, emptySpoolWeightGrams: 230, reorderPointGrams: 250,
    condition: "Sealed", quantityConfidence: "Nominal", remainingGrams: 1000, grossWeightGrams: "",
    estimatedPercent: "", quantity: 1, spoolPrice: "", supplier: "", supplierSku: "", storageLocation: "", purchaseDate: "", lotNumber: "", notes: "",
  }];
}

export type FilamentCsvRowPreview = {
  rowNumber: number;
  row: Record<string, string>;
  quantity: number;
  errors: string[];
  warnings: string[];
};

export type FilamentCsvPreview = {
  fingerprint: string;
  rows: FilamentCsvRowPreview[];
  totalSpools: number;
  valid: boolean;
  duplicateImport: boolean;
};

export function filamentImportFingerprint(text: string): string {
  let hash = 2166136261;
  const normalized = text.replace(/\r\n/g, "\n").trim();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `csv-${(hash >>> 0).toString(16).padStart(8, "0")}-${normalized.length}`;
}

export function previewFilamentCsv(text: string, history: MaterialImportRecord[] = []): FilamentCsvPreview {
  const parsed = parseFilamentCsv(text);
  const fingerprint = filamentImportFingerprint(text);
  const rows = parsed.map((row, index): FilamentCsvRowPreview => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const quantity = Number(row.quantity || 1);
    if (!row.brand?.trim()) errors.push("Brand is required.");
    if (!row.colorName?.trim()) errors.push("Color name is required.");
    if (!materialValues.some((value) => value.toLowerCase() === row.material?.trim().toLowerCase())) errors.push(`Unsupported material '${row.material || "blank"}'.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) errors.push("Quantity must be a whole number from 1 to 500.");
    const condition = conditionFromCsv(row.condition);
    const confidence = confidenceFromCsv(row.quantityConfidence);
    const remaining = row.remainingGrams === "" || row.remainingGrams === undefined ? undefined : Number(row.remainingGrams);
    const gross = row.grossWeightGrams === "" || row.grossWeightGrams === undefined ? undefined : Number(row.grossWeightGrams);
    const tare = row.emptySpoolWeightGrams === "" || row.emptySpoolWeightGrams === undefined ? undefined : Number(row.emptySpoolWeightGrams);
    if (remaining !== undefined && (!Number.isFinite(remaining) || remaining < 0)) errors.push("Remaining grams must be zero or greater.");
    if (gross !== undefined && (!Number.isFinite(gross) || gross < 0)) errors.push("Gross weight must be zero or greater.");
    if (gross !== undefined && tare === undefined) errors.push("Gross weight requires an empty-spool tare.");
    if (confidence === "Exact" && remaining === undefined && gross === undefined && condition !== "Empty") errors.push("Exact quantity requires remaining grams or a gross weight.");
    if (confidence === "Unknown" && remaining !== undefined && remaining > 0) warnings.push("Remaining grams are ignored when confidence is Unknown.");
    if (condition === "Sealed" && confidence === "Exact") warnings.push("A sealed spool normally uses Nominal confidence unless it was weighed.");
    return { rowNumber: index + 2, row, quantity: Number.isInteger(quantity) ? quantity : 0, errors, warnings };
  });
  const totalSpools = rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
  return {
    fingerprint,
    rows,
    totalSpools,
    valid: rows.length > 0 && rows.every((row) => row.errors.length === 0),
    duplicateImport: history.some((record) => record.fingerprint === fingerprint),
  };
}
