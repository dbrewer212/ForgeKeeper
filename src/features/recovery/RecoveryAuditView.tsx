import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function RecoveryAuditView({ state }: { state: ForgekeeperState }) {
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const scan = state.recovery.lastIntegrityScan;
  const critical = scan?.findings.filter((item) => item.severity === "Critical").length ?? 0;
  const warnings = scan?.findings.filter((item) => item.severity === "Warning").length ?? 0;

  async function perform(label: string, action: () => Promise<unknown>, success: string) {
    setWorking(label);
    setMessage("");
    try {
      const result = await action();
      setMessage(result ? success : `${label} did not complete.`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-500/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_36%),#080c13] p-6">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-400">Foundry Recovery Layer</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">Recovery & Audit System</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">Observe data health, preserve verified restore points, reconcile existing provider work, and expose failures before they become losses. Recovery never retries a paid job, rotates a credential, deletes an asset, or rolls back the workspace without explicit approval.</p>
      </div>

      {message ? <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Status label="Critical findings" value={critical} tone={critical ? "rose" : "emerald"} />
        <Status label="Warnings" value={warnings} tone={warnings ? "amber" : "emerald"} />
        <Status label="Recovery points" value={state.recoveryCheckpoints.length} tone="sky" />
        <Status label="Audit events" value={state.recovery.auditEvents.length} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Integrity Scan" right={<span className="text-xs text-slate-500">Read-only</span>}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">Checks record relationships, Library identities, SHA-256 formats, stale Print Trial evidence, duplicate provider IDs, and—inside the desktop app—whether linked local files still exist.</p>
            <Button disabled={Boolean(working)} onClick={() => perform("Integrity scan", state.runIntegrityScan, "Integrity scan completed.")}>{working === "Integrity scan" ? "Scanning…" : "Run Integrity Scan"}</Button>
            {scan ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
                <div className="font-medium text-slate-200">Last scan: {new Date(scan.completedAt).toLocaleString()}</div>
                <div className="mt-1">{scan.findings.length} findings · {scan.checkedPathCount} local paths checked</div>
                {!scan.desktopFileChecksAvailable ? <div className="mt-2 text-amber-300">Local file reachability was not available in this browser session; structural checks still completed.</div> : null}
              </div>
            ) : <Empty text="No integrity scan has been recorded yet." />}
          </div>
        </Card>

        <Card title="Credential Health" right={<span className="text-xs text-slate-500">Secrets excluded</span>}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">Confirms that the configured local credential file is readable and contains recognizable Meshy and PrintPal entries. Secret values never enter workspace data, backups, audit events, or this screen.</p>
            <Button variant="ghost" disabled={Boolean(working)} onClick={() => perform("Credential check", state.checkCredentialHealth, "Credential health check completed.")}>{working === "Credential check" ? "Checking…" : "Check Credential File"}</Button>
            {state.recovery.credentialHealth ? (
              <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
                <div className={state.recovery.credentialHealth.readable ? "text-emerald-300" : "text-amber-300"}>{state.recovery.credentialHealth.message}</div>
                <div className="mt-2 text-xs text-slate-500">Checked {new Date(state.recovery.credentialHealth.checkedAt).toLocaleString()}</div>
              </div>
            ) : <Empty text="Credential health has not been checked." />}
          </div>
        </Card>

        <Card title="Provider Job Reconciliation" right={<span className="text-xs text-amber-300">Never submits</span>}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">Refreshes non-terminal Meshy and PrintPal records using their existing external job IDs. Duplicate IDs block reconciliation. No retry, replacement, or paid generation is authorized here.</p>
            <Button variant="ghost" disabled={Boolean(working)} onClick={() => perform("Provider reconciliation", state.reconcileProviderJobs, "Provider reconciliation completed without submitting a new job.")}>{working === "Provider reconciliation" ? "Reconciling…" : "Reconcile Existing Jobs"}</Button>
            <div className="space-y-2">
              {state.generationJobs.length ? state.generationJobs.slice(0, 6).map((job) => (
                <div key={job.id} className="rounded-xl border border-white/10 bg-[#0d131c] p-3 text-sm">
                  <div className="flex items-center justify-between gap-3"><span className="text-slate-200">{job.provider} · {job.externalJobId}</span><span className="text-slate-500">{job.status}</span></div>
                  {job.lastReconciledAt ? <div className="mt-1 text-xs text-slate-500">Checked {new Date(job.lastReconciledAt).toLocaleString()} · {job.reconciliationMessage}</div> : null}
                </div>
              )) : <Empty text="No provider jobs are recorded." />}
            </div>
          </div>
        </Card>

        <Card title="Verified Backup" right={<span className="text-xs text-emerald-300">SHA-256</span>}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-400">Portable backups use a versioned envelope and checksum. Forgekeeper also preserves automatic local checkpoints at session start and before import, rollback, or reset.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={state.exportBackupJson}>Download Verified Backup</Button>
              <Button variant="ghost" disabled={Boolean(working)} onClick={() => perform("Recovery checkpoint", () => state.createManualCheckpoint(), "Recovery checkpoint created.")}>{working === "Recovery checkpoint" ? "Saving…" : "Create Local Checkpoint"}</Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Recovery Checkpoints" right={<span className="text-xs text-slate-500">Newest first · six retained</span>}>
        <div className="space-y-3">
          {state.recoveryCheckpoints.length ? state.recoveryCheckpoints.map((checkpoint) => (
            <div key={checkpoint.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0d131c] p-4 md:flex-row md:items-center md:justify-between">
              <div><div className="font-medium text-slate-200">{checkpoint.reason}</div><div className="mt-1 text-xs text-slate-500">{new Date(checkpoint.createdAt).toLocaleString()} · SHA-256 {checkpoint.checksum.slice(0, 16)}…</div></div>
              <div className="flex gap-2"><Button variant="ghost" onClick={() => state.restoreRecoveryCheckpoint(checkpoint.id)}>Verify & Restore</Button><Button variant="danger" onClick={() => state.deleteRecoveryCheckpoint(checkpoint.id)}>Delete</Button></div>
            </div>
          )) : <Empty text="No local recovery checkpoints are available." />}
        </div>
      </Card>

      <Card title="Open Integrity Findings" right={<span className="text-xs text-slate-500">No automatic repair</span>}>
        <div className="space-y-3">
          {scan?.findings.length ? scan.findings.map((item) => (
            <div key={item.id} className={`rounded-2xl border p-4 ${item.severity === "Critical" ? "border-rose-500/20 bg-rose-500/5" : item.severity === "Warning" ? "border-amber-500/20 bg-amber-500/5" : "border-white/10 bg-white/5"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="font-medium text-slate-100">{item.title}</div><div className="text-xs uppercase tracking-wide text-slate-400">{item.severity} · {item.category}</div></div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</div>
            </div>
          )) : <Empty text="No findings are recorded. Run an integrity scan to establish the current state." />}
        </div>
      </Card>

      <Card title="Audit History" right={<span className="text-xs text-slate-500">Latest 300 retained</span>}>
        <div className="space-y-2">
          {state.recovery.auditEvents.length ? state.recovery.auditEvents.slice(0, 30).map((event) => (
            <div key={event.id} className="grid gap-2 rounded-xl border border-white/10 bg-[#0d131c] p-3 text-sm md:grid-cols-[170px_150px_1fr]">
              <div className="text-slate-500">{new Date(event.occurredAt).toLocaleString()}</div><div className="text-slate-300">{event.type} · {event.outcome}</div><div><span className="text-slate-200">{event.action}</span><span className="text-slate-500"> — {event.summary}</span></div>
            </div>
          )) : <Empty text="Audit history begins when a recovery, provider, credential, or integrity action is recorded." />}
        </div>
      </Card>
    </div>
  );
}

function Status({ label, value, tone }: { label: string; value: number; tone: "rose" | "amber" | "emerald" | "sky" | "slate" }) {
  const colors = { rose: "border-rose-500/20 text-rose-300", amber: "border-amber-500/20 text-amber-300", emerald: "border-emerald-500/20 text-emerald-300", sky: "border-sky-500/20 text-sky-300", slate: "border-white/10 text-slate-300" };
  return <div className={`rounded-2xl border bg-[#0d131c] p-4 ${colors[tone]}`}><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">{text}</div>;
}
