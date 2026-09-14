import type { FoundryAsset, InspectionResult } from "./contracts";

export type StorefrontScaleTier = 3 | 4 | 5;

export type StorefrontScaleRecommendation = {
  targetInches: StorefrontScaleTier;
  targetMaxMm: number;
  score: number;
  reasons: string[];
  source: "automatic" | "explicit-tag";
};

export type UniformScaleProjection = {
  targetInches: StorefrontScaleTier;
  targetMaxMm: number;
  sourceMaxMm: number;
  scaleFactor: number;
  scaledBoundsMm: { x: number; y: number; z: number };
};

const MILLIMETERS_PER_INCH = 25.4;

export function targetMaxMmForTier(tier: StorefrontScaleTier): number {
  return tier * MILLIMETERS_PER_INCH;
}

function hasAnyTag(tags: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => tags.has(candidate));
}

export function recommendStorefrontScale(asset: FoundryAsset, inspection: InspectionResult): StorefrontScaleRecommendation {
  const tags = new Set(asset.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  for (const tier of [5, 4, 3] as StorefrontScaleTier[]) {
    if (tags.has(`storefront-${tier}in`) || tags.has(`storefront-${tier}-inch`)) {
      return {
        targetInches: tier,
        targetMaxMm: targetMaxMmForTier(tier),
        score: tier === 5 ? 3 : tier === 4 ? 1 : 0,
        reasons: [`Asset tag explicitly requests the ${tier}-inch digital storefront tier.`],
        source: "explicit-tag",
      };
    }
  }

  let score = 0;
  const reasons: string[] = [];
  const triangles = inspection.geometry.triangleCount ?? 0;
  const shells = inspection.geometry.shellCount ?? inspection.geometry.disconnectedShellCount ?? 1;

  if (triangles >= 200_000) {
    score += 2;
    reasons.push(`High geometric detail (${triangles.toLocaleString()} triangles).`);
  } else if (triangles >= 80_000) {
    score += 1;
    reasons.push(`Moderate geometric detail (${triangles.toLocaleString()} triangles).`);
  }

  if (shells >= 8) {
    score += 2;
    reasons.push(`Highly multipart geometry (${shells} shells).`);
  } else if (shells >= 4) {
    score += 1;
    reasons.push(`Multipart geometry (${shells} shells).`);
  }

  if (asset.assetType === "assembly") {
    score += 1;
    reasons.push("Assembly assets receive extra display size for readable part relationships.");
  }

  if (hasAnyTag(tags, ["high-detail", "showcase", "complex", "display-detail"])) {
    score += 2;
    reasons.push("Asset metadata marks this as a high-detail/showcase model.");
  }
  if (hasAnyTag(tags, ["multipart", "vehicle", "prop-heavy", "accessory-heavy"])) {
    score += 1;
    reasons.push("Asset metadata indicates multipart or prop-heavy geometry.");
  }
  if (hasAnyTag(tags, ["simple", "low-detail", "small-display"])) {
    score -= 1;
    reasons.push("Asset metadata marks this as a simpler/smaller display model.");
  }

  const targetInches: StorefrontScaleTier = score >= 3 ? 5 : score >= 1 ? 4 : 3;
  if (!reasons.length) reasons.push("No high-detail signals were detected, so the compact storefront tier is preferred.");

  return {
    targetInches,
    targetMaxMm: targetMaxMmForTier(targetInches),
    score,
    reasons,
    source: "automatic",
  };
}

export function calculateUniformStorefrontScale(
  boundsMm: { x: number; y: number; z: number },
  targetInches: StorefrontScaleTier,
): UniformScaleProjection {
  const dimensions = [boundsMm.x, boundsMm.y, boundsMm.z];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Storefront scaling requires positive finite geometry bounds on all three axes.");
  }
  const sourceMaxMm = Math.max(...dimensions);
  const targetMaxMm = targetMaxMmForTier(targetInches);
  const scaleFactor = targetMaxMm / sourceMaxMm;
  return {
    targetInches,
    targetMaxMm,
    sourceMaxMm,
    scaleFactor,
    scaledBoundsMm: {
      x: boundsMm.x * scaleFactor,
      y: boundsMm.y * scaleFactor,
      z: boundsMm.z * scaleFactor,
    },
  };
}
