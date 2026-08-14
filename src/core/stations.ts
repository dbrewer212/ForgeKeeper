export type FoundryStation = {
  id: "command" | "design-library" | "planning" | "production" | "materials" | "printer-pool" | "reports" | "administration";
  view: string;
  label: string;
  description: string;
};

export const foundryStations: FoundryStation[] = [
  {
    id: "command",
    view: "dashboard",
    label: "Command",
    description: "Workshop health, alerts, readiness, and production overview.",
  },
  {
    id: "design-library",
    view: "designs",
    label: "Design Library",
    description: "User-owned projects, concepts, STLs, variants, references, and production assets.",
  },
  {
    id: "planning",
    view: "planning",
    label: "Planning",
    description: "Prototype dependencies, requirements, and production readiness.",
  },
  {
    id: "production",
    view: "production",
    label: "Production",
    description: "Internal jobs, print batches, assignments, completion outcomes, and material use.",
  },
  {
    id: "materials",
    view: "filament",
    label: "Materials",
    description: "Physical spool inventory, receiving, reservations, drying, ledger activity, and stock control.",
  },
  {
    id: "printer-pool",
    view: "printers",
    label: "Printer Pool",
    description: "Printer capabilities, availability, maintenance, and workload.",
  },
  {
    id: "reports",
    view: "reports",
    label: "Reports",
    description: "Operational, production, inventory, and cost reporting.",
  },
  {
    id: "administration",
    view: "settings",
    label: "Administration",
    description: "Workspace setup, paths, tools, costing defaults, providers, backups, and recovery controls.",
  },
];
