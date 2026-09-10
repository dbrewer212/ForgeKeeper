export type WatcherObservationDomain =
  | "host"
  | "cpu"
  | "gpu"
  | "memory"
  | "storage"
  | "process"
  | "service"
  | "network"
  | "software"
  | "foundry"
  | "equipment";

export interface WatcherDiskSnapshot {
  name: string;
  totalBytes: number;
  freeBytes: number;
}

export interface WatcherGpuSnapshot {
  name?: string;
  adapterRamBytes?: number;
  utilizationPercent?: number;
  temperatureC?: number;
  provider: string;
  detail?: string;
}

export interface WatcherSystemSnapshot {
  sampledAt: string;
  cpuUsagePercent?: number;
  totalMemoryBytes?: number;
  availableMemoryBytes?: number;
  usedMemoryBytes?: number;
  processCount?: number;
  disks: WatcherDiskSnapshot[];
  gpu?: WatcherGpuSnapshot;
}

export interface WatcherProvider<TSnapshot = unknown> {
  id: string;
  name: string;
  domains: WatcherObservationDomain[];
  collect(): Promise<TSnapshot>;
}

export interface WatcherProviderResult<TSnapshot = unknown> {
  providerId: string;
  collectedAt: string;
  domains: WatcherObservationDomain[];
  snapshot?: TSnapshot;
  error?: string;
}
