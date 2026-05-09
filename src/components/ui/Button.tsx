import type { ButtonHTMLAttributes } from "react";

export function Button({ variant = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "danger" }) {
  const styles = variant === "ghost"
    ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
    : variant === "danger"
      ? "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
      : "border-amber-500/20 bg-amber-500 text-slate-950 hover:bg-amber-400";
  return <button {...props} className={`h-10 rounded-xl border px-4 text-sm font-medium transition ${styles} ${className}`} />;
}
