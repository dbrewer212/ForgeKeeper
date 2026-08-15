import type { ReactNode } from "react";

export function Card({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-amber-700/35 bg-[linear-gradient(180deg,rgba(25,22,19,0.985),rgba(13,11,9,0.975))] shadow-forge ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-amber-900/40 bg-[linear-gradient(90deg,rgba(74,53,37,0.18),rgba(21,18,15,0.16),rgba(169,117,36,0.055))] px-5 py-4 shadow-forge-inset">
        <h3 className="text-sm font-semibold tracking-[0.015em] text-slate-100">{title}</h3>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
