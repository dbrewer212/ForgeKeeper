import type { InputHTMLAttributes } from "react";
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 rounded-xl border border-white/10 bg-[#0d131c] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 ${props.className || ""}`} />;
}
