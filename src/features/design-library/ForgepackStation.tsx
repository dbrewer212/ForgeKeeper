import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchService } from "../../workbench/service";
import { getWorkbenchStorefrontScaleService } from "../../workbench/storefrontScale";
import {
  calculateUniformProfileScale,
  FOUNDRY_SCALE_PROFILES,
  getScaleProfile,
  type ScaleProfileId,
} from "../../workbench/storefrontScalePolicy";
import { invalidateWorkbenchRuntime, useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ForgepackStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const service = useMemo(() => getWorkbenchService(), []);
  const storefrontService = useMemo(() => getWorkbenchStorefrontScaleService(), []);
  const [assetId, setAssetId] = useState("");
  const [outputName, setOutputName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [scaleProfileId, setScaleProfileId] = useState<ScaleProfileId>("foundry-goblin-display");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedAssetId = assetId || runtime.assets[0]?.assetId || "";
  const selectedAsset = runtime.assets.find((asset) => asset.assetId === selectedAssetId);
  const revisionCount = selectedAsset
    ? runtime.workbench.revisions.filter((revision) => revision.assetId === selectedAsset.assetId).length
    : 0;
  const managedFileCount = selectedAsset
    ? new Set(
        runtime.workbench.revisions
          .filter((revision) => revision.assetId === selectedAsset.assetId)
          .flatMap((revision) => [...revision.sourceFileIds, ...revision.outputFileIds]),
      ).size
    : 0;
  const currentRevisionId = selectedAsset?.currentRevisionId ?? "";
  const scaleInspection = useMemo(() => runtime.workbench.inspections
    .filter((inspection) => inspection.assetId === selectedAssetId && inspection.revisionId === currentRevisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  [currentRevisionId, runtime.workbench.inspections, selectedAssetId]);
  const scaleProfile = getScaleProfile(scaleProfileId);
  const scaleProjection = scaleInspection?.geometry.boundsMm
    ? calculateUniformProfileScale(scaleInspection.geometry.boundsMm, scaleProfile)
    : undefined;
  const existingDerivative = selectedAsset && currentRevisionId
    ? runtime.workbench.variants.find((variant) => variant.family === "foundry-scale-profile"
      && variant.parentAssetId === selectedAsset.assetId
      && variant.parentRevisionId === currentRevisionId
      && variant.transformationGraph.some((operation) => operation.type === "scale" && operation.parameters.profileId === scaleProfile.profileId))
    : undefined;
  const isScaleDerivative = selectedAsset?.tags.some((tag) => tag.toLowerCase() === "derived-scale-profile") ?? false;

  function selectAsset(nextAssetId: string) {
    setAssetId(nextAssetId);
    const asset = runtime.assets.find((item) => item.assetId === nextAssetId);
    const language = `${asset?.name ?? ""} ${(asset?.tags ?? []).join(" ")}`.toLowerCase();
    if (language.includes("wyrm")) setScaleProfileId("wyrm-display-3_0in");
    else if (language.includes("goblin")) setScaleProfileId("foundry-goblin-display");
  }

  async function prepareScaledModel() {
    if (!selectedAssetId) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await storefrontService.prepare(selectedAssetId, scaleProfile.profileId, state.printers);
      invalidateWorkbenchRuntime();
      await runtime.refresh();
      const bounds = result.derivedInspection.geometry.boundsMm;
      const target = bounds ? bounds[result.profile.targetAxis] : undefined;
      const blocking = result.derivedInspection.findings.filter((finding) => finding.severity === "critical" || finding.severity === "error").length;
      setMessage(result.reusedExisting
        ? `${result.profile.label} already exists for this exact master revision; Forgekeeper reused the derivative and verified its inspection record.`
        : `${result.generatedFile.fileName} created at ${(result.nativeResult.scaleFactor * 100).toFixed(2)}%. Re-inspection measured ${result.profile.targetAxis.toUpperCase()} ${target?.toFixed(2) ?? "—"} mm with ${blocking} blocking geometry finding${blocking === 1 ? "" : "s"}. The master was not changed.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function exportPacket() {
    if (!selectedAssetId) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await service.exportForgepack(selectedAssetId, { outputName: outputName.trim() || undefined });
      setMessage(`Forgepack exported to ${result.outputPath}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function importPacket() {
    const path = importPath.trim();
    if (!path) {
      setError("Enter the local .forgepack path to import.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await service.importForgepack(path);
      invalidateWorkbenchRuntime();
      await runtime.refresh();
      setMessage(`Forgepack imported with ${result.assetIds.length} asset record${result.assetIds.length === 1 ? "" : "s"}. Existing identities were reused only when records matched exactly.`);
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
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Forgepack Portability</h1>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400">
          Portable Workbench asset graphs with checksum-verified managed files. Forgepack transports Foundry records; it does not become a second live database and cannot silently overwrite conflicting Foundry identities.
        </p>
      </div>

      {runtime.error ? <Card title="Workbench Runtime"><div className="text-sm text-rose-300">{runtime.error}</div></Card> : null}
      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-300">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{message}</div> : null}

      <Card title="Foundry Scale Profiles" right={<span className="text-xs text-amber-300">{scaleProfile.label}</span>}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr),minmax(300px,0.8fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-6 text-slate-300">
              Scale profiles create a <strong className="text-amber-200">derived STL</strong> from the exact inspected master revision. The selected profile targets one real-world axis, preserves proportions by applying the same factor to X/Y/Z, then sends the generated STL back through Inspector before it can move downstream.
            </div>
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Master asset</div>
              <select
                value={selectedAssetId}
                onChange={(event) => selectAsset(event.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-[#0b1119] px-3 text-sm text-slate-200"
              >
                {runtime.assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.assetType}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Scale profile</div>
              <select
                value={scaleProfileId}
                onChange={(event) => setScaleProfileId(event.target.value as ScaleProfileId)}
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-[#0b1119] px-3 text-sm text-slate-200"
              >
                {FOUNDRY_SCALE_PROFILES.map((profile) => (
                  <option key={profile.profileId} value={profile.profileId}>{profile.label}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Target" value={`${scaleProfile.targetAxis.toUpperCase()} = ${scaleProfile.targetInches.toFixed(2)} in / ${scaleProfile.targetDimensionMm.toFixed(1)} mm`} />
              <Metric label="Preserve proportions" value={scaleProfile.preserveProportions ? "ON" : "OFF"} />
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0b1119] p-4 text-sm leading-6 text-slate-400">
              {scaleProfile.purpose} Tabletop profiles will use this same registry once Small / Medium / Large dimensions are locked; no new scaling engine is required.
            </div>
            {!scaleInspection ? <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm text-amber-200">Run Inspector on this exact master revision first. Forgekeeper needs measured bounds before a profile can be applied.</div> : null}
            {isScaleDerivative ? <div className="text-sm text-rose-300">This is already a scaled derivative. Select the canonical/master asset so derivatives never get recursively resized.</div> : null}
            {existingDerivative ? <div className="text-sm text-emerald-300">This profile already exists for the exact master revision. Preparing again reuses the derivative rather than creating another copy.</div> : null}
            <Button onClick={() => void prepareScaledModel()} disabled={busy || !scaleProjection || isScaleDerivative}>
              {busy ? "Working…" : existingDerivative ? `Reuse ${scaleProfile.label}` : `Prepare ${scaleProfile.label} STL`}
            </Button>
          </div>

          <div className="space-y-3">
            <Metric label="Master bounds" value={scaleInspection?.geometry.boundsMm ? formatBounds(scaleInspection.geometry.boundsMm) : "Inspector required"} />
            <Metric label={`Master ${scaleProfile.targetAxis.toUpperCase()}`} value={scaleProjection ? `${scaleProjection.sourceDimensionMm.toFixed(2)} mm` : "—"} />
            <Metric label="Projected bounds" value={scaleProjection ? formatBounds(scaleProjection.scaledBoundsMm) : "—"} />
            <Metric label="Uniform scale" value={scaleProjection ? `${(scaleProjection.scaleFactor * 100).toFixed(2)}%` : "—"} />
            <Metric label="Output name" value={selectedAsset ? `${fileStemPreview(selectedAsset.name)}_${scaleProfile.fileSuffix}.stl` : "—"} />
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
              Example: a 1282.64 mm-tall goblin under Foundry Goblin — Display uses 101.6 / 1282.64 ≈ 0.0792. Forgekeeper applies ≈7.92% uniformly to X, Y and Z, then re-inspects the written STL for measured dimensions, printer compatibility and geometry integrity.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Export Asset Graph">
          <div className="space-y-4">
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Root asset</div>
              <div className="rounded-xl border border-white/10 bg-[#0b1119] px-3 py-3 text-sm text-slate-200">{selectedAsset?.name ?? "No asset selected"}</div>
            </label>
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Optional packet name</div>
              <Input value={outputName} onChange={(event) => setOutputName(event.target.value)} placeholder="Defaults to asset name + date" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Revisions" value={revisionCount} />
              <Metric label="Root files" value={managedFileCount} />
              <Metric label="Lifecycle" value={selectedAsset?.lifecycleStatus ?? "—"} />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
              Export automatically includes controlled variant descendants, assembly components, exact revisions, relationships inside the packet graph, manufacturing specifications, inspections, preparations, print evidence, and every referenced Foundry-managed file.
            </div>
            <Button onClick={() => void exportPacket()} disabled={busy || !selectedAssetId}>{busy ? "Working…" : "Export .forgepack"}</Button>
          </div>
        </Card>

        <Card title="Import Forgepack">
          <div className="space-y-4">
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Local packet path</div>
              <Input value={importPath} onChange={(event) => setImportPath(event.target.value)} placeholder="C:\\...\\asset.forgepack" />
            </label>
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-slate-400">
              Import verifies archive paths, limits, declarations and SHA-256 before any record is admitted. Files are placed into the content-addressed managed store. A matching identity is idempotent; a conflicting identity blocks the import for human resolution.
            </div>
            <Button onClick={() => void importPacket()} disabled={busy || !importPath.trim()}>{busy ? "Working…" : "Verify & Import"}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function fileStemPreview(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "Foundry_Model";
}

function formatBounds(bounds: { x: number; y: number; z: number }): string {
  return `${bounds.x.toFixed(1)} × ${bounds.y.toFixed(1)} × ${bounds.z.toFixed(1)} mm`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1119] p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-600">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-slate-200">{value}</div>
    </div>
  );
}
