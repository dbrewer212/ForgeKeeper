import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { FoundryAsset } from "../../workbench/contracts";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

function countByAsset<T>(records: T[], assetId: (record: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const id = assetId(record);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
}

export function AssetVaultView({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [busyAction, setBusyAction] = useState<"archive" | "retire" | "remove" | null>(null);
  const [lifecycleMessage, setLifecycleMessage] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runtime.assets;
    return runtime.assets.filter((asset) => [asset.name, asset.assetType, asset.lifecycleStatus, ...asset.tags].join(" ").toLowerCase().includes(needle));
  }, [query, runtime.assets]);

  const revisionCounts = useMemo(
    () => countByAsset(runtime.workbench.revisions, (record) => record.assetId),
    [runtime.workbench.revisions],
  );
  const printCounts = useMemo(
    () => countByAsset(runtime.workbench.printRecords, (record) => record.assetId),
    [runtime.workbench.printRecords],
  );

  const selected: FoundryAsset | undefined = runtime.assets.find((asset) => asset.assetId === selectedAssetId) ?? filtered[0] ?? runtime.assets[0];
  const selectedProjection = useMemo(() => {
    if (!selected) return undefined;
    return {
      revision: runtime.workbench.revisions.find((item) => item.revisionId === selected.currentRevisionId),
      relationships: runtime.workbench.relationships.filter((item) => item.fromAssetId === selected.assetId || item.toAssetId === selected.assetId),
      variants: runtime.workbench.variants.filter((item) => item.assetId === selected.assetId || item.parentAssetId === selected.assetId),
      specs: runtime.workbench.manufacturingSpecs.filter((item) => item.assetId === selected.assetId),
      inspections: runtime.workbench.inspections.filter((item) => item.assetId === selected.assetId),
      preparations: runtime.workbench.preparations.filter((item) => item.assetId === selected.assetId),
      prints: runtime.workbench.printRecords.filter((item) => item.assetId === selected.assetId),
    };
  }, [selected, runtime.workbench]);

  const revision = selectedProjection?.revision;
  const relationships = selectedProjection?.relationships ?? [];
  const variants = selectedProjection?.variants ?? [];
  const specs = selectedProjection?.specs ?? [];
  const inspections = selectedProjection?.inspections ?? [];
  const preparations = selectedProjection?.preparations ?? [];
  const prints = selectedProjection?.prints ?? [];

  async function changeLifecycle(action: "archive" | "retire") {
    if (!selected) return;
    setBusyAction(action);
    setLifecycleError("");
    setLifecycleMessage("");
    try {
      if (action === "archive") await runtime.archiveAsset(selected.assetId);
      else await runtime.retireAsset(selected.assetId);
      setLifecycleMessage(`${selected.name} is now ${action === "archive" ? "archived" : "retired"}. Its history remains intact.`);
    } catch (cause) {
      setLifecycleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyAction(null);
    }
  }

  async function removeSelected() {
    if (!selected) return;
    setBusyAction("remove");
    setLifecycleError("");
    setLifecycleMessage("");
    try {
      const summary = await runtime.assetDependencySummary(selected.assetId);
      if (summary.printRecords > 0) throw new Error("This asset has physical print evidence and cannot be hard-deleted. Retire or archive it instead.");
      if (summary.submittedPreparations > 0) throw new Error("This asset has work already released to production and cannot be hard-deleted.");

      const detail = [
        `${summary.revisions} revision(s)`,
        `${summary.relationships} relationship(s)`,
        `${summary.variants} variant record(s)`,
        `${summary.manufacturingSpecs} manufacturing spec(s)`,
        `${summary.inspections} inspection record(s)`,
        `${summary.preparations} preparation(s)`,
      ].join("\n");
      const confirmed = window.confirm(`Permanently remove ${selected.name}?\n\nThis will remove the asset and its non-production Workbench records:\n${detail}\n\nFoundry-managed files are not deleted automatically. This action cannot be undone.`);
      if (!confirmed) return;

      await runtime.removeAsset(selected.assetId);
      setSelectedAssetId("");
      setLifecycleMessage(`${selected.name} was removed from the Workbench. Managed source files were preserved for separate cleanup/reuse.`);
    } catch (cause) {
      setLifecycleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Asset Vault</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Canonical Foundry assets, revisions, lineage, manufacturing evidence, and production history. Files are properties of assets; filenames are not identities.</p>
          </div>
          <Button variant="ghost" onClick={() => void runtime.refresh()}>Refresh Vault</Button>
        </div>
      </div>

      {runtime.error ? <Card title="Workbench Runtime"><div className="text-sm text-rose-300">{runtime.error}</div></Card> : null}
      {!runtime.ready ? <Card title="Asset Vault"><div className="text-sm text-slate-400">Loading canonical Workbench state…</div></Card> : null}
      {lifecycleError ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{lifecycleError}</div> : null}
      {lifecycleMessage ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{lifecycleMessage}</div> : null}

      {runtime.ready ? (
        <div className="grid gap-6 xl:grid-cols-[360px,minmax(0,1fr)]">
          <Card title="Vault Gallery" right={<span className="text-xs text-slate-500">{runtime.assets.length} assets</span>}>
            <div className="space-y-3">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets, type, status, tags" />
              <div className="space-y-2">
                {filtered.map((asset) => {
                  const active = selected?.assetId === asset.assetId;
                  const revisionCount = revisionCounts.get(asset.assetId) ?? 0;
                  const printCount = printCounts.get(asset.assetId) ?? 0;
                  return (
                    <button key={asset.assetId} type="button" onClick={() => { setSelectedAssetId(asset.assetId); setLifecycleError(""); setLifecycleMessage(""); }} className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-amber-500/35 bg-amber-500/10" : "border-white/10 bg-[#0b1119] hover:bg-white/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-100">{asset.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{asset.assetType} · {asset.lifecycleStatus}</div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">{revisionCount} rev</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {asset.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-slate-500">{tag}</span>)}
                      </div>
                      <div className="mt-3 text-[11px] text-slate-500">{printCount} print record{printCount === 1 ? "" : "s"}</div>
                    </button>
                  );
                })}
                {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No assets match this search.</div> : null}
              </div>
            </div>
          </Card>

          {!selected ? (
            <Card title="Asset Dossier"><div className="text-sm text-slate-500">No Workbench asset is registered yet.</div></Card>
          ) : (
            <div className="space-y-5">
              <Card title="Asset Dossier" right={<span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-xs text-amber-300">{selected.lifecycleStatus}</span>}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),320px]">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-amber-400">{selected.assetType}</div>
                    <h2 className="mt-2 text-3xl font-semibold text-slate-100">{selected.name}</h2>
                    <div className="mt-2 break-all text-xs text-slate-500">{selected.assetId}</div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">{selected.notes || "No asset notes recorded."}</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric label="Relationships" value={relationships.length} />
                      <Metric label="Variants" value={variants.length} />
                      <Metric label="Preparations" value={preparations.length} />
                      <Metric label="Print evidence" value={prints.length} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0b1119] p-4 text-sm">
                    <Info label="Current revision" value={revision?.revisionLabel || "No revision"} />
                    <Info label="Manufacturing approval" value={revision?.manufacturingApproval || "not-reviewed"} />
                    <Info label="Provenance" value={selected.provenance.sourceLabel || selected.provenance.sourceType} />
                    <Info label="Inspection records" value={String(inspections.length)} />
                    <Info label="Manufacturing specs" value={String(specs.length)} />
                  </div>
                </div>
              </Card>

              <Card title="Asset Lifecycle" right={<span className="text-xs text-slate-500">History-preserving by default</span>}>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
                  <div className="text-sm leading-6 text-slate-400">
                    Archive removes an asset from active work while preserving its history. Retire marks a historical Foundry asset that should no longer be used for new production. Permanent removal is limited to assets without returned print evidence or released production work.
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button variant="ghost" disabled={busyAction !== null || selected.lifecycleStatus === "archived"} onClick={() => void changeLifecycle("archive")}>{busyAction === "archive" ? "Archiving…" : "Archive"}</Button>
                    <Button variant="ghost" disabled={busyAction !== null || selected.lifecycleStatus === "retired"} onClick={() => void changeLifecycle("retire")}>{busyAction === "retire" ? "Retiring…" : "Retire"}</Button>
                    <Button variant="danger" disabled={busyAction !== null || prints.length > 0 || preparations.some((item) => item.status === "submitted")} onClick={() => void removeSelected()}>{busyAction === "remove" ? "Removing…" : "Remove Permanently"}</Button>
                  </div>
                </div>
                {prints.length > 0 ? <div className="mt-3 text-xs text-amber-300">Permanent removal is disabled because this asset has physical print evidence.</div> : null}
                {preparations.some((item) => item.status === "submitted") ? <div className="mt-2 text-xs text-amber-300">Permanent removal is disabled because a preparation has already been released to production.</div> : null}
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Revision & Manufacturing">
                  <div className="space-y-3 text-sm">
                    <Info label="Revision ID" value={revision?.revisionId || "None"} />
                    <Info label="Reason" value={revision?.reason || "No revision record."} />
                    <Info label="Source files" value={String(revision?.sourceFileIds.length ?? 0)} />
                    <Info label="Output files" value={String(revision?.outputFileIds.length ?? 0)} />
                    <Info label="Inspection evidence" value={String(revision?.inspectionResultIds.length ?? 0)} />
                    {specs[0] ? <Info label="Process" value={specs[0].intendedProcess} /> : null}
                  </div>
                </Card>
                <Card title="Lineage & Production Evidence">
                  <div className="space-y-3 text-sm">
                    <Info label="Relationships" value={relationships.length ? relationships.map((item) => item.type).join(", ") : "None recorded"} />
                    <Info label="Variant descendants" value={String(variants.filter((item) => item.parentAssetId === selected.assetId).length)} />
                    <Info label="Preparation records" value={String(preparations.length)} />
                    <Info label="Completed print records" value={String(prints.length)} />
                  </div>
                </Card>
              </div>

              <Card title="Workbench Status">
                <div className="grid gap-3 md:grid-cols-3">
                  <Status label="Intake" value={revision?.sourceFileIds.length ? "Registered geometry" : "Geometry pending controlled Intake"} />
                  <Status label="Inspection" value={inspections.length ? `${inspections.length} evidence record(s)` : "No inspection evidence yet"} />
                  <Status label="Production" value={prints.length ? `${prints.length} print record(s)` : "No returned physical evidence yet"} />
                </div>
              </Card>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-semibold text-slate-100">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 py-2 last:border-0"><div className="text-[10px] uppercase tracking-[0.15em] text-slate-600">{label}</div><div className="mt-1 break-words text-slate-300">{value}</div></div>;
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#0b1119] p-4"><div className="text-xs uppercase tracking-[0.16em] text-amber-400">{label}</div><div className="mt-2 text-sm text-slate-300">{value}</div></div>;
}
