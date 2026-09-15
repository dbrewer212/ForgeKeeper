import type { ExperienceCategory } from "../intelligence/experienceMemory";
import { MeshCapabilities } from "./catalog";
import type { FoundryMeshRuntime } from "./runtime";

const categories: ExperienceCategory[] = ["incident", "action", "system", "production", "change", "other"];

export function registerExperienceTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<{ limit?: number }, unknown>(
    {
      name: "experience.recent",
      capabilityId: MeshCapabilities.experienceRead,
      description: "Read a bounded newest-first projection of durable Foundry events as operational experience records. Raw event payloads are not exposed.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        verification: ["Read-only projection over the durable Mesh event journal."],
        notes: ["Experience Memory never rewrites authoritative historical events."],
      },
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
        additionalProperties: false,
      },
    },
    ({ limit }) => runtime.experience.recent(limit),
  );

  runtime.tools.register<{
    query?: string;
    limit?: number;
    category?: ExperienceCategory;
    subjectId?: string;
    correlationId?: string;
  }, unknown>(
    {
      name: "experience.search",
      capabilityId: MeshCapabilities.experienceRead,
      description: "Search bounded derived operational experience by text, category, subject, or correlation id without exposing raw event payloads.",
      risk: "read",
      audit: false,
      operational: {
        owner: "foundry-core",
        reversibility: "reversible",
        verification: ["Results are deterministically projected from matching recent durable Mesh events."],
      },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          category: { type: "string", enum: categories },
          subjectId: { type: "string" },
          correlationId: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    (request) => runtime.experience.search(request),
  );
}
