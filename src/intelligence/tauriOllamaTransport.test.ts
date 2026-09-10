import { describe, expect, it } from "vitest";
import { TauriOllamaTransport, type OllamaNativeInvoker } from "./tauriOllamaTransport";

function invoker(responses: Record<string, unknown>): OllamaNativeInvoker {
  return async <T>(command: string, _args?: Record<string, unknown>) => {
    if (!(command in responses)) throw new Error(`unexpected command ${command}`);
    return responses[command] as T;
  };
}

describe("TauriOllamaTransport", () => {
  it("probes and lists local models through fixed native commands", async () => {
    const transport = new TauriOllamaTransport(invoker({
      ollama_probe: { available: true, detail: "Ollama reachable", modelCount: 2 },
      ollama_list_models: [{ name: "model-a", model: "model-a", parameterSize: "8B" }],
    }));

    await expect(transport.probe()).resolves.toEqual({ available: true, detail: "Ollama reachable" });
    await expect(transport.listModels()).resolves.toEqual([{ name: "model-a", model: "model-a", parameterSize: "8B" }]);
  });

  it("forwards only the structured request object to the native generation command", async () => {
    let capturedCommand = "";
    let capturedArgs: Record<string, unknown> | undefined;
    const nativeInvoke: OllamaNativeInvoker = async <T>(command: string, args?: Record<string, unknown>) => {
      capturedCommand = command;
      capturedArgs = args;
      return { response: "ok" } as T;
    };
    const transport = new TauriOllamaTransport(nativeInvoke);
    const request = { model: "local-model", system: "system", prompt: "prompt", schema: { type: "object" } };

    await transport.generateStructured(request);

    expect(capturedCommand).toBe("ollama_generate_structured");
    expect(capturedArgs).toEqual({ request });
  });

  it("fails probe closed when native invocation is unavailable", async () => {
    const transport = new TauriOllamaTransport(async () => { throw new Error("Tauri unavailable"); });
    await expect(transport.probe()).resolves.toEqual({ available: false, detail: "Tauri unavailable" });
  });
});
