import { uid } from "./ids";
import type {
  FilamentDryingRecord,
  FilamentProfile,
  FilamentQuantityConfidence,
  FilamentRecord,
  MaterialReservation,
  MaterialTransaction,
  MaterialTransactionType,
  OrderRecord,
} from "../types/domain";

export type MaterialOperationsState = {
  profiles: FilamentProfile[];
  spools: FilamentRecord[];
  transactions: MaterialTransaction[];
  reservations: MaterialReservation[];
  dryingRecords: FilamentDryingRecord[];
  orders?: OrderRecord[];
};

export type MaterialProfileSummary = {
  profile: FilamentProfile;
  physicalGrams: number;
  reservedGrams: number;
  availableGrams: number;
  knownSpools: number;
  unknownSpools: number;
  activeSpools: number;
  stockValue: number;
  shortageGrams: number;
};

export type MaterialIntegrityFinding = {
  severity: "Error" | "Warning";
  code: string;
  message: string;
  spoolId?: string;
  profileId?: string;
};

export function calculateRemainingFromGross(grossWeightGrams: number, tareWeightGrams?: number): number | null {
  if (!Number.isFinite(grossWeightGrams) || grossWeightGrams < 0 || tareWeightGrams === undefined || !Number.isFinite(tareWeightGrams) || tareWeightGrams < 0) return null;
  return Math.max(0, grossWeightGrams - tareWeightGrams);
}

export function activeReservationGrams(reservations: MaterialReservation[], profileId: string, spoolId?: string): number {
  return reservations
    .filter((reservation) => reservation.status === "Active" && reservation.profileId === profileId && (!spoolId || reservation.spoolId === spoolId))
    .reduce((sum, reservation) => sum + Math.max(0, reservation.grams), 0);
}

export function summarizeMaterialProfiles(
  profiles: FilamentProfile[],
  spools: FilamentRecord[],
  reservations: MaterialReservation[],
): MaterialProfileSummary[] {
  return profiles.map((profile) => {
    const profileSpools = spools.filter((spool) => spool.profileId === profile.id && spool.status !== "Archived" && spool.status !== "Empty");
    const known = profileSpools.filter((spool) => spool.quantityConfidence !== "Unknown");
    const physicalGrams = known.reduce((sum, spool) => sum + Math.max(0, spool.gramsAvailable), 0);
    const reservedGrams = activeReservationGrams(reservations, profile.id);
    const stockValue = known.reduce((sum, spool) => {
      const nominal = Math.max(1, profile.nominalWeightGrams || spool.spoolWeightGrams || 1000);
      return sum + (Math.max(0, spool.gramsAvailable) / nominal) * Math.max(0, spool.spoolPrice);
    }, 0);
    return {
      profile,
      physicalGrams,
      reservedGrams,
      availableGrams: Math.max(0, physicalGrams - reservedGrams),
      knownSpools: known.length,
      unknownSpools: profileSpools.length - known.length,
      activeSpools: profileSpools.length,
      stockValue,
      shortageGrams: Math.max(0, profile.reorderPointGrams - Math.max(0, physicalGrams - reservedGrams)),
    };
  });
}

export function openingBalanceTransactions(spools: FilamentRecord[], transactions: MaterialTransaction[]): MaterialTransaction[] {
  const recorded = new Set(transactions.filter((item) => item.type === "Opening Balance").map((item) => item.spoolId));
  return spools
    .filter((spool) => !recorded.has(spool.id))
    .map((spool) => ({
      id: `MTX-OPEN-${spool.id}`,
      spoolId: spool.id,
      profileId: spool.profileId,
      type: "Opening Balance" as const,
      deltaGrams: Math.max(0, spool.gramsAvailable),
      balanceAfterGrams: Math.max(0, spool.gramsAvailable),
      quantityConfidence: spool.quantityConfidence,
      reason: "Migrated existing physical spool into the Material Operations ledger.",
      occurredAt: spool.createdAt || spool.updatedAt || "2026-08-10T00:00:00.000Z",
      notes: "Generated once during ForgeKeeper 0.2.0 migration.",
    }));
}

export function materialTransaction(
  spool: FilamentRecord,
  type: MaterialTransactionType,
  nextBalanceGrams: number,
  reason: string,
  options: {
    confidence?: FilamentQuantityConfidence;
    orderId?: string;
    reservationId?: string;
    reversesTransactionId?: string;
    notes?: string;
    occurredAt?: string;
  } = {},
): { spool: FilamentRecord; transaction: MaterialTransaction } {
  const balance = Math.max(0, Number.isFinite(nextBalanceGrams) ? nextBalanceGrams : spool.gramsAvailable);
  const confidence = options.confidence ?? spool.quantityConfidence;
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  return {
    spool: {
      ...spool,
      gramsAvailable: balance,
      quantityConfidence: confidence,
      condition: balance <= 0 ? "Empty" : spool.condition === "Sealed" && balance < spool.spoolWeightGrams ? "Used" : spool.condition,
      status: balance <= 0 ? "Empty" : spool.status === "Empty" ? "In Stock" : spool.status,
      updatedAt: occurredAt,
    },
    transaction: {
      id: uid("MTX"),
      spoolId: spool.id,
      profileId: spool.profileId,
      type,
      deltaGrams: balance - spool.gramsAvailable,
      balanceAfterGrams: balance,
      quantityConfidence: confidence,
      reason: reason.trim() || type,
      orderId: options.orderId,
      reservationId: options.reservationId,
      reversesTransactionId: options.reversesTransactionId,
      occurredAt,
      notes: options.notes?.trim() ?? "",
    },
  };
}

