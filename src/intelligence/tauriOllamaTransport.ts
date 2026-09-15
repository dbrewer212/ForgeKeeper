import { invoke } from "@tauri-apps/api/core";
import type { OllamaStructuredRequest, OllamaStructuredTransport } from "./ollamaProvider";

export interface OllamaNativeProbeResult {
  available: boolean;
  detail: string;
  modelCount: number;
}

export interface OllamaNativeModelSummary {
  name: string;
  model: string;
  modifiedAt?: string;
  size?: number;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaNativeInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export class TauriOllamaTransport implements OllamaStructuredTransport {
  constructor(private readonly nativeInvoke: OllamaNativeInvoker = invoke) {}

  async probe(): Promise<{ available: boolean; detail?: string }> {
    try {
      const result = await this.nativeInvoke<OllamaNativeProbeResult>("ollama_probe");
      return { available: result.available, detail: result.detail };
    } catch (error) {
      return { available: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async listModels(): Promise<OllamaNativeModelSummary[]> {
    return this.nativeInvoke<OllamaNativeModelSummary[]>("ollama_list_models");
  }

  generateStructured(request: OllamaStructuredRequest): Promise<unknown> {
    return this.nativeInvoke("ollama_generate_structured", { request });
  }
}
