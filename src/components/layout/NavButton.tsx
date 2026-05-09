export function NavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${active ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
      <span>{label}</span>
      <span className="text-xs text-slate-500">›</span>
    </button>
  );
}
