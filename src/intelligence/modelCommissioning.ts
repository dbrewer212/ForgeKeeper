import type { ServiceDescriptor } from "../mesh/serviceRegistry";
import { OllamaFoundryProvider, type OllamaStructuredTransport } from "./ollamaProvider";
import type { FoundryModelRouter } from "./modelProvider";
import type { OllamaNativeModelSummary } from "./tauriOllamaTransport";

export interface OllamaCommissioningTransport extends OllamaStructuredTransport {
  listModels(): Promise<OllamaNativeModelSummary[]>;
}

export interface ModelCommissioningStore {
  getService(serviceId: string): ServiceDescriptor | undefined;
  updateService(serviceId: string, patch: Partial<ServiceDescriptor>): ServiceDescriptor;
  persist(): Promise<void>;
}

export interface LocalModelCommissioningStatus {
  providerId: "ollama-local";
  selectedModel?: string;
  registered: boolean;
  serviceCommissioningState?: string;
  serviceRuntimeState?: string;
  configuredAt?: string;
}

export class FoundryModelCommissioning {
  static readonly OLLAMA_SERVICE_ID = "ollama-service";
  static readonly OLLAMA_PROVIDER_ID = "ollama-local";

  constructor(
    private readonly router: FoundryModelRouter,
    private readonly ollama: OllamaCommissioningTransport,
    private readonly store: ModelCommissioningStore,
  ) {}

  status(): LocalModelCommissioningStatus {
    const service = this.store.getService(FoundryModelCommissioning.OLLAMA_SERVICE_ID);
    const selectedModel = readSelectedModel(service);
    const configuredAt = typeof service?.metadata?.modelConfiguredAt === "string"
      ? service.metadata.modelConfiguredAt
      : undefined;
    return {
      providerId: FoundryModelCommissioning.OLLAMA_PROVIDER_ID,
      selectedModel,
      registered: this.router.list().some((provider) => provider.id === FoundryModelCommissioning.OLLAMA_PROVIDER_ID),
      serviceCommissioningState: service?.commissioningState,
      serviceRuntimeState: service?.runtimeState,
      configuredAt,
    };
  }

  listLocalModels(): Promise<OllamaNativeModelSummary[]> {
    return this.ollama.listModels();
  }

  restoreConfiguredProvider(): void {
    const service = this.store.getService(FoundryModelCommissioning.OLLAMA_SERVICE_ID);
    const selectedModel = readSelectedModel(service);
    if (!selectedModel) {
      this.router.unregister(FoundryModelCommissioning.OLLAMA_PROVIDER_ID);
      return;
    }
    this.register(selectedModel);
  }

  async selectLocalModel(model: string): Promise<LocalModelCommissioningStatus> {
    const requested = model.trim();
    if (!requested) throw new Error("A local Ollama model must be selected.");

    const models = await this.ollama.listModels();
    const match = models.find((candidate) => candidate.model === requested || candidate.name === requested);
    if (!match) {
      throw new Error(`Ollama model ${requested} is not present in the current local model inventory.`);
    }
    const canonicalModel = match.model || match.name;
    if (!canonicalModel) throw new Error("Selected Ollama model has no usable model identifier.");

    const service = this.requireOllamaService();
    this.register(canonicalModel);
    this.store.updateService(service.id, {
      metadata: {
        ...service.metadata,
        selectedModel: canonicalModel,
        modelConfiguredAt: new Date().toISOString(),
      },
    });
    await this.store.persist();
    return this.status();
  }

  async clearLocalModel(): Promise<LocalModelCommissioningStatus> {
    const service = this.requireOllamaService();
    this.router.unregister(FoundryModelCommissioning.OLLAMA_PROVIDER_ID);
    this.store.updateService(service.id, {
      metadata: {
        ...service.metadata,
        selectedModel: null,
        modelConfiguredAt: null,
      },
    });
    await this.store.persist();
    return this.status();
  }

  private register(model: string): void {
    this.router.register(new OllamaFoundryProvider(this.ollama, {
      model,
      providerId: FoundryModelCommissioning.OLLAMA_PROVIDER_ID,
      name: "Ollama Local Inference",
      enabled: true,
    }));
  }

  private requireOllamaService(): ServiceDescriptor {
    const service = this.store.getService(FoundryModelCommissioning.OLLAMA_SERVICE_ID);
    if (!service) throw new Error("Ollama service is not registered in the Foundry Mesh.");
    return service;
  }
}

function readSelectedModel(service: ServiceDescriptor | undefined): string | undefined {
  const value = service?.metadata?.selectedModel;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
