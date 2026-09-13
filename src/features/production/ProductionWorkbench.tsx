import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { ProviderGenerationStation } from "../design-library/ProviderGenerationStation";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchInspectorService } from "../../workbench/inspector";
import { STANDARDIZATION_PROFILES, type StandardizationProfileId } from "../../workbench/productionProfiles";
import { getWorkbenchStandardizationService } from "../../workbench/standardize";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ProductionWorkbench({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const assets = useMemo(() => [...runtime.assets].sort((a, b) => a.name.localeCompare(b.name)), [runtime.assets]);
  const [assetId, setAssetId] = useState("");
  const [profileId, setProfileId] = useState<StandardizationProfileId>("goblin-display-4in");
  const [customHeightIn, setCustomHeightIn] = useState("4.0");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedAssetId = assetId || assets[0]?.assetId || "";
  const selectedAsset = assets.find((asset) => asset.assetId === selectedAssetId);
  const profile = STANDARDIZATION_PROFILES.find((item) => item.id === profileId)!;
  const targetHeightMm = profileId === "custom" ? Math.max(0, Number(customHeightIn) || 0) * 25.4 : profile.targetHeightMm;

  async function standardize() {
    if (!selectedAssetId) return setMessage("Select a Foundry asset first.");
    if (!targetHeightMm) return setMessage("Original / No scaling preserves provider dimensions and does not create a derived revision.");
    setBusy(true);
    setMessage("");
    try {
      const result = await getWorkbenchStandardizationService().standardizeCurrentRevision({
        assetId: selectedAssetId,
        targetHeightMm,
        profileId,
        profileLabel: profile.label,
      });
      const inspected = await getWorkbenchInspectorService().inspectRevision(result.assetId, result.revisionId, state.printers);
      await runtime.refresh();
      const bounds = inspected.inspection.geometry.boundsMm;
      const boundsText = bounds ? `${bounds.x.toFixed(1)} × ${bounds.y.toFixed(1)} × ${bounds.z.toFixed(1)} mm` : "bounds unavailable";
      const errors = inspected.inspection.findings.filter((finding) => finding.severity === "error" || finding.severity === "critical").length;
      setMessage(`Standardized at ${(result.scaleFactor * 100).toFixed(2)}% to ${result.targetHeightMm.toFixed(1)} mm Z · ${boundsText}. Final Inspector completed with ${errors} blocking finding${errors === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench · Production</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production Workbench</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Generate, intake, prepare, inspect, and release from one operator station. Specialist stations remain available for diagnosis, but routine production no longer requires navigation between them.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
        <Card title="Production Standard">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Foundry asset">
              <Select value={selectedAssetId} onChange={(event) => setAssetId(event.target.value)}>
                {assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.lifecycleStatus}</option>)}
              </Select>
            </Field>
            <Field label="Standardization profile">
              <Select value={profileId} onChange={(event) => setProfileId(event.target.value as StandardizationProfileId)}>
                {STANDARDIZATION_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </Select>
            </Field>
            {profileId === "custom" ? <Field label="Custom height (inches)"><Input type="number" min="0.1" step="0.1" value={customHeightIn} onChange={(event) => setCustomHeightIn(event.target.value)} /></Field> : null}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Scale rule</div>
              <div className="mt-1">Uniform XYZ from model height (Z)</div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <div className="text-sm text-slate-400">Target: <span className="font-semibold text-amber-300">{targetHeightMm ? `${targetHeightMm.toFixed(1)} mm` : "Original provider size"}</span></div>
            <Button onClick={() => void standardize()} disabled={busy || !selectedAssetId || !targetHeightMm}>{busy ? "Standardizing…" : "Standardize & Inspect"}</Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">The source revision remains untouched. ForgeKeeper creates a new managed STL revision, uniformly scales XYZ from Z height, and immediately runs the final native Inspector. Final slicer scaling remains available exactly as before.</p>
          {message ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">{message}</div> : null}
        </Card>

        <Card title="Production Status">
          <div className="space-y-3 text-sm leading-6 text-slate-400">
            <Info label="Asset" value={selectedAsset?.name || "No asset selected"} />
            <Info label="Flow" value="Generate → Intake → Inspect → Standardize → Final check" />
            <Info label="Automatic work" value="Safe, non-destructive handoffs" />
            <Info label="Stop only for" value="Credits, exceptions, approval" />
            <Info label="Destination" value="Ready for Production" />
          </div>
        </Card>
      </div>

      <ProviderGenerationStation state={state} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">{value}</span></div>;
}
