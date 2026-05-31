import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-black/30 outline-none transition-all duration-200 focus:border-amber-400/45 focus:bg-slate-950/75 focus:ring-2 focus:ring-amber-400/15 ${className}`}
      {...props}
    />
  );
}