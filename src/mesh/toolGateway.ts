import type { ActionHandler, CoordinatedAction } from "./actionCoordinator";
import type { FoundryMeshRuntime } from "./runtime";
import type { ActionRequest, ActionRisk } from "./types";

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface FoundryToolDefinition {
  name: string;
  capabilityId: string;
  description: string;
  risk: ActionRisk;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  enabled?: boolean;
  audit?: boolean;
}

export interface ToolInvocation<TPayload = unknown> {
  toolName: string;
  requesterWorkerId: string;
  payload: TPayload;
  reason?: string;
  correlationId?: string;
}

export interface ToolInvocationResult<TPayload = unknown> extends CoordinatedAction<TPayload> {
  tool: FoundryToolDefinition;
  approvalId?: string;
}

export class FoundryToolGateway {
  private readonly tools = new Map<string, FoundryToolDefinition>();

  constructor(private readonly runtime: FoundryMeshRuntime) {}

  register<TPayload, TResult>(
    definition: FoundryToolDefinition,
    handler: ActionHandler<TPayload, TResult>,
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Foundry tool ${definition.name} is already registered.`);
    }

    this.tools.set(definition.name, { ...definition, enabled: definition.enabled ?? true, audit: definition.audit ?? true });
    this.runtime.coordinator.registerHandler(definition.name, handler);
  }

  unregister(toolName: string): void {
    if (!this.tools.has(toolName)) return;
    this.tools.delete(toolName);
    this.runtime.coordinator.unregisterHandler(toolName);
  }

  get(toolName: string): FoundryToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  list(): FoundryToolDefinition[] {
    return [...this.tools.values()];
  }

  async invoke<TPayload>(invocation: ToolInvocation<TPayload>): Promise<ToolInvocationResult<TPayload>> {
    const tool = this.tools.get(invocation.toolName);
    if (!tool) throw new Error(`Foundry tool ${invocation.toolName} is not registered.`);
    if (tool.enabled === false) throw new Error(`Foundry tool ${invocation.toolName} is disabled.`);

    const request: ActionRequest<TPayload> = {
      id: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      requesterWorkerId: invocation.requesterWorkerId,
      capabilityId: tool.capabilityId,
      operationId: tool.name,
      risk: tool.risk,
      payload: invocation.payload,
      state: "requested",
      reason: invocation.reason,
      correlationId: invocation.correlationId,
      audit: tool.audit,
    };

    const coordinated = await this.runtime.coordinator.submit(request);
    return {
      tool,
      ...coordinated,
      approvalId: coordinated.evaluation.approval?.id,
    };
  }
}
