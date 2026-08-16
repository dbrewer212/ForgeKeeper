import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { PRINTPAL_CREDIT_COSTS, type PrintPalQuality } from "../../lib/generationBudget";
import type { GenerationStatus, ProviderKey } from "../../lib/generationProviders";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchProviderGenerationService, type WorkbenchGenerationSubmission } from "../../workbench/providerGeneration";
import { intakeCompletedProviderAsset, type ProviderIntakeResult } from "../../workbench/providerIntake";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const qualityOptions = Object.keys(PRINTPAL_CREDIT_COSTS) as PrintPalQuality[];

export function ProviderGenerationStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const [assetId, setAssetId] = useState("");
  const [provider, setProvider] = useState<ProviderKey>("meshy");
  const [imagePath, setImagePath] = useState("");
  const [quality, setQuality] = useState<PrintPalQuality>("superplus");
  const [shouldTexture, setShouldTexture] = useState(false);
  const [targetPolycount, setTargetPolycount] = useState(100000);
  const [jobId, setJobId] = useState("");
  const [submission, setSubmission] = useState<WorkbenchGenerationSubmission | null>(null);
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [intakeResult, setIntakeResult] = useState<ProviderIntakeResult | null>(null);
  const [busy, setBusy] = useState<"submit" | "status" | "intake" | null>(null);
  const [message, setMessage] = useState("");

  const assets = useMemo(() => [...runtime.assets].sort((a, b) => a.name.localeCompare(b.name)), [runtime.assets]);
  const selectedAssetId = assetId || assets[0]?.assetId || "";
  const selectedAsset = assets.find((item) => item.assetId === selectedAssetId);
  const apiFilePath = state.settings.apiCredentialFilePath ?? "";
  const activeJobId = jobId.trim() || submission?.jobId || "";
  const expectedCredits = provider === "meshy" ? (shouldTexture ? 30 : 20) : PRINTPAL_CREDIT_COSTS[quality];

  async function submit() {
    if (!selectedAssetId) return setMessage("Select a Workbench asset first.");
    setBusy("submit");
    setMessage("");
    setStatus(null);
    setIntakeResult(null);
    try {
      const result = await getWorkbenchProviderGenerationService().submit({
        apiFilePath,
        assetId: selectedAssetId,
        provider,
        imagePath,
        printPalQuality: quality,
        meshyShouldTexture: shouldTexture,
        meshyTargetPolycount: targetPolycount,
      });
      setSubmission(result);
      setJobId(result.jobId);
      setMessage(`${provider === "meshy" ? "Meshy" : "PrintPal"} job ${result.jobId} submitted with a ${result.authorizedCredits}-credit authorization ceiling.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function checkStatus() {
    if (!activeJobId) return setMessage("Enter or submit a provider job ID first.");
    if (!selectedAssetId) return setMessage("Select the Workbench asset associated with this generation job.");
    setBusy("status");
    setMessage("");
    try {
      const result = await getWorkbenchProviderGenerationService().status(apiFilePath, selectedAssetId, provider, activeJobId);
      setStatus(result);
      setMessage(`${provider === "meshy" ? "Meshy" : "PrintPal"} reports ${result.status}${result.progress != null ? ` · ${result.progress}%` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function intake() {
    if (!activeJobId) return setMessage("Enter or submit a completed provider job ID first.");
    if (!selectedAssetId) return setMessage("Select the target Workbench asset.");
    setBusy("intake");
    setMessage("");
    setIntakeResult(null);
    try {
      const result = await intakeCompletedProviderAsset({
        apiFilePath,
        provider,
        jobId: activeJobId,
        assetId: selectedAssetId,
        format: "stl",
      });
      setIntakeResult(result);
      await runtime.refresh();
      setMessage(`Provider output is now Foundry-managed geometry on revision ${result.revisionId}; Inspector job ${result.inspectionJobId} is queued.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench · Controlled Adapter</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Provider Generation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Meshy and PrintPal are generation workers, not Foundry truth. Paid submissions are audited against the target asset. Completed geometry enters through the same SHA-256 Intake, managed-file ownership, revision, and Inspector path as every other manufacturing file.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
        <Card title="Generate Geometry">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target Foundry asset">
              <Select value={selectedAssetId} onChange={(event) => setAssetId(event.target.value)}>
                {assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.lifecycleStatus}</option>)}
              </Select>
            </Field>
            <Field label="Provider">
              <Select value={provider} onChange={(event) => { setProvider(event.target.value as ProviderKey); setStatus(null); setSubmission(null); }}>
                <option value="meshy">Meshy</option>
                <option value="printpal">PrintPal</option>
              </Select>
            </Field>
            <div className="md:col-span-2"><Field label="Source image path"><Input value={imagePath} onChange={(event) => setImagePath(event.target.value)} placeholder="C:\\Foundry\\Concepts\\reference.png" /></Field></div>

            {provider === "printpal" ? (
              <Field label="PrintPal quality">
                <Select value={quality} onChange={(event) => setQuality(event.target.value as PrintPalQuality)}>
                  {qualityOptions.map((item) => <option key={item} value={item}>{item} · {PRINTPAL_CREDIT_COSTS[item]} credits</option>)}
                </Select>
              </Field>
            ) : (
              <>
                <Field label="Target polycount"><Input type="number" min={1000} step={1000} value={targetPolycount} onChange={(event) => setTargetPolycount(Math.max(1000, Number(event.target.value) || 100000))} /></Field>
                <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                  <input type="checkbox" checked={shouldTexture} onChange={(event) => setShouldTexture(event.target.checked)} />
                  Request Meshy textures
                </label>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
            <div className="text-sm text-slate-400">Authorization ceiling: <span className="font-semibold text-amber-300">{expectedCredits} credits</span></div>
            <Button onClick={() => void submit()} disabled={busy !== null || !runtime.ready || !selectedAssetId || !imagePath.trim() || !apiFilePath.trim()}>{busy === "submit" ? "Submitting…" : "Authorize & Submit"}</Button>
          </div>
        </Card>

        <Card title="Provider Boundary">
          <div className="space-y-3 text-sm leading-6 text-slate-400">
            <Info label="Credential file" value={apiFilePath || "Not configured"} />
            <Info label="Target asset" value={selectedAsset?.name || "No asset"} />
            <Info label="Provider authority" value="Generate only" />
            <Info label="Manufacturing approval" value="Never automatic" />
            <Info label="Canon authority" value="None" />
          </div>
        </Card>
      </div>

      <Card title="Job Return & Controlled Intake">
        <div className="grid gap-4 lg:grid-cols-[180px,minmax(0,1fr),auto,auto]">
          <Select value={provider} onChange={(event) => setProvider(event.target.value as ProviderKey)}><option value="meshy">Meshy</option><option value="printpal">PrintPal</option></Select>
          <Input value={activeJobId} onChange={(event) => setJobId(event.target.value)} placeholder="Provider job ID" />
          <Button variant="ghost" onClick={() => void checkStatus()} disabled={busy !== null || !activeJobId || !apiFilePath.trim()}>{busy === "status" ? "Checking…" : "Check Status"}</Button>
          <Button onClick={() => void intake()} disabled={busy !== null || !activeJobId || !selectedAssetId || !apiFilePath.trim()}>{busy === "intake" ? "Intaking…" : "Intake Completed STL"}</Button>
        </div>

        {status ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Status" value={status.status} />
            <Metric label="Progress" value={status.progress == null ? "Unknown" : `${status.progress}%`} />
            <Metric label="Credits used" value={status.creditsUsed == null ? "Unknown" : String(status.creditsUsed)} />
            <Metric label="Outputs" value={Object.keys(status.outputUrls ?? {}).join(", ") || "Not available"} />
          </div>
        ) : null}

        {message ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{message}</div> : null}
        {intakeResult ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            Managed file <span className="font-mono">{intakeResult.fileId}</span> · revision <span className="font-mono">{intakeResult.revisionId}</span> · Inspector <span className="font-mono">{intakeResult.inspectionJobId}</span>. Provider staging was removed after verified Foundry ownership.
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>{children}</label>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 pb-3 last:border-0 last:pb-0"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 break-all text-slate-300">{value}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#0d131c] p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 break-all text-sm text-slate-200">{value}</div></div>;
}
