export type StandardizationProfileId = "original" | "goblin-display-4in" | "wyrm-2_5in" | "wyrm-3in" | "wyrm-3_5in" | "custom";

export interface StandardizationProfile {
  id: StandardizationProfileId;
  label: string;
  targetHeightMm?: number;
}

export const STANDARDIZATION_PROFILES: StandardizationProfile[] = [
  { id: "original", label: "Original / No scaling" },
  { id: "goblin-display-4in", label: "Foundry Goblin — Display · 4.0 in", targetHeightMm: 101.6 },
  { id: "wyrm-2_5in", label: "Foundry Wyrm — Small · 2.5 in", targetHeightMm: 63.5 },
  { id: "wyrm-3in", label: "Foundry Wyrm — Standard · 3.0 in", targetHeightMm: 76.2 },
  { id: "wyrm-3_5in", label: "Foundry Wyrm — Large · 3.5 in", targetHeightMm: 88.9 },
  { id: "custom", label: "Custom size" },
];
