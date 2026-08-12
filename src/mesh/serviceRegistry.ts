import type { CommissioningState } from "./types";

export type ServiceKind =
  | "inference"
  | "automation"
  | "workspace"
  | "supervisory"
  | "monitoring"
  | "domain"
  | "adapter"
  | "other";

export type ServiceRuntimeState = "offline" | "starting" | "online" | "degraded" | "stopping" | "failed";

export interface ServiceDescriptor {
  id: string;
  name: string;
  kind: ServiceKind;
  description?: string;
  commissioningState: CommissioningState;
  runtimeState: ServiceRuntimeState;
  enabled: boolean;
  workerId?: string;
  endpoint?: string;
  dependencies: string[];
  healthPath?: string;
  metadata?: Record<string, unknown>;
}

export class ServiceRegistry {
  private readonly services = new Map<string, ServiceDescriptor>();

  register(service: ServiceDescriptor): void {
    this.services.set(service.id, structuredClone(service));
  }

  update(serviceId: string, patch: Partial<ServiceDescriptor>): ServiceDescriptor {
    const current = this.services.get(serviceId);
    if (!current) throw new Error(`Service ${serviceId} is not registered.`);
    const next = { ...current, ...patch, id: current.id };
    this.services.set(serviceId, structuredClone(next));
    return structuredClone(next);
  }

  get(serviceId: string): ServiceDescriptor | undefined {
    const service = this.services.get(serviceId);
    return service ? structuredClone(service) : undefined;
  }

  list(): ServiceDescriptor[] {
    return [...this.services.values()].map((service) => structuredClone(service));
  }

  dependenciesSatisfied(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) return false;
    return service.dependencies.every((dependencyId) => {
      const dependency = this.services.get(dependencyId);
      return dependency?.commissioningState === "active" && dependency.runtimeState === "online";
    });
  }
}

export const defaultFoundryServices: ServiceDescriptor[] = [
  {
    id: "foundry-domain",
    name: "Foundry Domain Services",
    kind: "domain",
    description: "Canonical project, production, asset, inventory, canon, decision, and session service boundary.",
    commissioningState: "configured",
    runtimeState: "offline",
    enabled: false,
    dependencies: [],
  },
  {
    id: "ollama-service",
    name: "Ollama Local Inference",
    kind: "inference",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "ollama",
    endpoint: "http://127.0.0.1:11434",
    dependencies: [],
  },
  {
    id: "openclaw-service",
    name: "OpenClaw Automation Runtime",
    kind: "automation",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "openclaw",
    dependencies: ["foundry-domain"],
  },
  {
    id: "odysseus-service",
    name: "Odysseus Workspace",
    kind: "workspace",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "odysseus",
    dependencies: ["foundry-domain"],
  },
  {
    id: "watcher-service",
    name: "Watcher Monitoring",
    kind: "monitoring",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "watcher",
    dependencies: [],
  },
  {
    id: "bastion-service",
    name: "Bastion Supervisory Surface",
    kind: "supervisory",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "bastion",
    dependencies: ["foundry-domain"],
  },
  {
    id: "production-steward-service",
    name: "Production Steward",
    kind: "adapter",
    commissioningState: "dormant",
    runtimeState: "offline",
    enabled: false,
    workerId: "production-steward",
    dependencies: ["foundry-domain"],
  },
];
