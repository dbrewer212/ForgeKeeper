import type { ReactNode } from "react";

type CardProps = {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, right, children, className = "" }: CardProps) {
  return (
    <section
      className={`forge-panel group relative overflow-hidden rounded-2xl p-5 ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/35 to-transparent" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl transition-opacity duration-300 group-hover:opacity-90" />

      <div className="relative mb-4 flex items-start justify-between gap-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-amber-100/90">
          {title}
        </h3>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>

      <div className="relative">{children}</div>
    </section>
  );
}