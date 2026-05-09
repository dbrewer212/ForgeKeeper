import type { SelectHTMLAttributes } from "react";
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 rounded-xl border border-white/10 bg-[#0d131c] px-3 text-sm text-slate-100 outline-none ${props.className || ""}`} />;
}
