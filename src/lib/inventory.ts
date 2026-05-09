export function inventoryState(available: number, reorderPoint: number): "Available" | "Low" | "Out" {
  if (available <= 0) return "Out";
  if (available <= reorderPoint) return "Low";
  return "Available";
}

export function pillClass(kind: string): string {
  if (["Active", "Available", "Live", "Paid"].includes(kind)) return "border-emerald-500/25 bg-emerald-500/15 text-emerald-300";
  if (["Printing", "Finishing", "Scheduled", "Low"].includes(kind)) return "border-amber-500/25 bg-amber-500/15 text-amber-200";
  if (["Archived", "Out", "Maintenance", "Offline"].includes(kind)) return "border-rose-500/25 bg-rose-500/15 text-rose-300";
  return "border-white/10 bg-white/5 text-slate-300";
}
