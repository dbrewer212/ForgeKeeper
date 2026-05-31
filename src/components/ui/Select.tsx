import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", ...props }: SelectProps) {
  return (
    <select
      className={`w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none transition-all duration-200 focus:border-amber-400/45 focus:bg-slate-950/75 focus:ring-2 focus:ring-amber-400/15 ${className}`}
      {...props}
    />
  );
}