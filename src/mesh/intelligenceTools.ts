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
}
