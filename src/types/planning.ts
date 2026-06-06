export type PlanningStatus =
  | "Planned"
  | "Need to Order"
  | "Ordered"
  | "In Testing"
  | "Approved"
  | "Active"
  | "Archived";

export type PrototypeStatus =
  | "Active Idea"
  | "In Progress"
  | "Refining"
  | "Modeled"
  | "On Hold";

export type PrototypePriority = "High" | "Medium" | "Low";

export type PlannedPrototype = {
  id: string;
  productName: string;
  family: string;
  collection: string;
  tier: "Foundry" | "Relics" | "ForgeTech" | "Reforged";
  realm?: string;
  status: PrototypeStatus;
  priority: PrototypePriority;
  printerFit: string;
  nextStep: string;
  notes: string;
};

export type PlannedFilament = {
  id: string;
  name: string;
  brand: string;
  materialFamily: "Stone" | "Wood" | "Heat" | "Light" | "Forge" | "Other";
  realms: string[];
  batchGroup: string;
  status: PlanningStatus;
  priority: PrototypePriority;
  finishDirection: string;
  notes: string;
};

export type RealmMaterialReference = {
  realm: string;
  baseCandidates: string[];
  whyTheyFit: string;
  finishDirection: string;
  batchGroup: string;
};

export type ProductPlanningRecord = {
  id: string;
  productFamily: string;
  baseProduct: string;
  collection: string;
  tier: "Foundry" | "Relics" | "ForgeTech" | "Reforged";
  sharedChassis: "Yes" | "No" | "Partial";
  coreFunction: string;
  realmVariantSupport: "Yes" | "No" | "Optional";
  coreParts: string;
  variantParts: string;
  baseAddOns: string;
  topModuleOptions: string;
  attachmentTypes: string;
  bestPrinterFit: string;
  prototypePriority: PrototypePriority;
  notes: string;
};
