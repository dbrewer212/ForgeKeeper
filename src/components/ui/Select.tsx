import type { SelectHTMLAttributes } from "react";
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 rounded-xl border border-slate-700/65 bg-[linear-gradient(180deg,rgba(13,11,9,0.96),rgba(21,18,15,0.94))] px-3 text-sm text-slate-100 shadow-forge-inset outline-none focus:border-amber-600/60 ${props.className || ""}`} />;
}
