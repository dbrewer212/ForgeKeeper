import { describe, expect, it } from "vitest";
import {
  calculateUniformProfileScale,
  DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM,
  FOUNDRY_SCALE_PROFILES,
  FOUNDRY_SCALE_STANDARD_VERSION,
  getScaleProfile,
  scaleDimensionWithinTolerance,
} from "./storefrontScalePolicy";

describe("Foundry scale profiles", () => {
  it("defines the Foundry Goblin display profile at 4 inches on Z", () => {
    const profile = getScaleProfile("foundry-goblin-display");
    expect(profile.label).toBe("Foundry Goblin — Display");
    expect(profile.standardVersion).toBe(FOUNDRY_SCALE_STANDARD_VERSION);
    expect(profile.targetAxis).toBe("z");
    expect(profile.targetInches).toBe(4);
    expect(profile.targetDimensionMm).toBeCloseTo(101.6);
    expect(profile.preserveProportions).toBe(true);
    expect(profile.uniformScaling).toBe(true);
    expect(profile.verificationToleranceMm).toBe(DEFAULT_SCALE_VERIFICATION_TOLERANCE_MM);
  });

  it("defines the requested Wyrm display sizes under the same locked standard", () => {
    const wyrmProfiles = FOUNDRY_SCALE_PROFILES.filter((profile) => profile.profileId.startsWith("wyrm-display"));
    expect(wyrmProfiles.map((profile) => profile.targetInches)).toEqual([2.5, 3, 3.5]);
    expect(wyrmProfiles.every((profile) =>
      profile.targetAxis === "z"
      && profile.preserveProportions
      && profile.uniformScaling
      && profile.standardVersion === FOUNDRY_SCALE_STANDARD_VERSION
    )).toBe(true);
  });

  it("calculates Fisher's 1282.64 mm Z height to roughly 7.92 percent for the 4 inch profile", () => {
    const profile = getScaleProfile("foundry-goblin-display");
    const projection = calculateUniformProfileScale({ x: 600, y: 750, z: 1282.64 }, profile);
    expect(projection.scaleFactor).toBeCloseTo(101.6 / 1282.64, 8);
    expect(projection.scaleFactor * 100).toBeCloseTo(7.92, 2);
    expect(projection.scaledBoundsMm.x).toBeCloseTo(600 * projection.scaleFactor);
    expect(projection.scaledBoundsMm.y).toBeCloseTo(750 * projection.scaleFactor);
    expect(projection.scaledBoundsMm.z).toBeCloseTo(101.6);
  });

  it("targets the profile axis rather than the model's longest dimension", () => {
    const profile = getScaleProfile("foundry-goblin-display");
    const projection = calculateUniformProfileScale({ x: 1600, y: 400, z: 800 }, profile);
    expect(projection.scaleFactor).toBeCloseTo(101.6 / 800);
    expect(projection.scaledBoundsMm.z).toBeCloseTo(101.6);
    expect(projection.scaledBoundsMm.x).toBeGreaterThan(101.6);
  });

  it("enforces the stable dimensional tolerance around the profile target", () => {
    const profile = getScaleProfile("foundry-goblin-display");
    expect(scaleDimensionWithinTolerance(101.6, profile)).toBe(true);
    expect(scaleDimensionWithinTolerance(101.69, profile)).toBe(true);
    expect(scaleDimensionWithinTolerance(101.71, profile)).toBe(false);
  });
});
