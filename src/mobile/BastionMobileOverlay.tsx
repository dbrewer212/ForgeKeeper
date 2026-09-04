import { useState } from "react";
import { useForgekeeperState } from "../state/useForgekeeperState";
import { BastionMobilePanel } from "./BastionMobilePanel";

export function BastionMobileOverlay() {
  const state = useForgekeeperState();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-3 top-[calc(env(safe-area-inset-top)+4.9rem)] z-40 min-h-[42px] rounded-xl border border-amber-700/55 bg-[#17130f]/95 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200 shadow-forge backdrop-blur"
        aria-label="Open Bastion Mobile"
      >
        Bastion
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Bastion Mobile supervisory console">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} aria-label="Close Bastion Mobile" />
          <section className="relative max-h-[90dvh] w-full overflow-auto rounded-t-[28px] border-t border-amber-700/45 bg-[linear-gradient(180deg,#15120f,#080706)] px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.7)]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.26em] text-amber-500">Fenrir Forgeworks</div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-100">Bastion Remote Console</div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-xs font-semibold text-slate-300">Close</button>
              </div>
              {state.storageReady ? (
                <BastionMobilePanel state={state} />
              ) : (
                <div className="rounded-2xl border border-amber-800/35 bg-amber-950/20 p-4 text-sm text-amber-100/75">Opening the mobile Foundry workspace before Bastion can read linked settings.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
