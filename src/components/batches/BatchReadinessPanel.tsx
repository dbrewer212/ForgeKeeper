import { Card } from "../ui/Card";
import type { ProductionBatch } from "../../types/batch";
import { previewBatchCompletion } from "../../lib/batches/batchLogic";

type FilamentLike = {
  id: string;
  colorName?: string;
  gramsAvailable: number;
  reorderPointGrams: number;
};

export function BatchReadinessPanel({ batch, filament }: { batch: ProductionBatch; filament?: FilamentLike }) {
  const preview = previewBatchCompletion(batch, filament);

  return (
    <Card title="Batch Readiness Preview">
      <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Printed Units</div>
          <div className="mt-1 text-xl font-semibold text-slate-100">{preview.totalPrintedQuantity}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Material Used</div>
          <div className="mt-1 text-xl font-semibold text-slate-100">{preview.materialUsedGrams.toFixed(0)}g</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Sellable Added</div>
          <div className="mt-1 text-xl font-semibold text-slate-100">{preview.successfulInventoryAdded}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-3">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Failed / Waste</div>
          <div className="mt-1 text-xl font-semibold text-slate-100">{preview.failedUnitsLogged}</div>
        </div>
      </div>

      {filament && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
          <div>
            Stock preview for <span className="font-semibold text-slate-200">{filament.colorName ?? filament.id}</span>: {preview.stockBefore?.toFixed(0)}g → {preview.stockAfter?.toFixed(0)}g
          </div>
          {preview.wouldGoNegative && <div className="mt-2 text-red-300">This batch would push stock below zero.</div>}
          {!preview.wouldGoNegative && preview.isBelowThreshold && <div className="mt-2 text-amber-300">This batch would reach or pass the reorder threshold.</div>}
        </div>
      )}
    </Card>
  );
}
