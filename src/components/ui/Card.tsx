import type { ReactNode } from "react";

export function Card({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-amber-500/15 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,14,22,0.96))] shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
