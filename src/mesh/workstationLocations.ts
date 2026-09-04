export type TrustedWorkstationLocationId = "foundry-library" | "asset-root";

const locations = new Map<TrustedWorkstationLocationId, string>();

export function configureTrustedWorkstationLocations(values: Partial<Record<TrustedWorkstationLocationId, string | undefined>>): void {
  locations.clear();
  for (const [id, value] of Object.entries(values) as Array<[TrustedWorkstationLocationId, string | undefined]>) {
    const path = value?.trim();
    if (path) locations.set(id, path);
  }
}

export function resolveTrustedWorkstationLocation(locationId: string): string {
  if (locationId !== "foundry-library" && locationId !== "asset-root") {
    throw new Error(`Unknown managed Foundry location '${locationId}'.`);
  }
  const path = locations.get(locationId);
  if (!path) {
    throw new Error(`Managed Foundry location '${locationId}' is not configured on this workstation.`);
  }
  return path;
}

export function clearTrustedWorkstationLocationsForTests(): void {
  locations.clear();
}
