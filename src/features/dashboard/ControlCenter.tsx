import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { generationSpend } from "../../lib/generationBudget";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { PipelineStage } from "../../types/domain";

const pipelineStages: PipelineStage[] = [
  "Planning",
  "Concept Approved",
  "Engineering",
  "Prototype",
  "Print Trial",
  "Production Approved",
  "Released",
];

export function ControlCenter({ state }: { state: ForgekeeperState }) {
  const objective = state.controlCenter.activeObjective;
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaNotes, setIdeaNotes] = useState("");
  const jobs = objective.productId
    ? state.generationJobs.filter((job) => job.productId === objective.productId)
    : state.generationJobs;
  const spend = objective.productId
    ? generationSpend(state.generationJobs, objective.productId)
    : {
        attempts: jobs.length,
        actual: jobs.reduce((sum, job) => sum + (job.creditsUsed ?? 0), 0),
        committed: jobs.reduce((sum, job) => sum + (job.creditsUsed ?? job.expectedCredits ?? 0), 0),
        rejected: jobs.filter((job) => job.reviewStatus === "rejected").length,
      };
  const currentStageIndex = pipelineStages.indexOf(objective.stage);

  function captureIdea() {
    state.addParkedIdea(ideaTitle, ideaNotes);
    setIdeaTitle("");
    setIdeaNotes("");
  }

  return (
    <div className="space-y-6">
      <Card
        title="Foundry Control Center"
        right={<span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">One active objective</span>}
      >
        <div className="grid gap-5 xl:grid-cols-[1.45fr,0.55fr]">
          <div className="rounded-2xl border border-amber-500/20 bg-[#0d131c] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Active objective</div>
                <Input
                  aria-label="Active objective"
                  className="mt-2 w-full border-0 bg-transparent px-0 text-xl font-semibold text-slate-50"
                  value={objective.title}
                  onChange={(event) => state.updateActiveObjective({ title: event.target.value })}
                />
              </div>
              <Select value={objective.status} onChange={(event) => state.updateActiveObjective({ status: event.target.value as typeof objective.status })}>
                <option>Active</option>
                <option>Paused</option>
                <option>Complete</option>
              </Select>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Product">
                <Select className="w-full" value={objective.productId ?? ""} onChange={(event) => state.updateActiveObjective({ productId: event.target.value || undefined })}>
                  <option value="">Foundry-wide</option>
                  {state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </Select>
              </Field>
              <Field label="Pipeline stage">
                <Select className="w-full" value={objective.stage} onChange={(event) => state.updateActiveObjective({ stage: event.target.value as PipelineStage })}>
                  {pipelineStages.map((stage) => <option key={stage}>{stage}</option>)}
                </Select>
              </Field>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              {pipelineStages.map((stage, index) => (
                <button
                  key={stage}
                  onClick={() => state.updateActiveObjective({ stage })}
                  className={`rounded-xl border px-3 py-3 text-left text-xs transition ${index === currentStageIndex ? "border-amber-400/50 bg-amber-500/15 text-amber-200" : index < currentStageIndex ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.025] text-slate-500 hover:bg-white/5"}`}
                >
                  <span className="block text-[10px] uppercase tracking-wide opacity-70">{index < currentStageIndex ? "Earlier stage" : index === currentStageIndex ? "Current" : `Gate ${index + 1}`}</span>
                  <span className="mt-1 block font-medium">{stage}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">Stage position records workflow location only. It does not claim Canon, Forgeability, or Physical Trial approval.</div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <ObjectiveField label="Last completed action" value={objective.lastCompletedAction} onChange={(lastCompletedAction) => state.updateActiveObjective({ lastCompletedAction })} />
              <ObjectiveField label="Next concrete action" value={objective.nextAction} onChange={(nextAction) => state.updateActiveObjective({ nextAction })} accent />
              <ObjectiveField label="Current blocker" value={objective.blocker} onChange={(blocker) => state.updateActiveObjective({ blocker })} />
              <ObjectiveField label="Approval needed" value={objective.approvalNeeded} onChange={(approvalNeeded) => state.updateActiveObjective({ approvalNeeded })} />
            </div>
            <div className="mt-4 text-xs text-slate-500">Updated {new Date(objective.updatedAt).toLocaleString()}</div>
          </div>

          <div className="space-y-4">
            <StatusPanel label="Blocker" value={objective.blocker || "None"} clear={!objective.blocker || objective.blocker.toLowerCase() === "none"} />
            <StatusPanel label="Waiting for approval" value={objective.approvalNeeded || "None"} clear={!objective.approvalNeeded || objective.approvalNeeded.toLowerCase() === "none"} />
            <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Generation exposure</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric label="Confirmed" value={`${spend.actual} cr`} />
                <Metric label="Committed" value={`${spend.committed} cr`} />
                <Metric label="Attempts" value={String(spend.attempts)} />
                <Metric label="Rejected" value={String(spend.rejected)} />
              </div>
              <div className="mt-3 text-xs text-slate-500">{objective.productId ? "Active product only" : "All Foundry generation jobs"}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Ooooo, Shiny" right={<span className="text-xs text-slate-500">Capture without changing course</span>}>
        <div className="grid gap-5 xl:grid-cols-[0.75fr,1.25fr]">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <Field label="Idea">
              <Input className="w-full" placeholder="What just tried to steal the brain cell?" value={ideaTitle} onChange={(event) => setIdeaTitle(event.target.value)} />
            </Field>
            <div className="mt-3">
              <Field label="Why it matters / where to resume">
                <Textarea rows={4} value={ideaNotes} onChange={(event) => setIdeaNotes(event.target.value)} />
              </Field>
            </div>
            <Button className="mt-3 w-full" disabled={!ideaTitle.trim()} onClick={captureIdea}>Park idea</Button>
          </div>

          <div className="space-y-3">
            {state.controlCenter.parkedIdeas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">The goblin drawer is currently empty.</div>
            )}
            {state.controlCenter.parkedIdeas.map((idea) => (
              <div key={idea.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0d131c] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-slate-100">{idea.title}</div>
                  {idea.notes && <div className="mt-1 text-sm text-slate-400">{idea.notes}</div>}
                  {idea.sourceObjective && <div className="mt-2 text-xs text-amber-300">Objective checkpoint · {idea.sourceObjective.stage} · {idea.sourceObjective.status}</div>}
                  <div className="mt-2 text-xs text-slate-600">Captured {new Date(idea.capturedAt).toLocaleString()}</div>
                </div>
                <Button variant="ghost" onClick={() => state.promoteParkedIdea(idea.id)}>Make active</Button>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function ObjectiveField({ label, value, onChange, accent = false }: { label: string; value: string; onChange: (value: string) => void; accent?: boolean }) {
  return (
    <Field label={label}>
      <Textarea rows={3} className={accent ? "border-amber-500/25" : ""} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function StatusPanel({ label, value, clear }: { label: string; value: string; clear: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${clear ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5"}`}>
      <div className={`text-xs uppercase tracking-wide ${clear ? "text-emerald-400" : "text-amber-300"}`}>{label}</div>
      <div className="mt-2 text-sm text-slate-200">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-[#111722] p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold text-slate-100">{value}</div></div>;
}
