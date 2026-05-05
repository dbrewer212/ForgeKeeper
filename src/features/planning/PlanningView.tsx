import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { PlannedFilamentRecord, PlanningStatus, PrototypeRecord, PrototypeStatus } from "../../types/planning";

type PlanningTab = "products" | "prototypes" | "materials" | "realms";

const prototypeStatuses: PrototypeStatus[] = ["Active Idea", "In Progress", "Refining", "Modeled", "On Hold", "Approved"];
const planningStatuses: PlanningStatus[] = ["Planned", "Need to Order", "Ordered", "In Testing", "Approved", "Active", "Archived"];

function statusClass(status: string) {
  if (["Approved", "Active", "Modeled"].includes(status)) return "border-emerald-500/25 bg-emerald-500/15 text-emerald-300";
  if (["In Progress", "Refining", "Ordered", "In Testing"].includes(status)) return "border-amber-500/25 bg-amber-500/15 text-amber-200";
  if (["On Hold", "Archived"].includes(status)) return "border-rose-500/25 bg-rose-500/15 text-rose-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

function priorityClass(priority: string) {
  if (priority === "High") return "text-amber-300";
  if (priority === "Medium") return "text-sky-300";
  return "text-slate-400";
}

export function PlanningView({ state }: { state: any }) {
  const [tab, setTab] = useState<PlanningTab>("prototypes");
  const [query, setQuery] = useState("");

  const prototypes: PrototypeRecord[] = state.prototypes ?? [];
  const plannedFilament: PlannedFilamentRecord[] = state.plannedFilament ?? [];
  const productPlanning = state.productPlanning ?? [];
  const realmMaterialProfiles = state.realmMaterialProfiles ?? [];

  const filteredPrototypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prototypes;
    return prototypes.filter((p) => [p.productName, p.family, p.collection, p.realm, p.status, p.priority, p.notes].join(" ").toLowerCase().includes(q));
  }, [prototypes, query]);

  const filteredFilament = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plannedFilament;
    return plannedFilament.filter((f) => [f.name, f.brand, f.materialFamily, f.realmUses.join(" "), f.status, f.batchGroup, f.notes].join(" ").toLowerCase().includes(q));
  }, [plannedFilament, query]);

  const prototypeCounts = useMemo(() => ({
    high: prototypes.filter((p) => p.priority === "High").length,
    active: prototypes.filter((p) => p.status === "Active Idea" || p.status === "In Progress").length,
    approved: prototypes.filter((p) => p.status === "Approved" || p.status === "Modeled").length,
  }), [prototypes]);

  return (
    <div className="space-y-6">
      <Card
        title="Planning Command"
        right={
          <div className="flex flex-wrap gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search planning..." className="w-56" />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active Prototypes</div>
            <div className="mt-2 text-3xl font-semibold text-slate-100">{prototypeCounts.active}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">High Priority</div>
            <div className="mt-2 text-3xl font-semibold text-amber-300">{prototypeCounts.high}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Materials Need Order</div>
            <div className="mt-2 text-3xl font-semibold text-slate-100">{plannedFilament.filter((f) => f.status === "Need to Order").length}</div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {([
          ["prototypes", "Prototype Backlog"],
          ["materials", "Filament Planner"],
          ["realms", "Realm Materials"],
          ["products", "Product Planning"],
        ] as Array<[PlanningTab, string]>).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl border px-4 py-2 text-sm transition ${tab === key ? "border-amber-500/35 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "prototypes" && (
        <div className="grid gap-4 xl:grid-cols-3">
          {prototypeStatuses.map((status) => (
            <Card key={status} title={status} right={<span className={`rounded-full border px-3 py-1 text-xs ${statusClass(status)}`}>{filteredPrototypes.filter((p) => p.status === status).length}</span>}>
              <div className="space-y-3">
                {filteredPrototypes.filter((p) => p.status === status).map((prototype) => (
                  <div key={prototype.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-100">{prototype.productName}</div>
                        <div className="mt-1 text-xs text-slate-500">{prototype.family} · {prototype.collection}</div>
                      </div>
                      <span className={`text-xs font-semibold ${priorityClass(prototype.priority)}`}>{prototype.priority}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-400">
                      <div><span className="text-slate-500">Realm:</span> {prototype.realm || "Universal"}</div>
                      <div><span className="text-slate-500">Printer:</span> {prototype.printerFit}</div>
                      <div><span className="text-slate-500">Next:</span> {prototype.nextStep}</div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <Select value={prototype.status} onChange={(e) => state.updatePrototype?.(prototype.id, { status: e.target.value })}>
                        {prototypeStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </div>
                    {prototype.notes ? <div className="mt-3 rounded-xl border border-white/10 bg-[#111722] p-3 text-xs text-slate-400">{prototype.notes}</div> : null}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "materials" && (
        <Card title="Filament Planner" right={<span className="text-xs text-slate-500">Planned materials are separate from owned inventory</span>}>
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredFilament.map((filament) => (
              <div key={filament.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{filament.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{filament.brand} · {filament.materialFamily} · {filament.batchGroup}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(filament.status)}`}>{filament.status}</span>
                </div>
                <div className="mt-3 text-xs text-slate-400">Realms: {filament.realmUses.join(", ")}</div>
                <div className="mt-2 text-xs text-slate-400">Finish: {filament.finishDirection}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select value={filament.status} onChange={(e) => state.updatePlannedFilament?.(filament.id, { status: e.target.value })} className="w-44">
                    {planningStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                  <Button variant="ghost" onClick={() => state.movePlannedFilamentToInventory?.(filament.id)}>Move to Inventory</Button>
                  <Button variant="danger" onClick={() => state.removePlannedFilament?.(filament.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "realms" && (
        <Card title="Realm Material Reference">
          <div className="grid gap-4 xl:grid-cols-2">
            {realmMaterialProfiles.map((realm: any) => (
              <div key={realm.realm} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{realm.realm}</div>
                    <div className="mt-1 text-xs text-amber-300">{realm.shorthand}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{realm.batchGroup}</span>
                </div>
                <div className="mt-3 text-xs text-slate-400">{realm.mood}</div>
                <div className="mt-3 text-xs text-slate-500">Base candidates</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {realm.baseCandidates.map((candidate: string) => (
                    <span key={candidate} className="rounded-full border border-white/10 bg-[#111722] px-3 py-1 text-xs text-slate-300">{candidate}</span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-400">Finish: {realm.finishDirection}</div>
                <div className="mt-2 text-xs text-slate-500">Best fits: {realm.bestFits}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "products" && (
        <Card title="Product Planning Board">
          <div className="space-y-3">
            {productPlanning.map((plan: any) => (
              <div key={plan.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{plan.baseProduct}</div>
                    <div className="mt-1 text-xs text-slate-500">{plan.productFamily} · {plan.collection} · {plan.tier}</div>
                  </div>
                  <span className={`text-xs font-semibold ${priorityClass(plan.prototypePriority)}`}>{plan.prototypePriority}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-xs text-slate-400">
                  <div><span className="text-slate-500">Function:</span> {plan.coreFunction}</div>
                  <div><span className="text-slate-500">Core:</span> {plan.coreParts}</div>
                  <div><span className="text-slate-500">Variants:</span> {plan.variantParts}</div>
                  <div><span className="text-slate-500">Printer:</span> {plan.bestPrinterFit}</div>
                </div>
                <div className="mt-3 text-xs text-slate-500">{plan.notes}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
