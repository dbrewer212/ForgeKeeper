export const FOUNDRY_LINK_FORMAT = "forgekeeper.foundry-link";
export const FOUNDRY_LINK_SCHEMA_VERSION = 4 as const;

/**
 * Produce the identity used for durable workspace conflict detection.
 * Control-plane messages deliberately do not participate: a telemetry request,
 * approval, or command result must never look like an AppData/Mesh/Workbench edit.
 */
export function canonicalFoundryLinkPayload(payload: string): string {
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  if (parsed.format !== FOUNDRY_LINK_FORMAT) return JSON.stringify(parsed);

  const canonical = { ...parsed };
  delete canonical.remoteCommands;
  delete canonical.remoteCommandResults;
  return JSON.stringify(canonical);
}
