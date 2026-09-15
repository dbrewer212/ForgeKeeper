export type ScaleAxis = "x" | "y" | "z";

export type ScaleProfileId =
  | "foundry-goblin-display"
  | "wyrm-display-2_5in"
  | "wyrm-display-3_0in"
  | "wyrm-display-3_5in";

export const FOUNDRY_SCALE_STANDARD_VERSION = "2026.09" as const;
export const DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM = 0.1;

export type FoundryScaleProfile = {
  profileId: ScaleProfileId;
  label: string;
  family: "display" | "tabletop" | "production" | "custom";
  standardVersion: typeof FOUNDRY_SCALE_STANDARD_VERSION;
  targetAxis: ScaleAxis;
  targetInches: number;
  targetDimensionMm: number;
  preserveProportions: true;
  uniformScaling: true;
  verificationToleranceMm: number;
  fileSuffix: string;
  purpose: string;
};

export type UniformScaleProjection = {
  profileId: ScaleProfileId;
  targetAxis: ScaleAxis;
  targetInches: number;
  targetDimensionMm: number;
  sourceDimensionMm: number;
  scaleFactor: number;
  scaledBoundsMm: { x: number; y: number; z: number };
};

const MILLIMETERS_PER_INCH = 25.4;

function inches(value: number): number {
  return value * MILLIMETERS_PER_INCH;
}

export const FOUNDRY_SCALE_PROFILES: readonly FoundryScaleProfile[] = [
  {
    profileId: "foundry-goblin-display",
    label: "Foundry Goblin — Display",
    family: "display",
    standardVersion: FOUNDRY_SCALE_STANDARD_VERSION,
    targetAxis: "z",
    targetInches: 4,
    targetDimensionMm: inches(4),
    preserveProportions: true,
    uniformScaling: true,
    verificationToleranceMm: DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM,
    fileSuffix: "display_4in",
    purpose: "Standard digital/display scale for Foundry Goblin character models.",
  },
  {
    profileId: "wyrm-display-2_5in",
    label: "Wyrm — 2.5\"",
    family: "display",
    standardVersion: FOUNDRY_SCALE_STANDARD_VERSION,
    targetAxis: "z",
    targetInches: 2.5,
    targetDimensionMm: inches(2.5),
    preserveProportions: true,
    uniformScaling: true,
    verificationToleranceMm: DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM,
    fileSuffix: "wyrm_2_5in",
    purpose: "Compact Wyrm display scale.",
  },
  {
    profileId: "wyrm-display-3_0in",
    label: "Wyrm — 3.0\"",
    family: "display",
    standardVersion: FOUNDRY_SCALE_STANDARD_VERSION,
    targetAxis: "z",
    targetInches: 3,
    targetDimensionMm: inches(3),
    preserveProportions: true,
    uniformScaling: true,
    verificationToleranceMm: DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM,
    fileSuffix: "wyrm_3in",
    purpose: "Standard Wyrm display scale.",
  },
  {
    profileId: "wyrm-display-3_5in",
    label: "Wyrm — 3.5\"",
    family: "display",
    standardVersion: FOUNDRY_SCALE_STANDARD_VERSION,
    targetAxis: "z",
    targetInches: 3.5,
    targetDimensionMm: inches(3.5),
    preserveProportions: true,
    uniformScaling: true,
    verificationToleranceMm: DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM,
    fileSuffix: "wyrm_3_5in",
    purpose: "Large Wyrm display scale.",
  },
] as const;

export function getScaleProfile(profileId: ScaleProfileId): FoundryScaleProfile {
  const profile = FOUNDRY_SCALE_PROFILES.find((item) => item.profileId === profileId);
  if (!profile) throw new Error(`Unknown Foundry scale profile: ${profileId}`);
  return profile;
}

export function calculateUniformProfileScale(
  boundsMm: { x: number; y: number; z: number },
  profile: FoundryScaleProfile,
): UniformScaleProjection {
  const dimensions = [boundsMm.x, boundsMm.y, boundsMm.z];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Profile scaling requires positive finite geometry bounds on all three axes.");
  }
  const sourceDimensionMm = boundsMm[profile.targetAxis];
  if (!Number.isFinite(sourceDimensionMm) || sourceDimensionMm <= 0) {
    throw new Error(`Profile scaling requires a positive finite ${profile.targetAxis.toUpperCase()} dimension.`);
  }
  if (!profile.preserveProportions || !profile.uniformScaling) {
    throw new Error("Foundry scale profiles require locked uniform XYZ scaling with preserved proportions.");
  }
  const scaleFactor = profile.targetDimensionMm / sourceDimensionMm;
  return {
    profileId: profile.profileId,
    targetAxis: profile.targetAxis,
    targetInches: profile.targetInches,
    targetDimensionMm: profile.targetDimensionMm,
    sourceDimensionMm,
    scaleFactor,
    scaledBoundsMm: {
      x: boundsMm.x * scaleFactor,
      y: boundsMm.y * scaleFactor,
      z: boundsMm.z * scaleFactor,
    },
  };
}

export function scaleDimensionWithinTolerance(measuredMm: number, profile: FoundryScaleProfile): boolean {
  return Math.abs(measuredMm - profile.targetDimensionMm) <= profile.verificationToleranceMm;
}
