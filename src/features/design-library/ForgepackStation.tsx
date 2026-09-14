import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchService } from "../../workbench/service";
import { getWorkbenchStorefrontScaleService } from "../../workbench/storefrontScale";
import {
  calculateUniformStorefrontScale,
  recommendStorefrontScale,
  type StorefrontScaleTier,
} from "../../workbench/storefrontScalePolicy";
import { invalidateWorkbenchRuntime, useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ForgepackStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const service = useMemo(() => getWorkbenchService(), []);
  const storefrontService = useMemo(() => getWorkbenchStorefrontScaleService(), []);
  const [assetId, setAssetId] = useState("");
  const [outputName, setOutputName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [storefrontTier, setStorefrontTier] = useState<"auto" | "3" | "4" | "5">("auto");
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
  const storefrontInspection = useMemo(() => runtime.workbench.inspections
    .filter((inspection) => inspection.assetId === selectedAssetId && inspection.revisionId === currentRevisionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
  [currentRevisionId, runtime.workbench.inspections, selectedAssetId]);
  const storefrontRecommendation = selectedAsset && storefrontInspection
    ? recommendStorefrontScale(selectedAsset, storefrontInspection)
    : undefined;
  const appliedTier = (storefrontTier === "auto"
    ? storefrontRecommendation?.targetInches
    : Number(storefrontTier)) as StorefrontScaleTier | undefined;
  const storefrontProjection = storefrontInspection?.geometry.boundsMm && appliedTier
    ? calculateUniformStorefrontScale(storefrontInspection.geometry.boundsMm, appliedTier)
    : undefined;
  const existingStorefront = selectedAsset && currentRevisionId && appliedTier
    ? runtime.workbench.variants.find((variant) => variant.family === "thangs-storefront"
      && variant.parentAssetId === selectedAsset.assetId
      && variant.parentRevisionId === currentRevisionId
      && variant.transformationGraph.some((operation) => operation.type === "scale" && Number(operation.parameters.targetInches) === appliedTier))
    : undefined;
  const isStorefrontDerivative = selectedAsset?.tags.some((tag) => tag.toLowerCase() === "digital-storefront") ?? false;

  async function prepareStorefrontModel() {
    if (!selectedAssetId || !appliedTier) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await storefrontService.prepare(selectedAssetId, storefrontTier === "auto" ? undefined : appliedTier);
      invalidateWorkbenchRuntime();
      await runtime.refresh();
      setMessage(result.reusedExisting
        ? `${result.appliedTier}-inch storefront model already exists for this exact master revision; Forgekeeper reused it instead of creating a duplicate.`
        : `${result.appliedTier}-inch storefront STL prepared at ${(result.nativeResult.scaleFactor * 100).toFixed(2)}% of the master geometry. The master was not changed.`);
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

      <Card title="Digital Storefront Scale" right={storefrontRecommendation ? <span className="text-xs text-amber-300">Auto: {storefrontRecommendation.targetInches}&quot;</span> : undefined}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr),minmax(300px,0.8fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-6 text-slate-300">
              This creates a <strong className="text-amber-200">derived digital-download STL</strong> for the Thangs/storefront path. The canonical model is never resized or overwritten. Physical-product sizing remains a separate manufacturing decision.
            </div>
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Master asset</div>
              <select
                value={selectedAssetId}
                onChange={(event) => { setAssetId(event.target.value); setStorefrontTier("auto"); }}
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-[#0b1119] px-3 text-sm text-slate-200"
              >
                {runtime.assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.name} · {asset.assetType}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Storefront size tier</div>
              <select
                value={storefrontTier}
                onChange={(event) => setStorefrontTier(event.target.value as "auto" | "3" | "4" | "5")}
                className="min-h-[44px] w-full rounded-xl border border-white/10 bg-[#0b1119] px-3 text-sm text-slate-200"
              >
                <option value="auto">Auto · detail-aware 3–5 inch recommendation</option>
                <option value="3">3 inches · compact/simple model</option>
                <option value="4">4 inches · standard/detail model</option>
                <option value="5">5 inches · showcase/high-detail model</option>
              </select>
            </label>
            {storefrontRecommendation ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-[#0b1119] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Why Forgekeeper chose {storefrontRecommendation.targetInches}&quot;</div>
                {storefrontRecommendation.reasons.map((reason) => <div key={reason} className="text-sm text-slate-400">• {reason}</div>)}
              </div>
            ) : <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm text-amber-200">Run Inspector on this exact master revision first. Forgekeeper needs real geometry bounds and complexity evidence before it can scale safely.</div>}
            {isStorefrontDerivative ? <div className="text-sm text-rose-300">This is already a storefront derivative. Select the canonical/master asset so derivatives never get recursively resized.</div> : null}
            {existingStorefront ? <div className="text-sm text-emerald-300">A {appliedTier}&quot; storefront derivative already exists for this exact master revision. Preparing again will reuse it.</div> : null}
            <Button onClick={() => void prepareStorefrontModel()} disabled={busy || !storefrontProjection || isStorefrontDerivative}>
              {busy ? "Working…" : existingStorefront ? `Reuse ${appliedTier}\" Storefront Model` : `Prepare ${appliedTier ?? ""}\" Storefront STL`}
            </Button>
          </div>

          <div className="space-y-3">
            <Metric label="Master bounds" value={storefrontInspection?.geometry.boundsMm ? formatBounds(storefrontInspection.geometry.boundsMm) : "Inspector required"} />
            <Metric label="Target envelope" value={storefrontProjection ? `${storefrontProjection.targetInches}\" · ${storefrontProjection.targetMaxMm.toFixed(1)} mm max` : "—"} />
            <Metric label="Projected bounds" value={storefrontProjection ? formatBounds(storefrontProjection.scaledBoundsMm) : "—"} />
            <Metric label="Uniform scale" value={storefrontProjection ? `${(storefrontProjection.scaleFactor * 100).toFixed(2)}%` : "—"} />
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
              The longest X/Y/Z dimension becomes the selected tier: 3&quot; = 76.2 mm, 4&quot; = 101.6 mm, 5&quot; = 127 mm. Every axis uses the same factor, so proportions are preserved.
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
