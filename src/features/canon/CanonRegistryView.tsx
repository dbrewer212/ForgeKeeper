import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { CanonRecord, CanonStatus } from "../../types/domain";

const statusTone: Record<CanonStatus, string> = {
  Locked: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  "Established Direction": "border-amber-500/25 bg-amber-500/10 text-amber-300",
  Developing: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  Historical: "border-white/10 bg-white/5 text-slate-400",
};

export function CanonRegistryView({ state }: { state: ForgekeeperState }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CanonStatus | "All">("All");
  const [selectedId, setSelectedId] = useState(state.canonRecords[0]?.id ?? "");
  const filtered = useMemo(() => state.canonRecords.filter((record) => {
    const matchesStatus = status === "All" || record.canonStatus === status;
    const haystack = [record.name, record.kind, record.identity, record.foundryRole, record.symbolism, ...record.relationships, ...record.characterDna].join(" ").toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [query, status, state.canonRecords]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];

  return (
    <div className="space-y-6">
      <Card title="Canon Registry" right={<span className="text-xs text-slate-500">Identity before implementation</span>}>
        <div className="grid gap-3 md:grid-cols-[1fr,220px]">
          <Input placeholder="Search identity, DNA, symbolism…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select value={status} onChange={(event) => setStatus(event.target.value as CanonStatus | "All")}>
            <option>All</option>
            <option>Locked</option>
            <option>Established Direction</option>
            <option>Developing</option>
            <option>Historical</option>
          </Select>
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[0.42fr,1.58fr]">
          <div className="space-y-3">
            {filtered.map((record) => (
              <button key={record.id} onClick={() => setSelectedId(record.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === record.id ? "border-amber-500/35 bg-amber-500/10" : "border-white/10 bg-[#0d131c] hover:bg-white/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-semibold text-slate-100">{record.name}</div><div className="mt-1 text-xs text-slate-500">{record.kind}</div></div>
                  <CanonPill status={record.canonStatus} />
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No canon records match.</div>}
          </div>
          {selected ? <CanonDetail record={selected} /> : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">Select a canon record.</div>}
        </div>
      </Card>
    </div>
  );
}

function CanonDetail({ record }: { record: CanonRecord }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0d131c] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-5">
        <div><div className="text-2xl font-semibold text-slate-50">{record.name}</div><div className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{record.identity}</div></div>
        <CanonPill status={record.canonStatus} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ListPanel title="Character DNA" items={record.characterDna} tone="amber" />
        <ListPanel title="Forbidden Drift" items={record.forbiddenDrift} tone="rose" />
        <ListPanel title="Allowed Variation" items={record.allowedVariation} tone="emerald" />
        <div className="space-y-4">
          <Info title="Foundry role" body={record.foundryRole} />
          <Info title="Symbolic meaning" body={record.symbolism} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Info title="Relationships" body={record.relationships.length ? record.relationships.join(" · ") : "None recorded"} />
        <Info title="Current production design" body={record.currentProductionDesign} />
        <Info title="Primary authority" body={`${record.primaryAuthority}${record.authorityLinked ? " · Library identity linked" : " · Library identity not linked yet"}`} />
        <Info title="Decision evidence" body={record.decisionEvidence} />
        <Info title="Last canon change" body={record.lastCanonChange} />
        <Info title="Superseded / historical references" body={record.supersededReferences.length ? record.supersededReferences.join(" · ") : "None recorded"} />
      </div>
      {record.notes && <div className="mt-4 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4 text-sm text-sky-100">{record.notes}</div>}
      <div className="mt-4 text-xs text-slate-500">Canon changes remain deliberate decisions. This registry does not infer approval from continued work, praise, or a generated image.</div>
    </article>
  );
}

function CanonPill({ status }: { status: CanonStatus }) {
  return <span className={`whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium ${statusTone[status]}`}>{status}</span>;
}

function ListPanel({ title, items, tone }: { title: string; items: string[]; tone: "amber" | "rose" | "emerald" }) {
  const tones = { amber: "border-amber-500/15 bg-amber-500/5", rose: "border-rose-500/15 bg-rose-500/5", emerald: "border-emerald-500/15 bg-emerald-500/5" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><div className="text-xs uppercase tracking-wide text-slate-400">{title}</div><ul className="mt-3 space-y-2 text-sm text-slate-200">{items.map((item) => <li key={item} className="flex gap-2"><span className="text-amber-400">◆</span><span>{item}</span></li>)}</ul></div>;
}

function Info({ title, body }: { title: string; body: string }) {
  return <div className="rounded-xl border border-white/8 bg-[#111722] p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{title}</div><div className="mt-2 text-sm leading-6 text-slate-200">{body}</div></div>;
}
