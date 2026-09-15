import { describe, expect, it } from "vitest";
import type { WatcherObservation } from "./contracts";
import { WatcherFindingEngine } from "./findingEngine";

function observation(domain: WatcherObservation["domain"], value: unknown, observedAt = "2026-09-10T16:30:00.000Z"): WatcherObservation {
  return {
    id: `${domain}:${observedAt}`,
    providerId: `windows-${domain}`,
    observedAt,
    domain,
    availability: "available",
    value,
  };
}

describe("WatcherFindingEngine", () => {
  it("opens and resolves memory pressure without repeating unchanged findings", () => {
    const engine = new WatcherFindingEngine();

    const opened = engine.evaluate([
      observation("memory", { sampledAt: "x", totalBytes: 100, usedBytes: 95, availableBytes: 5 }),
    ]);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.kind).toBe("opened");
    expect(opened[0]?.finding.code).toBe("memory.pressure");
    expect(opened[0]?.finding.severity).toBe("warning");

    const unchanged = engine.evaluate([
      observation("memory", { sampledAt: "x", totalBytes: 100, usedBytes: 95, availableBytes: 5 }, "2026-09-10T16:30:15.000Z"),
    ]);
    expect(unchanged).toHaveLength(0);

    const resolved = engine.evaluate([
      observation("memory", { sampledAt: "x", totalBytes: 100, usedBytes: 70, availableBytes: 30 }, "2026-09-10T16:30:30.000Z"),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.kind).toBe("resolved");
    expect(engine.listActive()).toHaveLength(0);
  });

  it("requires sustained CPU pressure before opening a finding", () => {
    const engine = new WatcherFindingEngine();
    const cpu = (observedAt: string) => observation("cpu", { sampledAt: observedAt, usagePercent: 96 }, observedAt);

    expect(engine.evaluate([cpu("2026-09-10T16:30:00.000Z")])).toHaveLength(0);
    expect(engine.evaluate([cpu("2026-09-10T16:30:15.000Z")])).toHaveLength(0);
    const opened = engine.evaluate([cpu("2026-09-10T16:30:30.000Z")]);

    expect(opened).toHaveLength(1);
    expect(opened[0]?.finding.code).toBe("cpu.sustained-pressure");
    expect(opened[0]?.finding.evidence.consecutiveHighSamples).toBe(3);
  });

  it("creates per-volume storage findings", () => {
    const engine = new WatcherFindingEngine();
    const transitions = engine.evaluate([
      observation("storage", {
        sampledAt: "x",
        disks: [
          { name: "C:", totalBytes: 1000, freeBytes: 20 },
          { name: "D:", totalBytes: 1000, freeBytes: 500 },
        ],
      }),
    ]);

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.finding.subjectId).toBe("C:");
    expect(transitions[0]?.finding.severity).toBe("critical");
  });
});
