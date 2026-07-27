import { foundryStations } from "../../core/stations";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { ViewKey } from "../../types/domain";

export function Sidebar({ state }: { state: ForgekeeperState }) {
  const navItem = (key: ViewKey, label: string, description: string) => (
    <button
      onClick={() => state.setView(key)}
      title={description}
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
        {state.settings.workspaceName || "ForgeKeeper"}
      </div>

      {foundryStations.map((station) => (
        <div key={station.id}>
          {navItem(station.view, station.label, station.description)}
        </div>
      ))}
    </aside>
  );
}
