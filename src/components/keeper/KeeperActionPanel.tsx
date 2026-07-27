import { Card } from "../ui/Card";
import { getKeeperActions } from "../../lib/keeper/keeperActions";
import { getKeeperAlerts } from "../../lib/keeper/keeperAlerts";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { ViewKey } from "../../types/domain";

type Props = {
  state: ForgekeeperState;
  title?: string;
};

function priorityClass(priority: string) {
  if (priority === "Critical") return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  if (priority === "High") return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  if (priority === "Normal") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
  return "border-white/10 bg-white/5 text-slate-300";
}

export function KeeperActionPanel({ state, title = "Keeper Suggested Actions" }: Props) {
  const alerts = getKeeperAlerts(state);
  const actions = getKeeperActions(alerts);

  return (
    <Card title={title} right={<span className="text-xs text-slate-500">Suggest-only</span>}>
      {actions.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
          No suggested actions right now.
        </div>
      ) : (
        <div className="space-y-3">
          {actions.slice(0, 8).map((action) => (
            <div key={action.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{action.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{action.description}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${priorityClass(action.priority)}`}>
                  {action.priority}
                </span>
              </div>

              {action.targetView ? (
                <button
                  type="button"
                  onClick={() => state.setView(action.targetView as ViewKey)}
                  className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
                >
                  Open related area
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
