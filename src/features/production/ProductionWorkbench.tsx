import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { STANDARDIZATION_PROFILES, type StandardizationProfileId } from "../../workbench/productionProfiles";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ProductionWorkbench({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const assets = useMemo(() => [...runtime.assets].sort((a, b) => a.name.localeCompare(b.name)), [runtime.assets]);
  const [assetId, setAssetId] = useState("");
  const [profileId, setProfileId] = useState<StandardizationProfileId>("goblin-display-4in");
  const [customHeightIn, setCustomHeightIn] = useState("4.0");
  const selectedAssetId = assetId || assets[0]?.assetId || "";
  const selectedAsset = assets.find((asset) => asset.assetId === selectedAssetId);
  const profile = STANDARDIZATION_PROFILES.find((item) => item.id === profileId)!;
  const targetHeightMm = profileId === "custom" ? Math.max(0, Number(customHeightIn) || 0) * 25.4 : profile.targetHeightMm;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench · Production</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production Workbench</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">One operator flow for preparing an asset. Specialist stations remain available for diagnostics; routine handoffs belong here.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
        <Card title="Prepare Asset">
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
            <Button disabled title="Orchestration command is the next backend handoff">Prepare Model</Button>
          </div>
        </Card>

        <Card title="Production Status">
          <div className="space-y-3 text-sm leading-6 text-slate-400">
            <Info label="Asset" value={selectedAsset?.name || "No asset selected"} />
            <Info label="Flow" value="Source → Inspect → Standardize → Final check" />
            <Info label="Stop only for" value="Credits, exceptions, approval" />
            <Info label="Destination" value="Ready for Production" />
          </div>
        </Card>
      </div>

      <Card title="Shared Production Queue">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["Processing", "Safe automatic work in progress"],
            ["Needs Attention", "A maker decision is required"],
            ["Ready", "Prepared and waiting for production"],
            ["In Production", "Assigned to manufacturing"],
            ["Completed", "Production record finished"],
          ].map(([title, copy]) => <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-3"><div className="font-semibold text-slate-200">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{copy}</div></div>)}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">{value}</span></div>;
}
