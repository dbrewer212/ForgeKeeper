import { foundryStations } from "../../core/stations";

export function Sidebar({ state, onBastion }: { state: any; onBastion: () => void }) {
  const navItem = (key: string, label: string, description?: string) => (
    <button
      onClick={() => state.setView(key)}
      title={description}
      className={`w-full text-left px-3 py-2 rounded-lg mb-2 ${
        state.view === key || (key === "designs" && state.view === "catalog") || (key === "production" && state.view === "orders")
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

      <button
        type="button"
        onClick={onBastion}
        className="mb-4 min-h-[48px] w-full rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-left font-semibold text-amber-200 hover:bg-amber-900/40"
      >
        Bastion
      </button>

      {foundryStations.map((station) => (
        <div key={station.id}>
          {navItem(station.view, station.label, station.description)}
        </div>
      ))}

      <div className="my-4 border-t border-gray-800" />
      {navItem("commissioning", "Commissioning", "Temporary subsystem commissioning and verification console.")}
    </aside>
  );
}
