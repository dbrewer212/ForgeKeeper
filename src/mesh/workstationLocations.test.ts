import { afterEach, describe, expect, it } from "vitest";
import {
  clearTrustedWorkstationLocationsForTests,
  configureTrustedWorkstationLocations,
  resolveTrustedWorkstationLocation,
} from "./workstationLocations";

afterEach(() => clearTrustedWorkstationLocationsForTests());

describe("trusted workstation locations", () => {
  it("resolves only host-configured Foundry location ids", () => {
    configureTrustedWorkstationLocations({
      "foundry-library": "C:\\Foundry Library",
      "asset-root": "D:\\Foundry Assets",
    });

    expect(resolveTrustedWorkstationLocation("foundry-library")).toBe("C:\\Foundry Library");
    expect(resolveTrustedWorkstationLocation("asset-root")).toBe("D:\\Foundry Assets");
  });

  it("rejects unknown and unconfigured ids instead of accepting a remote path", () => {
    configureTrustedWorkstationLocations({ "foundry-library": "C:\\Foundry Library" });

    expect(() => resolveTrustedWorkstationLocation("C:\\Windows\\System32")).toThrow(/Unknown managed Foundry location/);
    expect(() => resolveTrustedWorkstationLocation("asset-root")).toThrow(/not configured/);
  });
});
