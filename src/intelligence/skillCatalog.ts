import type { FoundryToolDefinition, ToolReversibility } from "../mesh/toolGateway";
import type { ActionRisk } from "../mesh/types";

export interface FoundrySkillDescriptor {
  id: string;
  capabilityId: string;
  description: string;
  risk: ActionRisk;
  enabled: boolean;
  owner: string;
  reversibility: ToolReversibility;
  preconditions: string[];
  sideEffects: string[];
  verification: string[];
  notes: string[];
  inputSchema?: FoundryToolDefinition["inputSchema"];
  outputSchema?: FoundryToolDefinition["outputSchema"];
}

export class FoundrySkillCatalog {
  constructor(private readonly listTools: () => FoundryToolDefinition[]) {}

  list(): FoundrySkillDescriptor[] {
    return this.listTools()
      .map((tool) => this.fromTool(tool))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): FoundrySkillDescriptor | undefined {
    return this.list().find((skill) => skill.id === id);
  }

  private fromTool(tool: FoundryToolDefinition): FoundrySkillDescriptor {
    return {
      id: tool.name,
      capabilityId: tool.capabilityId,
      description: tool.description,
      risk: tool.risk,
      enabled: tool.enabled !== false,
      owner: tool.operational?.owner ?? "unassigned",
      reversibility: tool.operational?.reversibility ?? "unknown",
      preconditions: [...(tool.operational?.preconditions ?? [])],
      sideEffects: [...(tool.operational?.sideEffects ?? [])],
      verification: [...(tool.operational?.verification ?? [])],
      notes: [...(tool.operational?.notes ?? [])],
      inputSchema: tool.inputSchema ? structuredClone(tool.inputSchema) : undefined,
      outputSchema: tool.outputSchema ? structuredClone(tool.outputSchema) : undefined,
    };
  }
}
