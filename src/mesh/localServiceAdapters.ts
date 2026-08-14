import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./persistence";
import type { FoundryMeshRuntime } from "./runtime";
import type { ManagedServiceAdapter } from "./serviceLifecycle";
import type { ServiceDescriptor } from "./serviceRegistry";

interface LocalHttpResponse {
  status: number;
  body: string;
}

interface ManagedProcessStatus {
  service_id: string;
  running: boolean;
  pid?: number;
}

export interface LocalServiceControlConfig {
  executable?: string;
  args?: string[];
  workingDirectory?: string;
  probeUrl?: string;
  timeoutMs?: number;
  externallyManaged?: boolean;
  owner?: string;
}

export class TauriManagedProcessAdapter implements ManagedServiceAdapter {
  validate(service: ServiceDescriptor): string[] {
    const issues: string[] = [];
    const config = readControlConfig(service);

    if (!isTauriRuntime()) {
      issues.push("Tauri runtime is not available; local service control can only be commissioned in the desktop Foundry runtime.");
    }

    const probeUrl = resolveProbeUrl(service, config);
    if (probeUrl && !isAllowedLoopbackUrl(probeUrl)) {
      issues.push("Managed service probe URL must use http://localhost or http://127.0.0.1.");
    }

    if (config.externallyManaged) {
      if (!probeUrl) {
        issues.push("Externally managed service requires a loopback probe URL.");
      }
    } else if (!config.executable?.trim()) {
      issues.push("Managed service executable is not configured in metadata.localControl.executable.");
    }

    return issues;
  }

  async start(service: ServiceDescriptor): Promise<void> {
    this.assertReady(service);
    const config = readControlConfig(service);
    const probeUrl = resolveProbeUrl(service, config);

    if (probeUrl) {
      const existing = await probeUrlOnline(probeUrl, config.timeoutMs).catch(() => false);
      if (existing) return;
    }

    if (config.externallyManaged) {
      const owner = config.owner?.trim() || "external service manager";
      throw new Error(`Externally managed service ${service.id} is not online. Start it through ${owner} before commissioning.`);
    }

    await invoke<ManagedProcessStatus>("managed_service_start", {
      serviceId: service.id,
      executable: config.executable,
      args: config.args ?? [],
      workingDirectory: config.workingDirectory,
    });

    if (probeUrl) {
      const online = await probeUrlOnline(probeUrl, config.timeoutMs);
      if (!online) {
        throw new Error(`Managed service ${service.id} started a process but did not pass its loopback health probe.`);
      }
    }
  }

  async stop(service: ServiceDescriptor): Promise<void> {
    const config = readControlConfig(service);
    if (config.externallyManaged) {
      const owner = config.owner?.trim() || "external service manager";
      throw new Error(`Service ${service.id} is externally managed by ${owner}; direct process stop is intentionally not owned by this adapter.`);
    }
    if (!isTauriRuntime()) {
      throw new Error(`Cannot stop managed service ${service.id} outside the Tauri desktop runtime.`);
    }
    await invoke<ManagedProcessStatus>("managed_service_stop", { serviceId: service.id });
  }

  async restart(service: ServiceDescriptor): Promise<void> {
    const config = readControlConfig(service);
    if (config.externallyManaged) {
      const owner = config.owner?.trim() || "external service manager";
      throw new Error(`Service ${service.id} is externally managed by ${owner}; restart must be requested through its owning service manager.`);
    }
    await this.stop(service);
    await this.start(service);
  }

