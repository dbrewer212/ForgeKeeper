import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { canApproveForgeability, checksAllPass, requiredInspectionViews, requiredViewsPresent, updateVerificationCheck } from "../../lib/modelVerification";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { AssessmentResult, EvidenceClass, ForgeabilityStatus, InspectionView, ModelVerificationRecord, VerificationCheck, VisualReviewDecision } from "../../types/domain";

const allInspectionViews: InspectionView[] = [...requiredInspectionViews, "Components"];
const evidenceClasses: EvidenceClass[] = ["Concept only", "Mesh available", "Sliced", "Physical trial", "Production evidence"];

export function ModelVerificationStation({ state, concept }: { state: ForgekeeperState; concept: ForgekeeperState["concepts"][number] }) {
  const jobs = state.generationJobs.filter((job) => job.conceptId === concept.id);
  const records = state.modelVerifications.filter((verification) => verification.conceptId === concept.id);
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const canon = state.canonRecords.find((record) => record.id === selected?.canonRecordId);

  function update(patch: Partial<ModelVerificationRecord>) {
    if (!selected) return;
    state.updateModelVerification(selected.id, patch);
    setMessage("");
  }

  function create(jobId: string) {
    const id = state.addModelVerification(jobId);
    if (id) setSelectedId(id);
  }

  function setVisualDecision(decision: VisualReviewDecision) {
    if (!selected) return;
    if (!state.setModelVisualDecision(selected.id, decision)) {
      setMessage("Visual acceptance requires all ten likeness checks to pass and Front, Left, Right, Back, Top, Three-quarter, and Silhouette views to be linked.");
      return;
    }
    setMessage(`Visual decision recorded as ${decision}. Mesh and physical gates remain separate.`);
  }

  function setForgeability(status: ForgeabilityStatus) {
    if (!selected) return;
    if (!state.setModelForgeabilityStatus(selected.id, status)) {
      setMessage("Forgeability approval requires actual mesh evidence, a model path, a 64-character SHA-256 checksum, and every mesh-integrity check passing.");
      return;
    }
    setMessage(`Forgeability status recorded as ${status}. Physical Print Trial remains ${selected.physicalTestStatus}.`);
  }

  return (
    <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="font-semibold text-slate-100">Model Verification Station</div><div className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Compare a returned model against canon and inspect actual mesh evidence without confusing visual acceptance, forgeability, or a physical Print Trial.</div></div>
        {selected ? <div className="flex flex-wrap gap-2 text-xs"><Pill label={`Visual · ${selected.visualDecision}`} /><Pill label={`Forgeability · ${selected.forgeabilityStatus}`} /><Pill label={`Physical · ${selected.physicalTestStatus}`} /></div> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {jobs.map((job) => {
          const existing = records.find((record) => record.generationJobId === job.id);
          return <Button key={job.id} variant="ghost" onClick={() => existing ? setSelectedId(existing.id) : create(job.id)}>{existing ? `Open Attempt ${job.attemptNumber ?? "—"}` : `Verify Attempt ${job.attemptNumber ?? "—"}`}</Button>;
        })}
        {!jobs.length ? <span className="text-sm text-slate-500">No generated model attempts are recorded for this concept.</span> : null}
      </div>

      {selected ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.8fr,1.2fr]">
            <div className="space-y-3 rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Verification record</span><Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{records.map((record) => <option key={record.id} value={record.id}>{record.modelRevision} · {record.evidenceClass} · {record.id}</option>)}</Select></label>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Canon identity</span><Select value={selected.canonRecordId ?? ""} onChange={(event) => update({ canonRecordId: event.target.value || undefined })}><option value="">No character canon record required</option>{state.canonRecords.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.canonStatus}</option>)}</Select></label>
              {canon ? <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100"><div className="font-medium">Character DNA</div><div className="mt-1">{canon.characterDna.join(" · ")}</div></div> : null}
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Evidence class</span><Select value={selected.evidenceClass} onChange={(event) => update({ evidenceClass: event.target.value as EvidenceClass, forgeabilityStatus: "Pending" })}>{evidenceClasses.map((item) => <option key={item}>{item}</option>)}</Select></label>
              <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Actual model path</span><Input value={selected.modelPath} onChange={(event) => update({ modelPath: event.target.value, forgeabilityStatus: "Pending" })} placeholder="STL, 3MF, or OBJ revision under assessment" /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Revision</span><Input value={selected.modelRevision} onChange={(event) => update({ modelRevision: event.target.value, forgeabilityStatus: "Pending" })} /></label><label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Model SHA-256</span><Input value={selected.modelSha256} onChange={(event) => update({ modelSha256: event.target.value.trim(), forgeabilityStatus: "Pending" })} placeholder="64-character content fingerprint" /></label></div>
              <ArrayField label="Risks" values={selected.risks} onChange={(risks) => update({ risks })} placeholder="One observable failure mode per line" />
              <ArrayField label="Requirements" values={selected.requirements} onChange={(requirements) => update({ requirements })} placeholder="One corrective requirement per line" />
              <ArrayField label="Essential unknowns" values={selected.unknowns} onChange={(unknowns) => update({ unknowns })} placeholder="Evidence still required" />
            </div>

            <div className="rounded-xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Standardized inspection views</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">{allInspectionViews.map((view) => <label key={view} className="block space-y-2"><span className="text-xs text-slate-400">{view}{requiredInspectionViews.includes(view) ? " · required" : " · when applicable"}</span><Input value={selected.inspectionViews[view] ?? ""} onChange={(event) => update({ inspectionViews: { ...selected.inspectionViews, [view]: event.target.value } })} placeholder={`${view} image path`} /></label>)}</div>
              <div className={`mt-3 text-xs ${requiredViewsPresent(selected) ? "text-emerald-300" : "text-amber-300"}`}>{requiredViewsPresent(selected) ? "All required visual inspection views linked." : "Visual acceptance is blocked until all seven required views are linked."}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <CheckPanel title="Canon and likeness assessment" checks={selected.visualChecks} onChange={(visualChecks) => update({ visualChecks, visualDecision: "Pending" })} />
            <CheckPanel title="Mesh integrity assessment" checks={selected.meshChecks} onChange={(meshChecks) => update({ meshChecks, forgeabilityStatus: "Pending" })} disabled={selected.evidenceClass === "Concept only"} />
          </div>

          <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">Assessment notes</span><Textarea rows={4} value={selected.notes} onChange={(event) => update({ notes: event.target.value })} /></label>

          <div className="grid gap-4 lg:grid-cols-2">
            <DecisionPanel title="Visual decision" helper={checksAllPass(selected.visualChecks) && requiredViewsPresent(selected) ? "Eligible for visual acceptance." : "Acceptance still blocked by checks or views."}><Button variant="ghost" onClick={() => setVisualDecision("Rejected")}>Rejected</Button><Button variant="ghost" onClick={() => setVisualDecision("Changes Required")}>Changes Required</Button><Button onClick={() => setVisualDecision("Accepted")}>Accept Likeness</Button></DecisionPanel>
            <DecisionPanel title="Forgeability gate" helper={canApproveForgeability(selected) ? "Mesh evidence supports approval at this evidence class." : "Approval requires mesh, checksum, and all mesh checks."}><Button variant="ghost" onClick={() => setForgeability("Pending")}>Pending</Button><Button variant="ghost" onClick={() => setForgeability("Changes Required")}>Changes Required</Button><Button variant="ghost" onClick={() => setForgeability("Blocked")}>Blocked</Button><Button onClick={() => setForgeability("Approved")}>Approve Evidence</Button></DecisionPanel>
          </div>
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">Physical status remains separate. Only Derek or evidence he supplies may establish a passed Print Trial; this station does not infer it from likeness, mesh checks, slicing, or simulation.</div>
          {message ? <div className="rounded-xl border border-white/10 bg-[#0d131c] p-3 text-sm text-slate-300">{message}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function CheckPanel({ title, checks, onChange, disabled = false }: { title: string; checks: VerificationCheck[]; onChange: (checks: VerificationCheck[]) => void; disabled?: boolean }) {
  return <div className={`rounded-xl border border-white/10 bg-[#0d131c] p-4 ${disabled ? "opacity-60" : ""}`}><div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>{disabled ? <div className="mt-2 text-xs text-amber-300">Actual mesh evidence is required before these checks can be assessed.</div> : null}<div className="mt-3 space-y-3">{checks.map((check) => <div key={check.id} className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.02] p-3 md:grid-cols-[1fr,150px]"><div><div className="text-sm text-slate-200">{check.label}</div><Input className="mt-2" value={check.note} disabled={disabled} onChange={(event) => onChange(updateVerificationCheck(checks, check.id, check.result, event.target.value))} placeholder="Evidence or correction note" /></div><Select value={check.result} disabled={disabled} onChange={(event) => onChange(updateVerificationCheck(checks, check.id, event.target.value as AssessmentResult))}><option>Not Assessed</option><option>Pass</option><option>Fail</option></Select></div>)}</div></div>;
}

function ArrayField({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string }) {
  return <label className="block space-y-2"><span className="text-xs uppercase tracking-wide text-slate-500">{label}</span><Textarea rows={3} value={values.join("\n")} onChange={(event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} placeholder={placeholder} /></label>;
}

function DecisionPanel({ title, helper, children }: { title: string; helper: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-[#0d131c] p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{title}</div><div className="mt-2 text-xs text-slate-400">{helper}</div><div className="mt-3 flex flex-wrap gap-2">{children}</div></div>;
}

function Pill({ label }: { label: string }) {
  return <span className="rounded-full border border-white/10 bg-[#0d131c] px-3 py-2 text-slate-300">{label}</span>;
}
