import { MeshCapabilities } from "./catalog";
import type { CommissioningReadinessReport } from "./commissioningDiagnostics";
import type { FoundryMeshRuntime } from "./runtime";

export function registerDiagnosticTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register<Record<string, never>, CommissioningReadinessReport>(
    {
      name: "mesh.commissioning.readiness",
      capabilityId: MeshCapabilities.meshReadState,
      description: "Read deterministic commissioning readiness for staged Foundry services without activating them.",
      risk: "read",
      audit: false,
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.diagnostics.report(),
  );
}
