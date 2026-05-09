import type { TextareaHTMLAttributes } from "react";
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`rounded-xl border border-white/10 bg-[#0d131c] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 ${props.className || ""}`} />;
}
