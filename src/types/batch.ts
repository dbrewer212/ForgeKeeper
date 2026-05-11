export type ProductionBatchStatus =
  | "Planned"
  | "Queued"
  | "Printing"
  | "Paused"
  | "Complete"
  | "Canceled";

export type DeductionMode = "estimated" | "actual";

export type ProductionBatch = {
  id: string;
  productId: string;
  variantId?: string;
  orderId?: string;
  printerId?: string;
  slicer: "OrcaSlicer" | "Anycubic Slicer Next" | "Other";
  filamentId?: string;
  estimatedGramsPerItem: number;
  actualBatchGrams?: number;
  quantityPlanned: number;
  quantitySuccessful: number;
  quantityFailed: number;
  status: ProductionBatchStatus;
  deductionMode: DeductionMode;
  materialDeducted: boolean;
  startedAt?: string;
  completedAt?: string;
  notes: string;
};

export type BatchCompletionPreview = {
  totalPrintedQuantity: number;
  materialUsedGrams: number;
  successfulInventoryAdded: number;
  failedUnitsLogged: number;
  stockBefore?: number;
  stockAfter?: number;
  wouldGoNegative: boolean;
  isBelowThreshold: boolean;
};
