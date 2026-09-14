import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchInspectorService } from "../../workbench/inspector";
import { getWorkbenchStorefrontScaleService } from "../../workbench/storefrontScale";
import {
  calculateUniformProfileScale,
  FOUNDRY_SCALE_PROFILES,
  getScaleProfile,
  type ScaleProfileId,
} from "../../workbench/storefrontScalePolicy";
import { invalidateWorkbenchRuntime, useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ModelWorkspaceView({
  state,
  onAddModel,
  onGenerate,
  onAdvanced,
}: {
  state: ForgekeeperState;
  onAddModel: () => void;
  onGenerate: () => void;
  onAdvanced: () => void;
}) {
  const runtime = useWorkbenchVault(state);
  const inspector = useMemo(() => getWorkbenchInspectorService(), []);
  const scaleService = useMemo(() => getWorkbenchStorefrontScaleService(), []);
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [profileId, setProfileId] = useState<ScaleProfileId>("foundry-goblin-display");
  const [busy, setBusy] = useState<"inspect" | "scale" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const masters = runtime.assets.filter((asset) => !asset.tags.some((tag) => tag.toLowerCase() === "derived-scale-profile"));
    if (!needle) return masters;
    return masters.filter((asset) => [asset.name, asset.assetType, asset.lifecycleStatus, ...asset.tags].join(" ").toLowerCase().includes(needle));
  }, [query, runtime.assets]);

  const selected = runtime.assets.find((asset) => asset.assetId === selectedAssetId)
    ?? filtered[0]
    ?? runtime.assets.find((asset) => !asset.tags.some((tag) => tag.toLowerCase() === "derived-scale-profile"));
  const revision = selected?.currentRevisionId
    ? runtime.workbench.revisions.find((item) => item.assetId === selected.assetId && item.revisionId === selected.currentRevisionId)
    : undefined;
  const inspections = revision
    ? runtime.workbench.inspections.filter((item) => item.assetId === selected?.assetId && item.revisionId === revision.revisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const latest = inspections[0];
  const profile = getScaleProfile(profileId);
  const projection = latest?.geometry.boundsMm ? calculateUniformProfileScale(latest.geometry.boundsMm, profile) : undefined;
  const derivedVariants = selected
    ? runtime.workbench.variants.filter((variant) => variant.parentAssetId === selected.assetId && variant.family === "foundry-scale-profile")
    : [];

  async function runInspection() {
    if (!selected || !revision) return;
    setBusy("inspect");
    setError("");
    setMessage("");
    try {
      const result = await inspector.inspectRevision(selected.assetId, revision.revisionId, state.printers);
      setMessage(`Inspection complete · ${formatBounds(result.inspection.geometry.boundsMm)}`);
      await runtime.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function prepareScaleProfile() {
    if (!selected || !revision) return;
    setBusy("scale");
    setError("");
    setMessage("");
    try {
      let currentInspection = latest;
      if (!currentInspection?.geometry.boundsMm) {
        currentInspection = (await inspector.inspectRevision(selected.assetId, revision.revisionId, state.printers)).inspection;
      }
      if (!currentInspection.geometry.boundsMm) throw new Error("Inspector did not return usable dimensions for this model.");
      const result = await scaleService.prepare(selected.assetId, profileId, state.printers);
      invalidateWorkbenchRuntime();
      await runtime.refresh();
      const verified = result.derivedInspection.geometry.boundsMm;
      setMessage(
        `${result.reusedExisting ? "Reused" : "Created"} ${result.generatedFile.fileName} · ${(result.nativeResult.scaleFactor * 100).toFixed(2)}% scale · verified ${formatBounds(verified)}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Design Library</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Model Workspace</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Select the model once. Inspect it, normalize it to a Foundry size profile, verify the derived STL, and review its current state without bouncing between Workbench stations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onAddModel}>Add / Import</Button>
            <Button variant="ghost" onClick={onGenerate}>Generate</Button>
            <Button variant="ghost" onClick={onAdvanced}>Advanced</Button>
          </div>
        </div>
      </div>

      {runtime.error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{runtime.error}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[330px,minmax(0,1fr)]">
        <Card title="Models" right={<span className="text-xs text-slate-500">{filtered.length}</span>}>
          <div className="space-y-3">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" />
            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map((asset) => {
                const active = asset.assetId === selected?.assetId;
                const currentRevision = runtime.workbench.revisions.find((item) => item.revisionId === asset.currentRevisionId);
                const hasInspection = currentRevision
                  ? runtime.workbench.inspections.some((item) => item.assetId === asset.assetId && item.revisionId === currentRevision.revisionId)
                  : false;
                return (
                  <button
                    type="button"
                    key={asset.assetId}
                    onClick={() => { setSelectedAssetId(asset.assetId); setMessage(""); setError(""); }}
                    className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-amber-500/35 bg-amber-500/10" : "border-white/10 bg-[#0b1119] hover:bg-white/5"}`}
                  >
                    <div className="font-semibold text-slate-100">{asset.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{asset.assetType} · {asset.lifecycleStatus}</div>
                    <div className={`mt-2 text-[11px] ${hasInspection ? "text-emerald-300" : "text-amber-300"}`}>{hasInspection ? "Inspected" : "Inspection needed"}</div>
                  </button>
                );
              })}
              {!filtered.length ? <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">No matching models.</div> : null}
            </div>
          </div>
        </Card>

        {!selected ? (
          <Card title="Model Workspace"><div className="text-sm text-slate-500">No Workbench model is registered yet. Use Add / Import to bring one in.</div></Card>
        ) : (
          <div className="space-y-5">
            <Card title={selected.name} right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{selected.lifecycleStatus}</span>}>
              <div className="grid gap-4 lg:grid-cols-4">
                <Metric label="Revision" value={revision?.revisionLabel ?? "None"} />
                <Metric label="Inspection" value={latest ? "Verified" : "Needed"} />
                <Metric label="Current size" value={latest?.geometry.boundsMm ? formatBounds(latest.geometry.boundsMm) : "Unknown"} />
                <Metric label="Scaled variants" value={String(derivedVariants.length)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void runInspection()} disabled={!revision || busy !== null}>{busy === "inspect" ? "Inspecting…" : latest ? "Reinspect Model" : "Inspect Model"}</Button>
                <Button variant="ghost" onClick={() => void runtime.refresh()}>Refresh</Button>
              </div>
            </Card>

            <Card title="Foundry Scale Profile" right={<span className="text-xs text-amber-300">Proportions preserved</span>}>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),300px]">
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Profile</span>
                    <Select value={profileId} onChange={(event) => setProfileId(event.target.value as ScaleProfileId)} className="w-full">
                      {FOUNDRY_SCALE_PROFILES.map((item) => <option key={item.profileId} value={item.profileId}>{item.label}</option>)}
                    </Select>
                  </label>
                  <div className="rounded-xl border border-white/10 bg-[#0b1119] p-4 text-sm leading-6 text-slate-400">
                    <div><span className="text-slate-500">Target:</span> {profile.targetAxis.toUpperCase()} = {profile.targetInches.toFixed(2)} in / {profile.targetDimensionMm.toFixed(1)} mm</div>
                    <div><span className="text-slate-500">Preserve proportions:</span> ON</div>
                    <div><span className="text-slate-500">Output:</span> {fileStem(selected.name)}_{profile.fileSuffix}.stl</div>
                    <div className="mt-2 text-xs text-slate-500">If this model has not been inspected yet, ForgeKeeper will inspect it automatically before scaling, then inspect the generated STL again afterward.</div>
                  </div>
                  <Button onClick={() => void prepareScaleProfile()} disabled={!revision || busy !== null}>
                    {busy === "scale" ? "Preparing…" : `Prepare ${profile.label}`}
                  </Button>
                </div>
                <div className="space-y-3">
                  <Metric label="Source axis" value={projection ? `${projection.sourceDimensionMm.toFixed(2)} mm` : latest ? "Unavailable" : "Auto-inspect on prepare"} />
                  <Metric label="Uniform scale" value={projection ? `${(projection.scaleFactor * 100).toFixed(2)}%` : "—"} />
                  <Metric label="Projected result" value={projection ? formatBounds(projection.scaledBoundsMm) : "—"} />
                </div>
              </div>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Inspection & Printer Fit">
                {latest ? (
                  <div className="space-y-3">
                    <Readout label="Geometry" value={`${latest.geometry.triangleCount?.toLocaleString() ?? "—"} triangles · ${latest.geometry.shellCount ?? "—"} shell(s) · ${latest.geometry.manifold === undefined ? "manifold unknown" : latest.geometry.manifold ? "manifold" : "not manifold"}`} />
                    {latest.machineCompatibility.map((compatibility) => {
                      const printer = state.printers.find((item) => item.id === compatibility.printerId);
                      return <Readout key={compatibility.printerId} label={printer?.name ?? compatibility.printerId} value={compatibility.compatible ? "Fits" : "Does not fit"} emphasis={compatibility.compatible ? "good" : "bad"} />;
                    })}
                  </div>
                ) : <div className="text-sm text-slate-500">No inspection evidence yet. Inspection now happens from this page.</div>}
              </Card>

              <Card title="Derived Models">
                <div className="space-y-3">
                  {derivedVariants.map((variant) => {
                    const asset = runtime.workbench.assets.find((item) => item.assetId === variant.assetId);
                    const scale = variant.transformationGraph.find((operation) => operation.type === "scale");
                    return (
                      <div key={variant.variantId} className="rounded-xl border border-white/10 bg-[#0b1119] p-3">
                        <div className="font-medium text-slate-200">{asset?.name ?? variant.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{String(scale?.parameters.profileLabel ?? scale?.parameters.profileId ?? "Scale profile")} · {variant.reviewRequired ? "Review required" : "Verified"}</div>
                      </div>
                    );
                  })}
                  {!derivedVariants.length ? <div className="text-sm text-slate-500">No scale-profile derivatives yet.</div> : null}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fileStem(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "Foundry_Model";
}

function formatBounds(bounds?: { x: number; y: number; z: number }): string {
  return bounds ? `${bounds.x.toFixed(1)} × ${bounds.y.toFixed(1)} × ${bounds.z.toFixed(1)} mm` : "Unavailable";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#0b1119] p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 text-sm font-semibold text-slate-200">{value}</div></div>;
}

function Readout({ label, value, emphasis }: { label: string; value: string; emphasis?: "good" | "bad" }) {
  const className = emphasis === "good" ? "text-emerald-300" : emphasis === "bad" ? "text-rose-300" : "text-slate-300";
  return <div className="rounded-xl border border-white/10 bg-[#0b1119] p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className={`mt-1 text-sm ${className}`}>{value}</div></div>;
}
