import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ProductionItemSummary } from "../../mesh/domainServices";
import { HumanAuthority } from "../../mesh/domainServices";
import { getFoundryMeshRuntime } from "../../mesh";
import { ProductionSteward } from "../../mesh/productionSteward";

function priority(item: ProductionItemSummary): number {
  if (item.status === "attention-required" || item.blocker) return 0;
  if (item.status === "active" || item.stage === "printing") return 1;
  if (item.status === "queued") return 2;
  if (item.stage === "finishing") return 3;
  if (item.status === "completed") return 5;
  return 4;
}

function columnFor(item: ProductionItemSummary): "attention" | "queued" | "printing" | "finishing" | "complete" {
  if (item.status === "attention-required" || item.blocker) return "attention";
  if (item.status === "completed" || item.stage === "complete") return "complete";
  if (item.stage === "finishing") return "finishing";
  if (item.status === "active" || item.stage === "printing") return "printing";
  return "queued";
}

const columns = [
  { id: "attention", label: "Attention" },
  { id: "queued", label: "Queued" },
  { id: "printing", label: "Printing" },
  { id: "finishing", label: "Finishing" },
  { id: "complete", label: "Complete" },
] as const;

export function ProductionView() {
  const [items, setItems] = useState<ProductionItemSummary[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const [nextActionDrafts, setNextActionDrafts] = useState<Record<string, string>>({});
  const [blockerDrafts, setBlockerDrafts] = useState<Record<string, string>>({});

  const runtime = useMemo(() => getFoundryMeshRuntime(), []);
  const steward = useMemo(() => new ProductionSteward(runtime), [runtime]);

  async function refresh() {
    try {
      await runtime.initialize();
      const [productionItems, active] = await Promise.all([
        runtime.domain.get().production.list(),
        runtime.domain.get().production.getActiveWork(),
      ]);
      setItems(productionItems);
      setActiveId(active.productionItemId);
      setNextActionDrafts((current) => {
        const next = { ...current };
        for (const item of productionItems) if (!(item.id in next)) next[item.id] = item.nextAction ?? "";
        return next;
      });
      setError("");
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

  async function run(itemId: string, action: () => Promise<unknown>) {
    setBusyId(itemId);
    setError("");
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(undefined);
    }
  }

  async function saveNextAction(item: ProductionItemSummary) {
    const value = (nextActionDrafts[item.id] ?? "").trim();
    if (!value) {
      setError("Next action cannot be empty.");
      return;
    }
    await run(item.id, () => runtime.domain.get().production.setNextAction(item.id, value, {
      requestedBy: HumanAuthority,
      authorizedBy: HumanAuthority,
      correlationId: item.id,
      reason: "Operator updated the production next action from the desktop Production station.",
    }));
  }

  async function markAttention(item: ProductionItemSummary) {
    const blocker = (blockerDrafts[item.id] ?? "").trim();
    if (!blocker) {
      setError("Explain the blocker before marking a production item attention-required.");
      return;
    }
    await run(item.id, () => steward.markAttention(item.id, blocker));
    setBlockerDrafts((current) => ({ ...current, [item.id]: "" }));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Production Steward</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">One durable production queue shared by ForgeKeeper and Bastion. Workbench releases approved preparations into Steward ownership; this station controls execution without creating a second Order truth.</p>
          </div>
          <Button variant="ghost" onClick={() => void refresh()}>Refresh Queue</Button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}

      <Card title="Steward Queue" right={<span className="text-xs text-slate-500">{ordered.filter((item) => item.status !== "completed").length} actionable · {activeId ? "1 active session" : "no active production session"}</span>}>
        <div className="grid gap-4 2xl:grid-cols-5 xl:grid-cols-3 lg:grid-cols-2">
          {columns.map((column) => {
            const jobs = ordered.filter((item) => columnFor(item) === column.id);
            return (
              <section key={column.id} className="rounded-2xl border border-white/10 bg-[#0b1119] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{column.label}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{jobs.length}</span>
                </div>
                <div className="space-y-4">
                  {jobs.map((item) => (
                    <ProductionCard
                      key={item.id}
                      item={item}
                      active={item.id === activeId}
                      busy={busyId === item.id}
                      nextAction={nextActionDrafts[item.id] ?? item.nextAction ?? ""}
                      blockerDraft={blockerDrafts[item.id] ?? ""}
                      setNextAction={(value) => setNextActionDrafts((current) => ({ ...current, [item.id]: value }))}
                      setBlocker={(value) => setBlockerDrafts((current) => ({ ...current, [item.id]: value }))}
                      saveNextAction={() => void saveNextAction(item)}
                      start={() => void run(item.id, () => steward.startProductionItem(item.id))}
                      finishing={() => void run(item.id, () => steward.advanceProductionItem(item.id, "finishing"))}
                      complete={() => void run(item.id, () => steward.completeProductionItem(item.id))}
                      attention={() => void markAttention(item)}
                      clearAttention={() => void run(item.id, () => steward.clearAttention(item.id))}
                    />
                  ))}
                  {jobs.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">No production items in this stage.</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ProductionCard({
  item,
  active,
  busy,
  nextAction,
  blockerDraft,
  setNextAction,
  setBlocker,
  saveNextAction,
  start,
  finishing,
  complete,
  attention,
  clearAttention,
}: {
  item: ProductionItemSummary;
  active: boolean;
  busy: boolean;
  nextAction: string;
  blockerDraft: string;
  setNextAction(value: string): void;
  setBlocker(value: string): void;
  saveNextAction(): void;
  start(): void;
  finishing(): void;
  complete(): void;
  attention(): void;
  clearAttention(): void;
}) {
  return (
    <article className={`rounded-2xl border p-4 ${active ? "border-emerald-500/35 bg-emerald-500/5" : item.blocker ? "border-rose-500/25 bg-rose-500/5" : "border-white/10 bg-[#111722]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-100">{item.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">{item.stage ?? "stage unset"} · {item.status ?? "status unset"}</div>
        </div>
        {active ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-300">Active</span> : null}
      </div>

      {item.workbench ? (
        <div className="mt-3 rounded-xl border border-white/8 bg-black/15 p-3 text-[10px] leading-5 text-slate-500">
          <div className="break-all">Asset: {item.workbench.assetId}</div>
          <div className="break-all">Revision: {item.workbench.revisionId}</div>
          <div className="break-all">Preparation: {item.workbench.preparationId}</div>
          <div>Printer: {item.workbench.printerId || "unassigned"}</div>
        </div>
      ) : <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs text-amber-200">Legacy/unlinked production item. No Workbench preparation linkage is recorded.</div>}

      {item.blocker ? <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">Blocked: {item.blocker}</div> : null}

      <div className="mt-4 space-y-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Next action</div>
        <Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} disabled={busy || item.status === "completed"} />
        {item.status !== "completed" ? <Button variant="ghost" onClick={saveNextAction} disabled={busy}>Save Next Action</Button> : null}
      </div>

      {item.status !== "completed" ? (
        <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
          {!item.blocker ? (
            <>
              <Input value={blockerDraft} onChange={(event) => setBlocker(event.target.value)} placeholder="Blocker / attention note" disabled={busy} />
              <Button variant="ghost" onClick={attention} disabled={busy}>Mark Attention</Button>
            </>
          ) : <Button variant="ghost" onClick={clearAttention} disabled={busy}>Clear Blocker</Button>}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        {item.status !== "completed" && !active && !item.blocker ? <Button onClick={start} disabled={busy}>{busy ? "Working…" : "Start"}</Button> : null}
        {(active || item.stage === "printing") && !item.blocker ? <Button variant="ghost" onClick={finishing} disabled={busy}>Move to Finishing</Button> : null}
        {item.stage === "finishing" && !item.blocker ? <Button onClick={complete} disabled={busy}>Complete</Button> : null}
      </div>
      <div className="mt-3 break-all text-[10px] text-slate-600">{item.id}</div>
    </article>
  );
}