  async probe(service: ServiceDescriptor): Promise<{ online: boolean; detail?: string }> {
    if (!isTauriRuntime()) {
      return { online: false, detail: "Tauri desktop runtime is unavailable." };
    }

    const config = readControlConfig(service);
    const probeUrl = resolveProbeUrl(service, config);
    if (probeUrl) {
      try {
        const response = await invoke<LocalHttpResponse>("local_http_get", {
          url: probeUrl,
          timeoutMs: normalizeTimeout(config.timeoutMs),
        });
        const ownerDetail = config.externallyManaged
          ? ` Externally managed by ${config.owner?.trim() || "service manager"}.`
          : "";
        return {
          online: response.status >= 200 && response.status < 500,
          detail: `Loopback probe returned HTTP ${response.status}.${ownerDetail}`,
        };
      } catch (error) {
        return { online: false, detail: error instanceof Error ? error.message : String(error) };
      }
    }

    if (config.externallyManaged) {
      return { online: false, detail: "Externally managed service has no configured loopback probe." };
    }

    try {
      const status = await invoke<ManagedProcessStatus>("managed_service_status", { serviceId: service.id });
      return {
        online: status.running,
        detail: status.running
          ? `Managed process is running${status.pid ? ` with PID ${status.pid}` : ""}.`
          : "Managed process is not running.",
      };
    } catch (error) {
      return { online: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private assertReady(service: ServiceDescriptor): void {
    const issues = this.validate(service);
    if (issues.length > 0) throw new Error(issues.join(" "));
  }
}

export class UnboundServiceAdapter implements ManagedServiceAdapter {
  constructor(private readonly reason = "Runtime implementation has not been bound to this staged service yet.") {}

  validate(): string[] {
    return [this.reason];
  }

  async start(service: ServiceDescriptor): Promise<void> {
    throw new Error(`Service ${service.id} cannot start: ${this.reason}`);
  }

  async stop(service: ServiceDescriptor): Promise<void> {
    throw new Error(`Service ${service.id} cannot stop through the Mesh: ${this.reason}`);
  }

  async probe(service: ServiceDescriptor): Promise<{ online: boolean; detail?: string }> {
    return { online: false, detail: `Service ${service.id}: ${this.reason}` };
  }
}

export function registerStagedServiceAdapters(runtime: FoundryMeshRuntime): void {
  for (const service of runtime.services.list()) {
    if (service.adapterRequired === false || service.id === "foundry-domain") continue;

    if (isLocalProcessCandidate(service)) {
      runtime.serviceLifecycle.registerAdapter(service.id, new TauriManagedProcessAdapter());
      continue;
    }

    runtime.serviceLifecycle.registerAdapter(
      service.id,
      new UnboundServiceAdapter(`No concrete runtime adapter has been bound for ${service.name}.`),
    );
  }
}

function isLocalProcessCandidate(service: ServiceDescriptor): boolean {
  return service.kind === "inference" || service.kind === "automation" || service.kind === "workspace" || service.kind === "monitoring";
}

function readControlConfig(service: ServiceDescriptor): LocalServiceControlConfig {
  const raw = service.metadata?.localControl;
  if (!raw || typeof raw !== "object") return {};
  const candidate = raw as Record<string, unknown>;

  return {
    executable: typeof candidate.executable === "string" ? candidate.executable : undefined,
    args: Array.isArray(candidate.args) ? candidate.args.filter((value): value is string => typeof value === "string") : undefined,
    workingDirectory: typeof candidate.workingDirectory === "string" ? candidate.workingDirectory : undefined,
    probeUrl: typeof candidate.probeUrl === "string" ? candidate.probeUrl : undefined,
    timeoutMs: typeof candidate.timeoutMs === "number" ? candidate.timeoutMs : undefined,
    externallyManaged: candidate.externallyManaged === true,
    owner: typeof candidate.owner === "string" ? candidate.owner : undefined,
  };
}

function resolveProbeUrl(service: ServiceDescriptor, config: LocalServiceControlConfig): string | undefined {
  if (config.probeUrl?.trim()) return config.probeUrl.trim();
  if (!service.endpoint?.trim()) return undefined;

  const endpoint = service.endpoint.replace(/\/$/, "");
  const healthPath = service.healthPath?.trim();
  if (!healthPath) return endpoint;
  return `${endpoint}/${healthPath.replace(/^\//, "")}`;
}

function isAllowedLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) return 1500;
  return Math.max(100, Math.min(10_000, Math.floor(timeoutMs ?? 1500)));
}

async function probeUrlOnline(url: string, timeoutMs: number | undefined): Promise<boolean> {
  const response = await invoke<LocalHttpResponse>("local_http_get", {
    url,
    timeoutMs: normalizeTimeout(timeoutMs),
  });
  return response.status >= 200 && response.status < 500;
}
