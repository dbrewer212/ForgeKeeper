import type { ViewKey } from "../types/domain";

export type FoundryStationId =
  | "command"
  | "design-library"
  | "planning"
  | "production"
  | "materials"
  | "printer-pool"
  | "reports"
  | "administration";

export type FoundryStation = {
  id: FoundryStationId;
  view: ViewKey;
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
    description: "User-owned projects, concepts, STLs, variants, and reference assets.",
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
    description: "Internal jobs, print batches, assignments, and completion outcomes.",
  },
  {
    id: "materials",
    view: "filament",
    label: "Materials",
    description: "Filament stock, demand, thresholds, and material movements.",
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
    description: "Workspace setup, paths, tools, costing defaults, and backups.",
  },
];
