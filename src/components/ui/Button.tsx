import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "default" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:pointer-events-none disabled:opacity-50";

  const variantStyles =
    variant === "ghost"
      ? "border-white/10 bg-white/[0.045] text-slate-200 shadow-inner shadow-white/[0.03] hover:border-amber-400/25 hover:bg-amber-400/10 hover:text-amber-100"
      : variant === "danger"
        ? "border-rose-400/25 bg-rose-500/10 text-rose-200 hover:border-rose-300/40 hover:bg-rose-500/18"
        : "border-amber-300/30 bg-gradient-to-br from-amber-300 via-amber-500 to-orange-700 text-slate-950 shadow-lg shadow-amber-950/30 hover:from-amber-200 hover:via-amber-400 hover:to-orange-600";

  return (
    <button
      className={`${baseStyles} ${variantStyles} ${className}`}
      {...props}
    />
  );
}