import type {
  WatcherCpuSnapshot,
  WatcherMemorySnapshot,
  WatcherObservation,
  WatcherObservationDomain,
  WatcherStorageSnapshot,
} from "./contracts";

export type WatcherFindingSeverity = "notice" | "warning" | "critical";

export interface WatcherFinding {
  id: string;
  code: string;
  domain: WatcherObservationDomain;
  providerId: string;
  subjectId?: string;
  severity: WatcherFindingSeverity;
  summary: string;
  observedAt: string;
  evidence: Record<string, unknown>;
}

export interface WatcherFindingTransition {
  kind: "opened" | "escalated" | "resolved";
  finding: WatcherFinding;
  previous?: WatcherFinding;
}

interface CandidateFinding extends Omit<WatcherFinding, "id"> {
  key: string;
}

const CPU_OPEN_PERCENT = 95;
const CPU_RECOVER_PERCENT = 85;
const CPU_REQUIRED_STREAK = 3;
const MEMORY_WARNING_PERCENT = 90;
const MEMORY_CRITICAL_PERCENT = 97;
const STORAGE_WARNING_PERCENT = 90;
const STORAGE_CRITICAL_PERCENT = 97;

function asPercent(used?: number, total?: number): number | undefined {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) return undefined;
  return (used / total) * 100;
}

function findingId(key: string): string {
  return `watcher:${key}`;
}

export class WatcherFindingEngine {
  private readonly active = new Map<string, WatcherFinding>();
  private readonly cpuHighStreak = new Map<string, number>();

  evaluate(observations: WatcherObservation[]): WatcherFindingTransition[] {
    const candidates = new Map<string, CandidateFinding>();
    const evaluatedKeys = new Set<string>();

    for (const observation of observations) {
      if (observation.availability === "unavailable") continue;
      if (observation.domain === "cpu") this.evaluateCpu(observation, candidates, evaluatedKeys);
      if (observation.domain === "memory") this.evaluateMemory(observation, candidates, evaluatedKeys);
      if (observation.domain === "storage") this.evaluateStorage(observation, candidates, evaluatedKeys);
    }

    const transitions: WatcherFindingTransition[] = [];

    for (const [key, candidate] of candidates) {
      const next: WatcherFinding = { ...candidate, id: findingId(key) };
      delete (next as WatcherFinding & { key?: string }).key;
      const previous = this.active.get(key);
      if (!previous) {
        this.active.set(key, next);
        transitions.push({ kind: "opened", finding: structuredClone(next) });
        continue;
      }

      if (previous.severity !== next.severity || previous.summary !== next.summary) {
        this.active.set(key, next);
        transitions.push({ kind: "escalated", finding: structuredClone(next), previous: structuredClone(previous) });
      } else {
        this.active.set(key, next);
      }
    }

    for (const key of evaluatedKeys) {
      if (candidates.has(key)) continue;
      const previous = this.active.get(key);
      if (!previous) continue;
      this.active.delete(key);
      transitions.push({
        kind: "resolved",
        finding: { ...structuredClone(previous), observedAt: this.latestObservedAt(observations, previous.domain) },
        previous: structuredClone(previous),
      });
    }

    return transitions;
  }

  listActive(): WatcherFinding[] {
    return [...this.active.values()].map((finding) => structuredClone(finding));
  }

  private evaluateCpu(
    observation: WatcherObservation,
    candidates: Map<string, CandidateFinding>,
    evaluatedKeys: Set<string>,
  ): void {
    const value = observation.value as WatcherCpuSnapshot | undefined;
    const usage = value?.usagePercent;
    if (typeof usage !== "number") return;

    const key = `cpu-pressure:${observation.providerId}`;
    evaluatedKeys.add(key);
    const previousStreak = this.cpuHighStreak.get(key) ?? 0;
    const nextStreak = usage >= CPU_OPEN_PERCENT
      ? previousStreak + 1
      : usage <= CPU_RECOVER_PERCENT
        ? 0
        : previousStreak;
    this.cpuHighStreak.set(key, nextStreak);

    if (nextStreak < CPU_REQUIRED_STREAK) return;
    candidates.set(key, {
      key,
      code: "cpu.sustained-pressure",
      domain: "cpu",
      providerId: observation.providerId,
      severity: usage >= 99 ? "critical" : "warning",
      summary: `CPU pressure has remained high for ${nextStreak} Watcher samples (${usage.toFixed(1)}%).`,
      observedAt: observation.observedAt,
      evidence: { usagePercent: usage, consecutiveHighSamples: nextStreak },
    });
  }

  private evaluateMemory(
    observation: WatcherObservation,
    candidates: Map<string, CandidateFinding>,
    evaluatedKeys: Set<string>,
  ): void {
    const value = observation.value as WatcherMemorySnapshot | undefined;
    const utilization = asPercent(value?.usedBytes, value?.totalBytes);
    if (utilization === undefined) return;

    const key = `memory-pressure:${observation.providerId}`;
    evaluatedKeys.add(key);
    if (utilization < MEMORY_WARNING_PERCENT) return;
    candidates.set(key, {
      key,
      code: "memory.pressure",
      domain: "memory",
      providerId: observation.providerId,
      severity: utilization >= MEMORY_CRITICAL_PERCENT ? "critical" : "warning",
      summary: `Memory utilization is ${utilization.toFixed(1)}%.`,
      observedAt: observation.observedAt,
      evidence: { utilizationPercent: utilization, usedBytes: value?.usedBytes, totalBytes: value?.totalBytes },
    });
  }

  private evaluateStorage(
    observation: WatcherObservation,
    candidates: Map<string, CandidateFinding>,
    evaluatedKeys: Set<string>,
  ): void {
    const value = observation.value as WatcherStorageSnapshot | undefined;
    for (const disk of value?.disks ?? []) {
      if (!disk.totalBytes) continue;
      const usedBytes = Math.max(0, disk.totalBytes - disk.freeBytes);
      const utilization = asPercent(usedBytes, disk.totalBytes);
      if (utilization === undefined) continue;

      const key = `storage-pressure:${observation.providerId}:${disk.name}`;
      evaluatedKeys.add(key);
      if (utilization < STORAGE_WARNING_PERCENT) continue;
      candidates.set(key, {
        key,
        code: "storage.capacity-pressure",
        domain: "storage",
        providerId: observation.providerId,
        subjectId: disk.name,
        severity: utilization >= STORAGE_CRITICAL_PERCENT ? "critical" : "warning",
        summary: `${disk.name} storage utilization is ${utilization.toFixed(1)}%.`,
        observedAt: observation.observedAt,
        evidence: { utilizationPercent: utilization, usedBytes, totalBytes: disk.totalBytes, freeBytes: disk.freeBytes },
      });
    }
  }

  private latestObservedAt(observations: WatcherObservation[], domain: WatcherObservationDomain): string {
    return observations
      .filter((observation) => observation.domain === domain)
      .map((observation) => observation.observedAt)
      .sort()
      .at(-1) ?? new Date().toISOString();
  }
}
