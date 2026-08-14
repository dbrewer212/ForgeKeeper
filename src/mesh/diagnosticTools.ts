import { MeshCapabilities } from "./catalog";
import type { CommissioningReadinessReport } from "./commissioningDiagnostics";
import {
  runCommissioningVerification,
  type CommissioningVerificationOptions,
  type CommissioningVerificationReport,
} from "./commissioningVerification";
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

  runtime.tools.register<CommissioningVerificationOptions, CommissioningVerificationReport>(
    {
      name: "mesh.commissioning.verify",
      capabilityId: MeshCapabilities.meshReadState,
      description:
        "Run non-destructive Foundry commissioning verification. Optional liveProbes performs localhost-only service health probes without changing commissioning state.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: {
          liveProbes: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
    (payload) => runCommissioningVerification(runtime, payload),
  );
}
