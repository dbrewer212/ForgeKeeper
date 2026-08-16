import { getKeeperAlerts } from "../../lib/keeper/keeperAlerts";
import type { KeeperAlert, KeeperAlertSeverity } from "../../lib/keeper/keeperAlerts";

function alertStyle(severity: KeeperAlertSeverity) {
  if (severity === "critical") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  if (severity === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (severity === "opportunity") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-sky-500/25 bg-sky-500/10 text-sky-100";
}

function alertLabel(severity: KeeperAlertSeverity) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  if (severity === "opportunity") return "Opportunity";
  return "Info";
}

export function KeeperAlertPanel({ state, title = "Keeper Alerts" }: { state: any; title?: string }) {
  const alerts: KeeperAlert[] = getKeeperAlerts(state);
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;

  return (
    <section className="rounded-3xl border border-amber-500/15 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,14,22,0.96))] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">Read-only system checks. No automatic changes are made.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">{alerts.length} total</span>
          <span className="rounded-full border border-rose-500/25 bg-rose-500/10 px-3 py-1 text-rose-200">{criticalCount} critical</span>
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-amber-100">{warningCount} warning</span>
        </div>
      </div>

      <div className="p-5">
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            No active Keeper alerts. Current records look stable.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slice(0, 12).map((alert) => (
              <div key={alert.id} className={`rounded-2xl border p-4 ${alertStyle(alert.severity)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] opacity-70">{alertLabel(alert.severity)}</div>
                    <div className="mt-1 text-sm font-semibold">{alert.title}</div>
                    <div className="mt-1 text-sm font-medium">{alert.message}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.14em] opacity-80">
                    Keeper
                  </span>
                </div>
              </div>
            ))}
            {alerts.length > 12 ? (
              <div className="text-xs text-slate-500">Showing 12 of {alerts.length} alerts.</div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