export function validateMaterialIntegrity(state: MaterialOperationsState): MaterialIntegrityFinding[] {
  const findings: MaterialIntegrityFinding[] = [];
  const profileIds = new Set(state.profiles.map((profile) => profile.id));
  const spoolIds = new Set<string>();
  const codes = new Set<string>();
  const orderIds = new Set((state.orders ?? []).map((order) => order.id));

  for (const spool of state.spools) {
    if (spoolIds.has(spool.id)) findings.push({ severity: "Error", code: "DUPLICATE_SPOOL_ID", message: `Duplicate physical spool ID ${spool.id}.`, spoolId: spool.id });
    spoolIds.add(spool.id);
    if (codes.has(spool.foundrySpoolCode)) findings.push({ severity: "Error", code: "DUPLICATE_FOUNDRY_CODE", message: `Duplicate Foundry code ${spool.foundrySpoolCode}.`, spoolId: spool.id });
    codes.add(spool.foundrySpoolCode);
    if (!profileIds.has(spool.profileId)) findings.push({ severity: "Error", code: "ORPHANED_SPOOL", message: `${spool.foundrySpoolCode} has no material profile.`, spoolId: spool.id, profileId: spool.profileId });
    if (spool.gramsAvailable < 0 || !Number.isFinite(spool.gramsAvailable)) findings.push({ severity: "Error", code: "INVALID_BALANCE", message: `${spool.foundrySpoolCode} has an invalid balance.`, spoolId: spool.id });
    if (spool.grossWeightGrams !== undefined && spool.emptySpoolWeightGrams !== undefined) {
      const calculated = calculateRemainingFromGross(spool.grossWeightGrams, spool.emptySpoolWeightGrams);
      if (calculated !== null && spool.quantityConfidence === "Exact" && Math.abs(calculated - spool.gramsAvailable) > 0.01) {
        findings.push({ severity: "Warning", code: "TARE_MISMATCH", message: `${spool.foundrySpoolCode} does not match gross weight minus tare.`, spoolId: spool.id });
      }
    }
  }

  for (const reservation of state.reservations.filter((item) => item.status === "Active")) {
    if (!profileIds.has(reservation.profileId)) findings.push({ severity: "Error", code: "ORPHANED_RESERVATION", message: `Reservation ${reservation.id} has no material profile.`, profileId: reservation.profileId });
    if (reservation.spoolId && !spoolIds.has(reservation.spoolId)) findings.push({ severity: "Error", code: "ORPHANED_RESERVATION_SPOOL", message: `Reservation ${reservation.id} points to a missing spool.`, spoolId: reservation.spoolId });
    if (reservation.orderId && !orderIds.has(reservation.orderId)) findings.push({ severity: "Warning", code: "INVALID_RESERVATION_ORDER", message: `Reservation ${reservation.id} points to missing order ${reservation.orderId}.`, profileId: reservation.profileId });
    const summary = summarizeMaterialProfiles(state.profiles, state.spools, state.reservations).find((item) => item.profile.id === reservation.profileId);
    if (summary && summary.reservedGrams > summary.physicalGrams) findings.push({ severity: "Warning", code: "OVER_RESERVED", message: `${summary.profile.brand} ${summary.profile.colorName} is reserved beyond known physical stock.`, profileId: summary.profile.id });
  }

  for (const transaction of state.transactions) {
    if (!spoolIds.has(transaction.spoolId)) findings.push({ severity: "Error", code: "ORPHANED_TRANSACTION", message: `Ledger entry ${transaction.id} points to a missing spool.`, spoolId: transaction.spoolId });
    if (transaction.orderId && !orderIds.has(transaction.orderId)) findings.push({ severity: "Warning", code: "INVALID_TRANSACTION_ORDER", message: `Ledger entry ${transaction.id} points to missing order ${transaction.orderId}.`, spoolId: transaction.spoolId });
  }
  return findings.filter((finding, index, all) => index === all.findIndex((candidate) => candidate.code === finding.code && candidate.spoolId === finding.spoolId && candidate.profileId === finding.profileId));
}

export function purchaseList(summaries: MaterialProfileSummary[]): Array<MaterialProfileSummary & { suggestedSpools: number }> {
  return summaries
    .filter((summary) => summary.shortageGrams > 0)
    .map((summary) => ({ ...summary, suggestedSpools: Math.max(1, Math.ceil(summary.shortageGrams / Math.max(1, summary.profile.nominalWeightGrams))) }))
    .sort((left, right) => right.shortageGrams - left.shortageGrams);
}
