type SidebarProps = {
  state: any;
};

type NavItem = {
  key: string;
  label: string;
  description: string;
};

const navItems: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Forge overview",
  },
  {
    key: "catalog",
    label: "Admin Catalog",
    description: "Products and assets",
  },
  {
    key: "customerCatalog",
    label: "Customer Catalog",
    description: "Browse and request",
  },
  {
    key: "planning",
    label: "Planning",
    description: "Concept pipeline",
  },
  {
    key: "orders",
    label: "Orders",
    description: "Customer work",
  },
  {
    key: "filament",
    label: "Filament",
    description: "Material stock",
  },
  {
    key: "printers",
    label: "Printers",
    description: "Deferred production layer",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Forge intelligence",
  },
  {
    key: "settings",
    label: "Settings",
    description: "System controls",
  },
];

export function Sidebar({ state }: SidebarProps) {
  return (
    <aside className="forge-glass flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-3xl">
      <div className="border-b border-white/10 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-amber-300/80">
          Fenrir Forge
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-50">
          ForgeKeeper
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Business, products, inventory, planning, and operational records.
        </p>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {navItems.map((item) => {
          const isActive = state.view === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => state.setView(item.key)}
              className={`group w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                isActive
                  ? "border-amber-300/35 bg-amber-400/15 shadow-lg shadow-amber-950/25"
                  : "border-white/10 bg-white/[0.035] hover:border-amber-300/20 hover:bg-white/[0.065]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-sm font-bold ${
                    isActive ? "text-amber-100" : "text-slate-200"
                  }`}
                >
                  {item.label}
                </span>

                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive ? "bg-amber-300 shadow-lg shadow-amber-300/40" : "bg-slate-600"
                  }`}
                />
              </div>

              <p
                className={`mt-1 text-xs ${
                  isActive ? "text-amber-100/70" : "text-slate-500"
                }`}
              >
                {item.description}
              </p>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200">
            Forge Metric
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Build the business first. Printer-heavy systems stay deferred.
          </p>
        </div>
      </div>
    </aside>
  );
}
