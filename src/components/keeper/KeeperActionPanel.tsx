import type { KeeperAction } from "../../lib/keeper/keeperActions";
import { Card } from "../ui/Card";

export function KeeperActionPanel({ actions }: { actions: KeeperAction[] }) {
  return (
    <Card title="Keeper Suggested Actions" right={<span className="text-xs text-slate-500">Suggest-only</span>}>
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
                  <div className="text-sm font-semibold text-slate-100">{action.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{action.description}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-600">{action.status}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
