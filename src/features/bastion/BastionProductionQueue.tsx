import { useEffect, useMemo, useState } from "react";
import type { ProductionItemSummary } from "../../mesh/domainServices";
import { getFoundryMeshRuntime } from "../../mesh";

function priority(item: ProductionItemSummary): number {
  if (item.status === "attention-required" || item.blocker) return 0;
  if (item.status === "queued") return 1;
  if (item.status === "active" || item.stage === "printing") return 2;
  if (item.status === "completed") return 4;
  return 3;
}

function statusTone(item: ProductionItemSummary): string {
  if (item.status === "attention-required" || item.blocker) return "border-red-800/70 bg-red-950/30 text-red-200";
  if (item.status === "queued") return "border-amber-700/60 bg-amber-950/25 text-amber-100";
  if (item.status === "completed") return "border-emerald-900/60 bg-emerald-950/20 text-emerald-200";
  return "border-stone-700 bg-stone-900/90 text-stone-200";
}

export function BastionProductionQueue() {
  const [items, setItems] = useState<ProductionItemSummary[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  async function refresh() {
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const [productionItems, active] = await Promise.all([
        runtime.domain.get().production.list(),
        runtime.domain.get().production.getActiveWork(),
      ]);
      setItems(productionItems);
      setActiveId(active.productionItemId);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const ordered = useMemo(
    () => [...items].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return priority(a) - priority(b) || a.name.localeCompare(b.name);
    }),
    [activeId, items],
  );
  const actionable = ordered.filter((item) => item.status !== "completed");
  const visible = [...actionable, ...ordered.filter((item) => item.status === "completed").slice(0, 2)].slice(0, 8);
  const attentionCount = actionable.filter((item) => item.status === "attention-required" || item.blocker).length;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[880px]">
      {open ? (
        <section className="max-h-[58vh] overflow-hidden rounded-2xl border border-[#624421]/80 bg-[#111416]/98 shadow-2xl backdrop-blur">
          <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-stone-800 px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-600">Production Steward</div>
              <div className="text-lg font-semibold text-amber-100">Production Queue</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[48px] rounded-xl border border-stone-700 bg-stone-900 px-5 text-sm font-semibold text-stone-200 active:scale-[0.97]">Close</button>
          </div>
          <div className="max-h-[44vh] space-y-2 overflow-y-auto p-3">
            {error ? <div className="rounded-xl border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200">{error}</div> : null}
            {!error && visible.length === 0 ? <div className="rounded-xl border border-stone-800 bg-black/25 p-4 text-sm text-stone-400">No production items are currently queued.</div> : null}
            {visible.map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${statusTone(item)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{item.name}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] opacity-65">{item.stage ?? "stage unset"} · {item.status ?? "status unset"}</div>
                  </div>
                  {item.id === activeId ? <span className="shrink-0 rounded-full border border-emerald-700 bg-emerald-950/50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-200">Active</span> : null}
                </div>
                {item.nextAction ? <div className="mt-3 text-sm leading-5 opacity-90">{item.nextAction}</div> : null}
                {item.blocker ? <div className="mt-2 rounded-lg border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-200">Blocked: {item.blocker}</div> : null}
                <div className="mt-2 break-all text-[10px] opacity-45">{item.id}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`min-h-[60px] w-full rounded-2xl border px-4 shadow-2xl active:scale-[0.99] ${attentionCount ? "border-red-800 bg-red-950/90 text-red-100" : "border-[#624421] bg-[#17191a]/95 text-amber-100"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-65">Production Steward</div>
              <div className="text-sm font-semibold">Queue · {actionable.length} actionable</div>
            </div>
            <div className="text-right text-xs opacity-75">{attentionCount ? `${attentionCount} need attention` : "Tap to inspect"}</div>
          </div>
        </button>
      )}
    </div>
  );
}
