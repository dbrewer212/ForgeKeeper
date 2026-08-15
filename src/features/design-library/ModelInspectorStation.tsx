import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchInspectorService } from "../../workbench/inspector";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ModelInspectorStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const [assetId, setAssetId] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedAsset = runtime.assets.find((item) => item.assetId === assetId) ?? runtime.assets.find((item) => item.currentRevisionId) ?? runtime.assets[0];
  const revisions = useMemo(
    () => selectedAsset ? runtime.workbench.revisions.filter((item) => item.assetId === selectedAsset.assetId) : [],
    [runtime.workbench.revisions, selectedAsset],
  );
  const selectedRevision = revisions.find((item) => item.revisionId === revisionId)
    ?? revisions.find((item) => item.revisionId === selectedAsset?.currentRevisionId)
    ?? revisions[0];
  const inspections = selectedRevision
    ? runtime.workbench.inspections.filter((item) => item.revisionId === selectedRevision.revisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const latest = inspections[0];
  const sourceFiles = selectedRevision
    ? selectedRevision.sourceFileIds.map((id) => runtime.workbench.files.find((file) => file.fileId === id)).filter(Boolean)
    : [];

  async function runInspection() {
    if (!selectedAsset || !selectedRevision) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await getWorkbenchInspectorService().inspectRevision(selectedAsset.assetId, selectedRevision.revisionId, state.printers);
      setMessage(`Inspection recorded: ${result.inspection.inspectionResultId}`);
      await runtime.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Model Inspector</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Deterministic geometry evidence for an exact registered revision. Inspector records topology, dimensional bounds, disconnected shells, open edges, and printer-envelope compatibility; it does not grant manufacturing approval.
        </p>
      </div>

      {runtime.error ? <Card title="Workbench Runtime"><div className="text-sm text-rose-300">{runtime.error}</div></Card> : null}

      <Card title="Inspection Target" right={<Button onClick={() => void runInspection()} disabled={busy || !selectedRevision}>{busy ? "Inspecting…" : "Run Inspector"}</Button>}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">Asset</span>
            <Select value={selectedAsset?.assetId ?? ""} onChange={(event) => { setAssetId(event.target.value); setRevisionId(""); }}>
              {runtime.assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.lifecycleStatus}</option>)}
            </Select>
          </label>
          <label className="text-sm text-slate-400">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-slate-500">Revision</span>
            <Select value={selectedRevision?.revisionId ?? ""} onChange={(event) => setRevisionId(event.target.value)}>
              {revisions.map((revision) => <option key={revision.revisionId} value={revision.revisionId}>{revision.revisionLabel}</option>)}
            </Select>
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-[#0b1119] p-4 text-sm text-slate-400">
          {sourceFiles.length ? sourceFiles.map((file) => file ? <div key={file.fileId} className="break-all">{file.fileName} · {file.format.toUpperCase()} · {file.sha256.slice(0, 16)}…</div> : null) : "No registered source geometry on this revision. Run Intake first."}
        </div>
        {message ? <div className="mt-4 text-sm text-emerald-300">{message}</div> : null}
        {error ? <div className="mt-4 text-sm text-rose-300">{error}</div> : null}
      </Card>

      {latest ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),360px]">
            <Card title="Geometry Evidence" right={<span className="text-xs text-slate-500">{latest.engineId} v{latest.engineVersion}</span>}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Triangles" value={formatNumber(latest.geometry.triangleCount)} />
                <Metric label="Shells" value={formatNumber(latest.geometry.shellCount)} />
                <Metric label="Open edges" value={formatNumber(latest.geometry.openEdgeCount)} />
                <Metric label="Manifold" value={latest.geometry.manifold === undefined ? "Unknown" : latest.geometry.manifold ? "Yes" : "No"} />
                <Metric label="Findings" value={String(latest.findings.length)} />
              </div>
              <div className="mt-5">
                <EnvelopePreview bounds={latest.geometry.boundsMm} />
              </div>
            </Card>

            <Card title="Revision Evidence">
              <Info label="Inspection ID" value={latest.inspectionResultId} />
              <Info label="Revision" value={latest.revisionId} />
              <Info label="Recorded" value={new Date(latest.createdAt).toLocaleString()} />
              <Info label="Bounds" value={latest.geometry.boundsMm ? `${latest.geometry.boundsMm.x.toFixed(2)} × ${latest.geometry.boundsMm.y.toFixed(2)} × ${latest.geometry.boundsMm.z.toFixed(2)} mm` : "Unavailable"} />
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-500">
                The preview is the measured build envelope of the inspected mesh, not a fabricated shaded render.
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Inspector Findings">
              <div className="space-y-3">
                {latest.findings.map((finding) => (
                  <div key={finding.findingId} className="rounded-xl border border-white/10 bg-[#0b1119] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium text-slate-200">{finding.summary}</div>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">{finding.severity}</span>
                    </div>
                    {finding.recommendation ? <div className="mt-2 text-sm leading-5 text-slate-500">{finding.recommendation}</div> : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Printer Envelope Compatibility">
              <div className="space-y-3">
                {latest.machineCompatibility.map((compatibility) => {
                  const printer = state.printers.find((item) => item.id === compatibility.printerId);
                  return (
                    <div key={compatibility.printerId} className="rounded-xl border border-white/10 bg-[#0b1119] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-200">{printer?.name ?? compatibility.printerId}</div>
                        <span className={compatibility.compatible ? "text-xs font-semibold text-emerald-300" : "text-xs font-semibold text-rose-300"}>{compatibility.compatible ? "FITS" : "DOES NOT FIT"}</span>
                      </div>
                      <div className="mt-2 text-sm leading-5 text-slate-500">{compatibility.reasons.join(" ")}</div>
                    </div>
                  );
                })}
                {!latest.machineCompatibility.length ? <div className="text-sm text-slate-500">No printers are registered for envelope comparison.</div> : null}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card title="Inspector Evidence"><div className="text-sm text-slate-500">No inspection evidence exists for this revision yet.</div></Card>
      )}
    </div>
  );
}

function EnvelopePreview({ bounds }: { bounds?: { x: number; y: number; z: number } }) {
  if (!bounds) return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">No dimensional envelope available.</div>;
  const max = Math.max(bounds.x, bounds.y, bounds.z, 1);
  const dimensions = [["X", bounds.x], ["Y", bounds.y], ["Z", bounds.z]] as const;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#080d13] p-5">
      <div className="mb-4 text-xs uppercase tracking-[0.16em] text-slate-500">Measured Envelope Preview</div>
      <div className="space-y-4">
        {dimensions.map(([axis, value]) => (
          <div key={axis} className="grid grid-cols-[28px,minmax(0,1fr),90px] items-center gap-3">
            <div className="text-sm font-semibold text-amber-300">{axis}</div>
            <div className="h-5 rounded-md bg-white/5"><div className="h-full rounded-md bg-amber-500/40" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div>
            <div className="text-right font-mono text-xs text-slate-300">{value.toFixed(2)} mm</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-semibold text-slate-100">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 py-2 last:border-0"><div className="text-[10px] uppercase tracking-[0.15em] text-slate-600">{label}</div><div className="mt-1 break-words text-sm text-slate-300">{value}</div></div>;
}

function formatNumber(value?: number): string {
  return value === undefined ? "—" : value.toLocaleString();
}
