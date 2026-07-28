import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import type { PlannedFilament, PlannedPrototype, PrototypeStatus } from "../../types/planning";

const prototypeStatuses: PrototypeStatus[] = ["Active Idea", "In Progress", "Refining", "Modeled", "On Hold"];

function statusClass(value: string) {
  if (value === "High" || value === "Need to Order") return "border-amber-500/25 bg-amber-500/15 text-amber-200";
  if (value === "Approved" || value === "Active" || value === "Modeled") return "border-emerald-500/25 bg-emerald-500/15 text-emerald-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

export function PlanningView({ state }: { state: any }) {
  const prototypes: PlannedPrototype[] = state.prototypes ?? [];
  const plannedFilament: PlannedFilament[] = state.plannedFilament ?? [];
  const designPlanning = state.designPlanning ?? [];
  const realmMaterials = state.realmMaterials ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Planned Design Projects"><div className="text-3xl font-semibold">{designPlanning.length}</div><div className="mt-1 text-xs text-slate-500">Architecture records</div></Card>
        <Card title="Prototype Backlog"><div className="text-3xl font-semibold">{prototypes.length}</div><div className="mt-1 text-xs text-slate-500">Ideas and active tests</div></Card>
        <Card title="Filament To Order"><div className="text-3xl font-semibold">{plannedFilament.filter((f) => f.status === "Need to Order").length}</div><div className="mt-1 text-xs text-slate-500">Planned material library</div></Card>
        <Card title="Realm Profiles"><div className="text-3xl font-semibold">{realmMaterials.length}</div><div className="mt-1 text-xs text-slate-500">Material / finish guides</div></Card>
      </div>

      <Card title="Prototype Board" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Planning, not production</span>}>
        <div className="grid gap-4 xl:grid-cols-5">
          {prototypeStatuses.map((status) => {
            const items = prototypes.filter((prototype) => prototype.status === status);
            return (
              <div key={status} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{status}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map((prototype) => (
                    <div key={prototype.id} className="rounded-xl border border-white/10 bg-[#111722] p-3">
                      <div className="font-medium text-slate-100">{prototype.designName}</div>
                      <div className="mt-1 text-xs text-slate-500">{prototype.family} · {prototype.collection}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(prototype.priority)}`}>{prototype.priority}</span>
                        {prototype.realm ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{prototype.realm}</span> : null}
                      </div>
                      <div className="mt-3 text-xs text-slate-400">Next: {prototype.nextStep}</div>
                      <div className="mt-3">
                        <Select value={prototype.status} onChange={(e) => state.updatePrototype?.(prototype.id, { status: e.target.value })}>
                          {prototypeStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <Card title="Filament Planner / Shopping List" right={<span className="text-xs text-slate-500">Planned ≠ Owned</span>}>
          <div className="space-y-3">
            {plannedFilament.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{item.brand} {item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.materialFamily} · {item.batchGroup}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="mt-3 text-sm text-slate-400">{item.finishDirection}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.realms.map((realm) => <span key={realm} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{realm}</span>)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select value={item.status} onChange={(e) => state.updatePlannedFilament?.(item.id, { status: e.target.value })} className="w-40">
                    <option value="Need to Order">Need to Order</option>
                    <option value="Ordered">Ordered</option>
                    <option value="In Testing">In Testing</option>
                    <option value="Approved">Approved</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </Select>
                  <Button variant="ghost" onClick={() => state.movePlannedFilamentToInventory?.(item.id)}>Move to Inventory</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Realm Material Reference">
          <div className="space-y-3">
            {realmMaterials.map((realm: any) => (
              <div key={realm.realm} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{realm.realm}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{realm.batchGroup}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Base candidates: {realm.baseCandidates.join(" · ")}</div>
                <div className="mt-3 text-sm text-slate-400">{realm.finishDirection}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Design Planning Board">
        <div className="grid gap-3 xl:grid-cols-2">
          {designPlanning.map((item: any) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{item.baseDesign}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.designFamily} · {item.collection} · {item.tier}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(item.prototypePriority)}`}>{item.prototypePriority}</span>
              </div>
              <div className="mt-3 text-sm text-slate-400">{item.coreFunction}</div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                <div>Core Parts: {item.coreParts}</div>
                <div>Variant Parts: {item.variantParts}</div>
                <div>Attachments: {item.attachmentTypes}</div>
                <div>Printer Fit: {item.bestPrinterFit}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
