import { describe, expect, it } from "vitest";
import { MeshCapabilities } from "./catalog";
import { defaultPermissionRules } from "./defaultPolicies";
import { InMemoryPermissionService } from "./permissionService";
import type { WorkerIdentity } from "./types";
import { FoundryWorkers } from "./workers";

function commissionedIntelligence(): WorkerIdentity {
  return {
    ...FoundryWorkers.foundryIntelligence,
    enabled: true,
    commissioningState: "active",
  };
}

describe("Foundry Intelligence policy", () => {
  it("allows context and governed skill discovery once the worker is commissioned", () => {
    const permissions = new InMemoryPermissionService(defaultPermissionRules);
    const intelligence = commissionedIntelligence();

    expect(permissions.evaluate(intelligence, MeshCapabilities.meshReadState).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.worldModelRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.skillCatalogRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.foundryProjectRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.foundryCanonRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.productionRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.foundrySessionRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.foundryDecisionRead).effect).toBe("allow");
    expect(permissions.evaluate(intelligence, MeshCapabilities.watcherReadTelemetry).effect).toBe("allow");
  });

  it("does not advertise authoritative writes or workstation execution", () => {
    const permissions = new InMemoryPermissionService(defaultPermissionRules);
    const intelligence = commissionedIntelligence();

    expect(permissions.evaluate(intelligence, MeshCapabilities.foundryCanonWrite).effect).toBe("deny");
    expect(permissions.evaluate(intelligence, MeshCapabilities.productionWrite).effect).toBe("deny");
    expect(permissions.evaluate(intelligence, MeshCapabilities.workstationLaunchTool).effect).toBe("deny");
    expect(permissions.evaluate(intelligence, MeshCapabilities.systemServiceRestart).effect).toBe("deny");
  });
});
