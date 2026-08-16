import type { TextareaHTMLAttributes } from "react";
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-xl border border-slate-700/65 bg-[linear-gradient(180deg,rgba(13,11,9,0.96),rgba(21,18,15,0.94))] px-3 py-2 text-sm text-slate-100 shadow-forge-inset outline-none placeholder:text-slate-500 focus:border-amber-600/60 ${props.className || ""}`} />;
}
