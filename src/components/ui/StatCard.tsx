export function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(11,16,23,0.98))] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-100">{value}</div>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}
