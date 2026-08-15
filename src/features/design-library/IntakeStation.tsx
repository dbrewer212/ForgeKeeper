import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { AssetProvenance } from "../../workbench/contracts";
import { getWorkbenchIntakeService, type IntakeResult } from "../../workbench/intake";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const provenanceOptions: Array<{ value: AssetProvenance["sourceType"]; label: string }> = [
  { value: "manual", label: "Local / Manual" },
  { value: "meshy", label: "Meshy" },
  { value: "printpal", label: "PrintPal" },
  { value: "blender", label: "Blender" },
  { value: "cad", label: "CAD" },
  { value: "scanner", label: "Scanner" },
  { value: "download", label: "Downloaded / Purchased" },
  { value: "forgepack", label: "Forgepack" },
  { value: "other", label: "Other" },
];

export function IntakeStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const [assetId, setAssetId] = useState("");
  const [filePath, setFilePath] = useState("");
  const [sourceType, setSourceType] = useState<AssetProvenance["sourceType"]>("manual");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUri, setSourceUri] = useState("");
  const [creator, setCreator] = useState("");
  const [license, setLicense] = useState("");
  const [revisionLabel, setRevisionLabel] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntakeResult | null>(null);

  const sortedAssets = useMemo(() => [...runtime.assets].sort((a, b) => a.name.localeCompare(b.name)), [runtime.assets]);
  const selectedAssetId = assetId || sortedAssets[0]?.assetId || "";
  const selectedAsset = sortedAssets.find((item) => item.assetId === selectedAssetId);

  async function register() {
    if (!selectedAssetId) {
      setError("No Workbench asset is available. Create or migrate an asset before registering geometry.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const output = await getWorkbenchIntakeService().registerLocalFile({
        assetId: selectedAssetId,
        filePath,
        role: "geometry",
        provenance: {
          sourceType,
          sourceLabel: sourceLabel.trim() || provenanceOptions.find((item) => item.value === sourceType)?.label,
          sourceUri: sourceUri.trim() || undefined,
          creator: creator.trim() || undefined,
          license: license.trim() || undefined,
        },
        revisionLabel: revisionLabel.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setResult(output);
      await runtime.refresh();
      setRevisionLabel("");
      setReason("");
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
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Intake Station</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Controlled registration of physical-design files. Intake fingerprints the actual local file, reuses identical content by SHA-256, records provenance, creates a revision, and queues inspection without granting production or canon approval.
        </p>
      </div>

      {runtime.error ? <Card title="Workbench Runtime"><div className="text-sm text-rose-300">{runtime.error}</div></Card> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
        <Card title="Register Geometry">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target Foundry asset">
              <Select value={selectedAssetId} onChange={(event) => setAssetId(event.target.value)}>
                {sortedAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.lifecycleStatus}</option>)}
              </Select>
            </Field>
            <Field label="Source type">
              <Select value={sourceType} onChange={(event) => setSourceType(event.target.value as AssetProvenance["sourceType"])}>
                {provenanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Local file path">
                <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="C:\\Foundry\\Assets\\model.stl" />
              </Field>
            </div>
            <Field label="Source label"><Input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="Optional human-readable source" /></Field>
            <Field label="Source URI / external reference"><Input value={sourceUri} onChange={(event) => setSourceUri(event.target.value)} placeholder="Optional provider URL or reference" /></Field>
            <Field label="Creator"><Input value={creator} onChange={(event) => setCreator(event.target.value)} placeholder="Optional creator / author" /></Field>
            <Field label="License"><Input value={license} onChange={(event) => setLicense(event.target.value)} placeholder="Optional license / usage terms" /></Field>
            <Field label="Revision label"><Input value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} placeholder="Optional; generated if blank" /></Field>
            <div className="md:col-span-2">
              <Field label="Reason / change note"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-[90px]" placeholder="Why this file is being registered as a new revision" /></Field>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <div className="text-xs text-slate-500">Supported: STL, 3MF, OBJ, STEP/STP, GLB, GLTF. Intake does not auto-approve manufacturing or canon.</div>
            <Button onClick={() => void register()} disabled={busy || !runtime.ready || !selectedAssetId}>{busy ? "Inspecting & Registering…" : "Run Controlled Intake"}</Button>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}
          {result ? (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
              Intake complete. File <span className="font-mono">{result.fileId}</span> is attached to revision <span className="font-mono">{result.revisionId}</span>. {result.duplicateFileReused ? "Identical bytes were already known, so the existing FoundryFile identity was reused." : "A new SHA-256 FoundryFile identity was registered."} Inspector job <span className="font-mono">{result.inspectionJobId}</span> is queued.
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card title="Intake Target">
            {selectedAsset ? (
              <div className="space-y-3 text-sm">
                <Info label="Asset" value={selectedAsset.name} />
                <Info label="Asset ID" value={selectedAsset.assetId} />
                <Info label="Lifecycle" value={selectedAsset.lifecycleStatus} />
                <Info label="Current revision" value={selectedAsset.currentRevisionId || "None"} />
                <Info label="Provenance" value={selectedAsset.provenance.sourceLabel || selectedAsset.provenance.sourceType} />
              </div>
            ) : <div className="text-sm text-slate-500">No Workbench asset available.</div>}
          </Card>

          <Card title="Governance Boundary">
            <div className="space-y-3 text-sm leading-6 text-slate-400">
              <p>Registration proves which bytes the Foundry received and where they came from.</p>
              <p>The resulting revision is marked <span className="text-amber-300">inspection-required</span> and manufacturing approval resets to <span className="text-amber-300">not-reviewed</span>.</p>
              <p>Canon authority remains separate. Intake cannot silently redefine a character, collection, product, or approved production master.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 pb-3 last:border-0 last:pb-0"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 break-all text-slate-300">{value}</div></div>;
}
