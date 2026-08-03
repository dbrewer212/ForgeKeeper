import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { printTrialCanFail, printTrialCanPass, printTrialReadyToStart, productionEvidenceReady } from "../../lib/printTrials";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { MaterialDryState, PrintTrialCriterionResult, PrintTrialRecord } from "../../types/domain";

export function PrintTrialStation({ state, concept }: { state: ForgekeeperState; concept: ForgekeeperState["concepts"][number] }) {
  const verifications = state.modelVerifications.filter((item) => item.conceptId === concept.id);
  const trials = state.printTrials.filter((item) => item.conceptId === concept.id);
  const [selectedId, setSelectedId] = useState(trials[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selected = trials.find((item) => item.id === selectedId) ?? trials[0];
  const verification = verifications.find((item) => item.id === selected?.modelVerificationId);
  const evidenceReady = productionEvidenceReady(verification, selected);

  function update(patch: Partial<PrintTrialRecord>) {
    if (!selected) return;
    state.updatePrintTrial(selected.id, patch);
    setMessage("");
  }

  function create(modelVerificationId: string) {
    const id = state.addPrintTrial(modelVerificationId);
    if (id) setSelectedId(id);
  }

  function setStatus(status: PrintTrialRecord["status"]) {
    if (!selected) return;
    if ((status === "Passed" || status === "Failed") && !window.confirm(`Record this physical Print Trial as ${status}? This confirms that Derek supplied or verified the recorded outcome and evidence.`)) return;
    if (!state.setPrintTrialStatus(selected.id, status)) {
      setMessage(status === "In Progress"
        ? "Starting requires a model revision matching its verification, printer/nozzle, material dry state, slicer/profile revision, orientation, supports, explicit part/assembly routes, slicer estimates, a controlled variable, and pass criteria."
        : status === "Passed"
          ? "Passing requires all criteria to pass with observations, actual time/material and cleanup/assembly results, physical evidence paths, and Derek verification."
          : "Failure requires a failed criterion, observed failure mode, evidence path, correction action, and Derek verification.");
      return;
    }
    setMessage(`Physical Print Trial recorded as ${status}.`);
  }

  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">Production & Print-Trial Station</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Plan and record a controlled physical trial against one exact model revision. Slicer estimates guide the trial; only the observed print establishes the physical result.</div>
        </div>
        {selected ? <div className="flex flex-wrap gap-2 text-xs"><Pill label={`Trial · ${selected.status}`} /><Pill label={`Model · ${selected.modelRevision}`} /><Pill label={evidenceReady ? "Production evidence · Ready" : "Production evidence · Incomplete"} /></div> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {verifications.map((record) => <Button key={record.id} variant="ghost" onClick={() => create(record.id)}>New Trial · {record.modelRevision}</Button>)}
        {!verifications.length ? <span className="text-sm text-slate-500">Create a Model Verification record before planning a physical trial.</span> : null}
      </div>

      {selected ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <Label text="Trial record"><Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{trials.map((trial) => <option key={trial.id} value={trial.id}>{trial.modelRevision} · {trial.status} · {trial.id}</option>)}</Select></Label>
              <Label text="Model verification"><Select value={selected.modelVerificationId} disabled>{verifications.map((record) => <option key={record.id} value={record.id}>{record.modelRevision} · {record.id}</option>)}</Select></Label>
              <Label text="Exact model path"><Input value={selected.modelPath} onChange={(event) => update({ modelPath: event.target.value })} /></Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label text="Model revision"><Input value={selected.modelRevision} onChange={(event) => update({ modelRevision: event.target.value })} /></Label>
                <Label text="Model SHA-256"><Input value={selected.modelSha256} onChange={(event) => update({ modelSha256: event.target.value.trim() })} placeholder="64-character fingerprint" /></Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label text="Printer"><Select value={selected.printerId} onChange={(event) => update({ printerId: event.target.value })}><option value="">Select printer</option>{state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.buildVolume}</option>)}</Select></Label>
                <Label text="Nozzle diameter (mm)"><Input type="number" min="0.1" step="0.05" value={selected.nozzleDiameterMm} onChange={(event) => update({ nozzleDiameterMm: Number(event.target.value) })} /></Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Label text="Filament inventory"><Select value={selected.filamentId ?? ""} onChange={(event) => { const filament = state.filament.find((item) => item.id === event.target.value); update({ filamentId: event.target.value || undefined, materialName: filament ? `${filament.brand} ${filament.material} · ${filament.colorName}` : selected.materialName }); }}><option value="">Unlinked material</option>{state.filament.map((item) => <option key={item.id} value={item.id}>{item.brand} {item.material} · {item.colorName}</option>)}</Select></Label>
                <Label text="Material / batch"><Input value={selected.materialName} onChange={(event) => update({ materialName: event.target.value })} placeholder="Exact material and batch/spool" /></Label>
                <Label text="Material dry state"><Select value={selected.materialDryState} onChange={(event) => update({ materialDryState: event.target.value as MaterialDryState })}>{["Unknown", "Dry", "Dried for Trial", "Not Dried"].map((item) => <option key={item}>{item}</option>)}</Select></Label>
                <Label text="Slicer"><Input value={selected.slicer} onChange={(event) => update({ slicer: event.target.value })} placeholder="OrcaSlicer" /></Label>
                <Label text="Slicer version"><Input value={selected.slicerVersion} onChange={(event) => update({ slicerVersion: event.target.value })} /></Label>
                <Label text="Profile name"><Input value={selected.profileName} onChange={(event) => update({ profileName: event.target.value })} /></Label>
                <Label text="Profile revision"><Input value={selected.profileRevision} onChange={(event) => update({ profileRevision: event.target.value })} placeholder="v001 or dated revision" /></Label>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <Label text="Orientation"><Textarea rows={3} value={selected.orientation} onChange={(event) => update({ orientation: event.target.value })} placeholder="Bed face, rotation, critical surfaces, and why" /></Label>
              <Label text="Supports"><Textarea rows={3} value={selected.supports} onChange={(event) => update({ supports: event.target.value })} placeholder="Type, interface, blockers, critical support areas, or explicitly none" /></Label>
              <Label text="Part division"><Textarea rows={2} value={selected.partDivision} onChange={(event) => update({ partDivision: event.target.value })} placeholder="Parts printed separately or single-piece route" /></Label>
              <Label text="Assembly method"><Textarea rows={2} value={selected.assemblyMethod} onChange={(event) => update({ assemblyMethod: event.target.value })} placeholder="Pins, adhesive, magnets, screws, press fit, or none" /></Label>
              <ArrayField label="Controlled variables" values={selected.controlledVariables} onChange={(controlledVariables) => update({ controlledVariables })} placeholder="One controlled setting or comparison variable per line" />
              <div className={`rounded-xl border p-3 text-xs ${printTrialReadyToStart(selected) ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-amber-500/20 bg-amber-500/5 text-amber-300"}`}>{printTrialReadyToStart(selected) ? "Trial setup contains the required route and may begin." : "Trial remains a draft until the exact production route is complete."}</div>
            </section>
          </div>

          <section className="rounded-xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Observable pass criteria</div>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">{selected.criteria.map((criterion) => (
              <div key={criterion.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="text-sm text-slate-200">{criterion.label}</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[140px,1fr]">
                  <Select value={criterion.result} onChange={(event) => update({ criteria: selected.criteria.map((item) => item.id === criterion.id ? { ...item, result: event.target.value as PrintTrialCriterionResult } : item) })}><option>Pending</option><option>Pass</option><option>Fail</option></Select>
                  <Input value={criterion.observation} onChange={(event) => update({ criteria: selected.criteria.map((item) => item.id === criterion.id ? { ...item, observation: event.target.value } : item) })} placeholder="Measured or observed result" />
                </div>
              </div>
            ))}</div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Estimate versus actual</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <NumberField label="Estimated hours" value={selected.estimatedTimeHours} onChange={(value) => update({ estimatedTimeHours: value })} />
                <NumberField label="Actual hours" value={selected.actualTimeHours} onChange={(value) => update({ actualTimeHours: value })} />
                <NumberField label="Estimated grams" value={selected.estimatedMaterialGrams} onChange={(value) => update({ estimatedMaterialGrams: value })} />
                <NumberField label="Actual grams" value={selected.actualMaterialGrams} onChange={(value) => update({ actualMaterialGrams: value })} />
                <NumberField label="Cleanup minutes" value={selected.cleanupMinutes} onChange={(value) => update({ cleanupMinutes: value })} />
                <NumberField label="Assembly minutes" value={selected.assemblyMinutes} onChange={(value) => update({ assemblyMinutes: value })} />
              </div>
              <Label text="Dimensional / fit result"><Textarea rows={2} value={selected.dimensionalResults} onChange={(event) => update({ dimensionalResults: event.target.value })} /></Label>
              <Label text="Surface result"><Textarea rows={2} value={selected.surfaceResult} onChange={(event) => update({ surfaceResult: event.target.value })} /></Label>
              <Label text="Support removal result"><Textarea rows={2} value={selected.supportRemovalResult} onChange={(event) => update({ supportRemovalResult: event.target.value })} /></Label>
            </section>

            <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <ArrayField label="Physical evidence paths" values={selected.evidencePaths} onChange={(evidencePaths) => update({ evidencePaths })} placeholder="Photo, measurement, slicer project, or trial document path per line" />
              <Label text="Observed failure mode"><Textarea rows={2} value={selected.failureMode} onChange={(event) => update({ failureMode: event.target.value })} placeholder="Required for a Failed outcome" /></Label>
              <Label text="Next correction or approval action"><Textarea rows={2} value={selected.nextAction} onChange={(event) => update({ nextAction: event.target.value })} /></Label>
              <Label text="Trial notes"><Textarea rows={3} value={selected.notes} onChange={(event) => update({ notes: event.target.value })} /></Label>
              <label className="flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-sm text-amber-100"><input type="checkbox" checked={selected.outcomeVerifiedByDerek} onChange={(event) => update({ outcomeVerifiedByDerek: event.target.checked, outcomeVerifiedAt: undefined })} className="mt-1 h-4 w-4 accent-amber-500" /><span>Derek supplied or physically verified this outcome. This does not approve production by itself.</span></label>
            </section>
          </div>

          <section className="rounded-xl border border-white/10 bg-[#0d131c] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-xs uppercase tracking-wide text-slate-500">Physical decision</div><div className="mt-1 text-xs text-slate-400">A passed trial applies only to this exact model and setup. Production approval still requires matching visual and forgeability gates.</div></div>
              <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setStatus("Not Started")}>Reset Draft</Button><Button variant="ghost" onClick={() => setStatus("In Progress")} disabled={!printTrialReadyToStart(selected)}>Start Trial</Button><Button variant="danger" onClick={() => setStatus("Failed")} disabled={!printTrialCanFail(selected)}>Record Failed</Button><Button onClick={() => setStatus("Passed")} disabled={!printTrialCanPass(selected)}>Record Passed</Button></div>
            </div>
            {evidenceReady ? <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">This exact model now has matching visual acceptance, forgeability approval, and a passed physical trial. It is eligible for the later Production Approval gate; no product status was changed automatically.</div> : null}
            {message ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-300">{message}</div> : null}
          </section>

          <div className="flex justify-end"><Button variant="danger" onClick={() => { if (window.confirm("Delete this Print Trial record?")) state.removePrintTrial(selected.id); }}>Delete Trial</Button></div>
        </div>
      ) : null}
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">{text}</span>{children}</label>; }
function Pill({ label }: { label: string }) { return <span className="rounded-full border border-white/10 bg-[#0d131c] px-3 py-2 text-slate-300">{label}</span>; }
function ArrayField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string }) { return <Label text={label}><Textarea rows={3} value={values.join("\n")} onChange={(event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} placeholder={placeholder} /></Label>; }
function NumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) { return <Label text={label}><Input type="number" min="0" step="0.1" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></Label>; }
