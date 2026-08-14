import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { productionReferenceReady, referenceChecksPassed } from "../../lib/productionReferences";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { ProductionReferenceChecks, ProductionReferenceRecord, ProductionReferenceView } from "../../types/domain";

const checkLabels: Array<{ key: keyof ProductionReferenceChecks; label: string }> = [
  { key: "oneSubject", label: "Exactly one subject is visible." },
  { key: "onePose", label: "Exactly one pose and one view are visible." },
  { key: "cleanBackground", label: "Background is clean, flat, and visually separable." },
  { key: "noTextOrBorders", label: "No text, labels, arrows, borders, or callouts remain." },
  { key: "noInsetsOrCollage", label: "No inset panels, turnarounds, collage tiles, or duplicate bodies remain." },
  { key: "noScaleFigure", label: "No scale figure, ruler, mug, hand, or comparison object remains." },
  { key: "noVariantLineup", label: "No alternate colors, realm variants, expressions, or hatchling lineup remains." },
  { key: "noLooseProps", label: "No loose prop or disconnected object can be mistaken for model geometry." },
  { key: "silhouetteReadable", label: "The intended silhouette and all required limbs/features are readable." },
  { key: "canonIdentityPreserved", label: "The isolated reference preserves the approved identity and intended pose." },
];

const views: ProductionReferenceView[] = ["Front", "Left", "Right", "Back", "Top", "Three-quarter"];

export function ProductionReferenceBuilder({ state, concept }: { state: ForgekeeperState; concept: ForgekeeperState["concepts"][number] }) {
  const references = state.productionReferences.filter((reference) => reference.conceptId === concept.id);
  const [selectedId, setSelectedId] = useState(concept.generationReferenceId ?? references[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selected = references.find((reference) => reference.id === selectedId) ?? references[0];
  const sourceAsset = state.libraryAssets.find((asset) => asset.id === selected?.sourceLibraryAssetId);
  const passedCount = selected ? Object.values(selected.checks).filter(Boolean).length : 0;
  const selectedIsPrimary = selected?.id === concept.generationReferenceId;
  const readiness = useMemo(() => productionReferenceReady(selected), [selected]);

  function update(patch: Partial<ProductionReferenceRecord>) {
    if (!selected) return;
    state.updateProductionReference(selected.id, patch);
    setMessage("");
  }

  function toggleCheck(key: keyof ProductionReferenceChecks) {
    if (!selected) return;
    update({ checks: { ...selected.checks, [key]: !selected.checks[key] } });
  }

  function markReady() {
    if (!selected) return;
    if (!selected.outputPath.trim() || !selected.subject.trim() || !selected.pose.trim()) {
      setMessage("Record the isolated output path, subject, and exact pose before verification.");
      return;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(selected.outputPath.trim())) {
      setMessage("The provider input must be a PNG, JPG, JPEG, or WebP image.");
      return;
    }
    if ([concept.imagePath, concept.imageName].filter(Boolean).some((path) => String(path).trim().toLowerCase() === selected.outputPath.trim().toLowerCase())) {
      setMessage("The isolated output must be a separate file. The full canonical concept image cannot be selected as provider input.");
      return;
    }
    if (!referenceChecksPassed(selected)) {
      setMessage(`Complete all ten isolation checks. ${passedCount}/10 currently pass.`);
      return;
    }
    if (!state.markProductionReferenceReady(selected.id)) {
      setMessage("The reference could not be marked Ready. Recheck its required fields.");
      return;
    }
    setMessage("Reference marked Ready and selected as the concept's generator source.");
  }

  return (
    <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">Production Reference Builder</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Prepare one isolated subject and pose from approved source material. Full concept sheets remain canon evidence and are never submitted directly.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected ? <span className={`rounded-full border px-3 py-2 text-xs ${readiness ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>{selected.status} · {passedCount}/10 checks</span> : null}
          <Button variant="ghost" onClick={() => state.addProductionReference(concept.id)}>New Reference</Button>
        </div>
      </div>

      {!selected ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Create a reference record to begin the isolation workflow.</div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr,1.2fr]">
            <div className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Reference revision</span><Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{references.map((reference) => <option key={reference.id} value={reference.id}>{reference.view} · {reference.status} · {reference.id}</option>)}</Select></label>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Approved source asset</span><Select value={selected.sourceLibraryAssetId ?? ""} onChange={(event) => update({ sourceLibraryAssetId: event.target.value || undefined })}><option value="">Decision/non-Library source</option>{state.libraryAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.status}</option>)}</Select></label>
              {sourceAsset ? <div className="break-all rounded-lg border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-slate-400">{sourceAsset.libraryPath}<div className="mt-1 text-slate-600">{sourceAsset.libraryFileId}</div></div> : null}
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Isolated output path</span><Input value={selected.outputPath} onChange={(event) => update({ outputPath: event.target.value })} placeholder="One-subject PNG/JPG prepared for the provider" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">View</span><Select value={selected.view} onChange={(event) => update({ view: event.target.value as ProductionReferenceView })}>{views.map((view) => <option key={view}>{view}</option>)}</Select></label>
                <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Background</span><Select value={selected.background} onChange={(event) => update({ background: event.target.value as ProductionReferenceRecord["background"] })}><option>Transparent</option><option>Neutral Light</option><option>Neutral Dark</option></Select></label>
              </div>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Single subject</span><Input value={selected.subject} onChange={(event) => update({ subject: event.target.value })} placeholder="Exact resident/product represented" /></label>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Exact pose</span><Input value={selected.pose} onChange={(event) => update({ pose: event.target.value })} placeholder="One frozen action and intended view" /></label>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Preparation notes</span><Textarea rows={3} value={selected.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Crop decisions, removed hazards, retained signature features…" /></label>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Isolation and canon preflight</div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">{checkLabels.map((check) => <label key={check.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm leading-5 ${selected.checks[check.key] ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" : "border-white/10 bg-white/[0.02] text-slate-300"}`}><input type="checkbox" checked={selected.checks[check.key]} onChange={() => toggleCheck(check.key)} className="mt-1" /><span>{check.label}</span></label>)}</div>
              <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">Ready means safe for exact provider submission. It does not approve the concept, likeness result, mesh, forgeability, or physical Print Trial.</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">{selectedIsPrimary ? "Selected generator source for this concept" : "Not currently selected for submission"}{selected.verifiedAt ? ` · Verified ${new Date(selected.verifiedAt).toLocaleString()}` : ""}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => state.removeProductionReference(selected.id)}>Remove</Button>
              {selected.status === "Ready" && !selectedIsPrimary ? <Button variant="ghost" onClick={() => state.setPrimaryProductionReference(concept.id, selected.id)}>Use for Submission</Button> : null}
              <Button onClick={markReady} disabled={readiness && selectedIsPrimary}>{readiness && selectedIsPrimary ? "Ready for Submission" : "Verify & Mark Ready"}</Button>
            </div>
          </div>
          {message ? <div className="mt-3 rounded-xl border border-white/10 bg-[#0d131c] p-3 text-sm text-slate-300">{message}</div> : null}
        </>
      )}
    </div>
  );
}
