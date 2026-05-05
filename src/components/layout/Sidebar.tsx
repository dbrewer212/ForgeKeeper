export function Sidebar({ state }: { state: any }) {
  const navItem = (key: string, label: string) => (
    <button
      onClick={() => state.setView(key)}
      className={`w-full text-left px-3 py-2 rounded-lg mb-2 ${
        state.view === key
          ? "bg-amber-600 text-white"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <aside className="w-64 bg-black p-4">
      <div className="mb-6 text-xl font-bold text-amber-400">
        Forgekeeper
      </div>

      {navItem("dashboard", "Dashboard")}
      {navItem("catalog", "Catalog")}
      {navItem("orders", "Orders")}
      {navItem("filament", "Filament")}
      {navItem("printers", "Printers")}

      {/* ✅ NEW */}
      {navItem("planning", "Planning")}

      {navItem("reports", "Reports")}
      {navItem("settings", "Settings")}
    </aside>
  );
}