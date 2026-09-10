import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

export function registerIntelligenceTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<
    { text: string; focusEntityIds?: string[]; maxEntities?: number },
    unknown
  >(
    {
      name: "intelligence.preview_context",
      capabilityId: MeshCapabilities.worldModelRead,
      description: "Assemble the bounded current-state context packet that Foundry Intelligence would receive for a request, without invoking any model or executing any action.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-intelligence",
        reversibility: "reversible",
        verification: ["Read-only context assembly; no authoritative state mutation occurs."],
        notes: ["World Model remains a derived projection of authoritative Foundry sources."],
      },
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          focusEntityIds: { type: "array", items: { type: "string" } },
          maxEntities: { type: "number" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
    ({ text, focusEntityIds, maxEntities }) => runtime.contextAssembler.assemble({
      text,
      focusEntityIds,
      maxEntities,
    }),
  );

  runtime.tools.register<Record<string, never>, unknown>(
    {
      name: "intelligence.list_skills",
      capabilityId: MeshCapabilities.skillCatalogRead,
      description: "List the governed Mesh skills available for planning, including risk, ownership, reversibility, preconditions, side effects, and verification metadata.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-intelligence",
        reversibility: "reversible",
        verification: ["Read-only projection of currently registered Mesh tools."],
      },
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.skillCatalog.list(),
  );

  runtime.tools.register<{ id: string }, unknown>(
    {
      name: "intelligence.get_skill",
      capabilityId: MeshCapabilities.skillCatalogRead,
      description: "Read one governed skill descriptor by Mesh tool id for planner inspection.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-intelligence",
        reversibility: "reversible",
        verification: ["Read-only projection of a currently registered Mesh tool."],
      },
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    ({ id }) => runtime.skillCatalog.get(id.trim()),
  );
}
