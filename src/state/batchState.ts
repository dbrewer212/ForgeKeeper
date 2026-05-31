import { useState } from "react";
import { seedBatches } from "../data/batchesSeed";
import type { PrintBatch } from "../types/batch";

export function useBatchState() {
  const [batches, setBatches] = useState<PrintBatch[]>(seedBatches);

  return {
    batches,
    setBatches,
  };
}
