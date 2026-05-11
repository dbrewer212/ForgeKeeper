import type { BatchCompletionPreview, ProductionBatch } from "../../types/batch";

type FilamentLike = {
  id: string;
  gramsAvailable: number;
  reorderPointGrams: number;
};

export function totalPrintedQuantity(batch: ProductionBatch): number {
  return Math.max(0, batch.quantitySuccessful) + Math.max(0, batch.quantityFailed);
}

export function estimatedBatchMaterialGrams(batch: ProductionBatch): number {
  return Math.max(0, batch.estimatedGramsPerItem) * totalPrintedQuantity(batch);
}

export function batchMaterialUsedGrams(batch: ProductionBatch): number {
  if (batch.deductionMode === "actual" && typeof batch.actualBatchGrams === "number") {
    return Math.max(0, batch.actualBatchGrams);
  }

  return estimatedBatchMaterialGrams(batch);
}

export function previewBatchCompletion(batch: ProductionBatch, filament?: FilamentLike): BatchCompletionPreview {
  const materialUsedGrams = batchMaterialUsedGrams(batch);
  const stockBefore = filament?.gramsAvailable;
  const stockAfter = typeof stockBefore === "number" ? stockBefore - materialUsedGrams : undefined;

  return {
    totalPrintedQuantity: totalPrintedQuantity(batch),
    materialUsedGrams,
    successfulInventoryAdded: Math.max(0, batch.quantitySuccessful),
    failedUnitsLogged: Math.max(0, batch.quantityFailed),
    stockBefore,
    stockAfter,
    wouldGoNegative: typeof stockAfter === "number" ? stockAfter < 0 : false,
    isBelowThreshold:
      typeof stockAfter === "number" && typeof filament?.reorderPointGrams === "number"
        ? stockAfter <= filament.reorderPointGrams
        : false,
  };
}

export function defaultBatchForProduct(input: {
  id: string;
  productId: string;
  printerId?: string;
  filamentId?: string;
  estimatedGramsPerItem: number;
  slicer?: ProductionBatch["slicer"];
}): ProductionBatch {
  return {
    id: input.id,
    productId: input.productId,
    printerId: input.printerId,
    slicer: input.slicer ?? "Other",
    filamentId: input.filamentId,
    estimatedGramsPerItem: input.estimatedGramsPerItem,
    quantityPlanned: 1,
    quantitySuccessful: 0,
    quantityFailed: 0,
    status: "Planned",
    deductionMode: "estimated",
    materialDeducted: false,
    notes: "",
  };
}
