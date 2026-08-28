import { describe, expect, it } from "vitest";
import { DefaultHealthAggregator } from "./healthAggregator";
import { InMemoryResourceBroker } from "./resourceBroker";
import { ServiceRegistry, type ServiceDescriptor } from "./serviceRegistry";
import { InMemoryWorkerRegistry } from "./workerRegistry";

function service(patch: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
  return {
    id: "test-service",
    name: "Test Service",
    kind: "automation",
    commissioningState: "active",
    runtimeState: "online",
    enabled: true,
    dependencies: [],
    ...patch,
  };
}

function healthFor(serviceDescriptor: ServiceDescriptor) {
  const workers = new InMemoryWorkerRegistry();
  const resources = new InMemoryResourceBroker();
  const services = new ServiceRegistry();
  services.register(serviceDescriptor);
  return new DefaultHealthAggregator(workers, resources, services).evaluate();
}

describe("Foundry managed service health", () => {
  it("keeps dormant offline services nominal", () => {
    const health = healthFor(service({ commissioningState: "dormant", runtimeState: "offline", enabled: false }));
    expect(health.state).toBe("nominal");
  });

  it("marks an active offline service degraded", () => {
    const health = healthFor(service({ commissioningState: "active", runtimeState: "offline" }));
    expect(health.state).toBe("degraded");
    expect(health.summary).toContain("managed service");
  });

  it("marks a failed managed service critical", () => {
    const health = healthFor(service({ runtimeState: "failed" }));
    expect(health.state).toBe("critical");
    expect(health.summary).toContain("immediate attention");
  });

  it("reports a starting active service as busy", () => {
    const health = healthFor(service({ runtimeState: "starting" }));
    expect(health.state).toBe("busy");
  });
});
