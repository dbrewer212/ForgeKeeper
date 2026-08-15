import type { ButtonHTMLAttributes } from "react";

export function Button({ variant = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "danger" }) {
  const styles = variant === "ghost"
    ? "border-slate-700/60 bg-slate-900/70 text-slate-200 shadow-forge-inset hover:border-amber-700/45 hover:bg-slate-800/80"
    : variant === "danger"
      ? "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
      : "border-amber-500/35 bg-[linear-gradient(180deg,#c79438,#a97524)] text-slate-950 shadow-[0_5px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,247,230,0.22)] hover:brightness-110 active:translate-y-px";
  return <button {...props} className={`h-10 rounded-xl border px-4 text-sm font-semibold transition ${styles} ${className}`} />;
}
