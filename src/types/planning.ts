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
  designName: string;
  family: string;
  collection: string;
  tier: "Hero" | "Utility";
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

export type DesignPlanningRecord = {
  id: string;
  designFamily: string;
  baseDesign: string;
  collection: string;
  tier: "Hero" | "Utility";
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
