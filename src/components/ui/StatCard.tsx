type StatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
};

export function StatCard({ label, value, helper }: StatCardProps) {
  return (
    <section className="forge-panel forge-ember-line relative overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-400/10 blur-3xl" />

      <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>

      <p className="relative mt-3 text-3xl font-black tracking-tight text-slate-50">
        {value}
      </p>

      {helper ? (
        <p className="relative mt-2 text-sm leading-6 text-slate-400">{helper}</p>
      ) : null}
    </section>
  );
}