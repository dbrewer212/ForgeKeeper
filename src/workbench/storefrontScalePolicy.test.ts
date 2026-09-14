import { describe, expect, it } from "vitest";
import type { FoundryAsset, InspectionResult } from "./contracts";
import { calculateUniformStorefrontScale, recommendStorefrontScale } from "./storefrontScalePolicy";

function asset(overrides: Partial<FoundryAsset> = {}): FoundryAsset {
  return {
    assetId: "asset:test",
    name: "Test Model",
    assetType: "character",
    lifecycleStatus: "registered",
    provenance: { sourceType: "manual" },
    tags: [],
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function inspection(triangleCount: number, shellCount = 1): InspectionResult {
  return {
    inspectionResultId: "inspection:test",
    assetId: "asset:test",
    revisionId: "revision:test",
    engineId: "test",
    engineVersion: "1",
    geometry: {
      boundsMm: { x: 400, y: 300, z: 500 },
      triangleCount,
      shellCount,
    },
    findings: [],
    machineCompatibility: [],
    createdAt: "2026-09-14T00:00:00.000Z",
  };
}

describe("digital storefront scale policy", () => {
  it("keeps simple models in the compact 3-inch tier", () => {
    expect(recommendStorefrontScale(asset(), inspection(45_000)).targetInches).toBe(3);
  });

  it("moves moderate-detail models to 4 inches", () => {
    expect(recommendStorefrontScale(asset(), inspection(100_000)).targetInches).toBe(4);
  });

  it("moves high-detail or heavily multipart models to 5 inches", () => {
    expect(recommendStorefrontScale(asset(), inspection(260_000, 5)).targetInches).toBe(5);
  });

  it("honors an explicit storefront tier tag", () => {
    const result = recommendStorefrontScale(asset({ tags: ["storefront-5in"] }), inspection(20_000));
    expect(result.targetInches).toBe(5);
    expect(result.source).toBe("explicit-tag");
  });

  it("uniformly scales the longest dimension to the requested storefront envelope", () => {
    const projection = calculateUniformStorefrontScale({ x: 400, y: 300, z: 500 }, 5);
    expect(projection.targetMaxMm).toBeCloseTo(127);
    expect(projection.scaleFactor).toBeCloseTo(0.254);
    expect(projection.scaledBoundsMm.x).toBeCloseTo(101.6);
    expect(projection.scaledBoundsMm.y).toBeCloseTo(76.2);
    expect(projection.scaledBoundsMm.z).toBeCloseTo(127);
  });
});
