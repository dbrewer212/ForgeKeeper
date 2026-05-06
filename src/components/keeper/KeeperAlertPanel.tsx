import { getKeeperActions } from "../../lib/keeper/keeperActions";
import type { KeeperAlert } from "../../lib/keeper/keeperAlerts";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

function severityClass(severity: KeeperAlert["severity"]): string {
  if (severity === "critical") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  if (severity === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (severity === "opportunity") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

export function KeeperAlertPanel({ alerts, state }: { alerts: KeeperAlert[]; state?: any }) {
  const actions = getKeeperActions(alerts);
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;

  return (
    <Card
      title="Keeper Alerts"
      right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{alerts.length} active</span>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Critical</div>
          <div className="mt-2 text-2xl font-semibold text-rose-300">{criticalCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Warnings</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">{warningCount}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Suggested Actions</div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">{actions.length}</div>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
          No Keeper alerts right now.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.slice(0, 8).map((alert) => (
            <div key={alert.id} className={`rounded-2xl border p-4 ${severityClass(alert.severity)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{alert.title}</div>
                  <div className="mt-1 text-sm opacity-85">{alert.message}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] opacity-60">{alert.section}</div>
                </div>
                {state?.setView ? (
                  <Button variant="ghost" onClick={() => state.setView(alert.section)}>
                    Open Section
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
