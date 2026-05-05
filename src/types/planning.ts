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
  | "On Hold"
  | "Approved";

export type PrototypePriority = "High" | "Medium" | "Low";
export type PlanningTier = "Hero" | "Utility";
export type MaterialFamily = "Stone" | "Wood" | "Heat" | "Light" | "Forge" | "Organic";

export type PrototypeRecord = {
  id: string;
  productName: string;
  family: string;
  collection: string;
  tier: PlanningTier;
  realm?: string;
  sharedChassis: boolean;
  realmSupport: boolean;
  status: PrototypeStatus;
  priority: PrototypePriority;
  printerFit: string;
  baseModule?: string;
  pillarModule?: string;
  topModule?: string;
  addOns?: string;
  coinIntegration?: string;
  nextStep: string;
  notes: string;
};

export type PlannedFilamentRecord = {
  id: string;
  name: string;
  brand: string;
  materialFamily: MaterialFamily;
  realmUses: string[];
  status: PlanningStatus;
  priority: PrototypePriority;
  batchGroup: string;
  finishDirection: string;
  notes: string;
};

export type RealmMaterialProfile = {
  realm: string;
  shorthand: string;
  mood: string;
  baseCandidates: string[];
  materialFeel: string;
  finishDirection: string;
  batchGroup: string;
  bestFits: string;
};

export type ProductPlanningRecord = {
  id: string;
  status: PlanningStatus;
  productFamily: string;
  baseProduct: string;
  collection: string;
  tier: PlanningTier;
  sharedChassis: boolean;
  coreFunction: string;
  realmVariantSupport: boolean;
  coreParts: string;
  variantParts: string;
  baseAddOns: string;
  topModuleOptions: string;
  attachmentTypes: string;
  bestPrinterFit: string;
  prototypePriority: PrototypePriority;
  notes: string;
};
