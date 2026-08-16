import { useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { CanonAssetRole, CanonRecord, CanonStatus, LibraryAssetRecord } from "../../types/domain";

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
  const duplicateIdentities = duplicateAssetCount(state.libraryAssets);
  const unresolvedLinks = state.canonRecords.flatMap((record) => record.assetLinks).filter((link) => !state.libraryAssets.some((asset) => asset.id === link.assetId)).length;

  return (
    <div className="space-y-6">
      <Card title="Library–ForgeKeeper Index" right={<span className="text-xs text-slate-500">Stable identity, location, and content fingerprint</span>}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <IndexStat label="Linked Library assets" value={state.libraryAssets.length} tone="emerald" />
          <IndexStat label="Canon records covered" value={state.canonRecords.filter((record) => record.assetLinks.length > 0 || record.authorityBasis === "Decision Record").length} tone="amber" />
          <IndexStat label="Unresolved links" value={unresolvedLinks} tone={unresolvedLinks ? "rose" : "emerald"} />
          <IndexStat label="Duplicate identities" value={duplicateIdentities} tone={duplicateIdentities ? "rose" : "emerald"} />
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">ForgeKeeper indexes Library files without copying their artwork into the repository. A changed path means an asset moved; a changed SHA-256 means its content changed.</p>
      </Card>
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
          {selected ? <CanonDetail record={selected} assets={state.libraryAssets} /> : <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-500">Select a canon record.</div>}
        </div>
      </Card>
    </div>
  );
}

function CanonDetail({ record, assets }: { record: CanonRecord; assets: LibraryAssetRecord[] }) {
  const links = record.assetLinks.map((link) => ({ ...link, asset: assets.find((asset) => asset.id === link.assetId) }));
  const missingLinks = links.filter((link) => !link.asset).length;
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
        <Info title="Primary authority" body={`${record.primaryAuthority} · ${record.authorityBasis}`} />
        <Info title="Decision evidence" body={record.decisionEvidence} />
        <Info title="Last canon change" body={record.lastCanonChange} />
        <Info title="Superseded / historical references" body={record.supersededReferences.length ? record.supersededReferences.join(" · ") : "None recorded"} />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-[#111722] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs uppercase tracking-wide text-slate-500">Linked Library evidence</div><div className="mt-1 text-sm text-slate-300">{links.length ? `${links.length} indexed asset${links.length === 1 ? "" : "s"}` : "No visual asset required"}</div></div>
          <span className={`rounded-full border px-3 py-1 text-[11px] ${missingLinks ? "border-rose-500/25 bg-rose-500/10 text-rose-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"}`}>{missingLinks ? `${missingLinks} unresolved` : "Index healthy"}</span>
        </div>
        {links.length ? <div className="mt-4 space-y-3">{links.map((link) => <AssetLinkCard key={`${record.id}-${link.assetId}-${link.role}`} role={link.role} note={link.note} asset={link.asset} />)}</div> : <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100">{record.authorityBasis === "Decision Record" ? "Authority is an explicit Foundry decision. Purge has no official visual asset by design." : "No Library asset has been linked yet."}</div>}
      </div>
      {record.notes && <div className="mt-4 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4 text-sm text-sky-100">{record.notes}</div>}
      <div className="mt-4 text-xs text-slate-500">Canon changes remain deliberate decisions. This registry does not infer approval from continued work, praise, or a generated image.</div>
    </article>
  );
}

function AssetLinkCard({ role, note, asset }: { role: CanonAssetRole; note: string; asset?: LibraryAssetRecord }) {
  if (!asset) return <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">Missing indexed asset · {role} · {note}</div>;
  return <div className="rounded-xl border border-white/8 bg-[#0d131c] p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium text-slate-100">{asset.name}</div><div className="mt-1 text-xs text-slate-500">{role} · {asset.status}</div></div><span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[10px] text-emerald-300">SHA-256 recorded</span></div>
    <div className="mt-3 break-all text-xs leading-5 text-slate-400">{asset.libraryPath}</div>
    <div className="mt-2 grid gap-1 text-[11px] text-slate-500 md:grid-cols-2"><span>Library: {asset.libraryFileId}</span><span>File: {asset.fileId}</span><span>Size: {formatBytes(asset.sizeBytes)}</span><span>Fingerprint: {asset.sha256.slice(0, 16)}…</span></div>
    <div className="mt-3 text-xs leading-5 text-slate-300">{note}</div>
  </div>;
}

function IndexStat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "rose" }) {
  const colors = { amber: "border-amber-500/20 bg-amber-500/5 text-amber-300", emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300", rose: "border-rose-500/20 bg-rose-500/5 text-rose-300" };
  return <div className={`rounded-2xl border p-4 ${colors[tone]}`}><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div></div>;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function duplicateAssetCount(assets: LibraryAssetRecord[]) {
  const seenLibraryIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const duplicates = new Set<string>();
  for (const asset of assets) {
    if (seenLibraryIds.has(asset.libraryFileId) || seenFingerprints.has(asset.sha256) || asset.duplicateOfAssetId) duplicates.add(asset.id);
    seenLibraryIds.add(asset.libraryFileId);
    seenFingerprints.add(asset.sha256);
  }
  return duplicates.size;
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
