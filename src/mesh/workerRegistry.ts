import type {
  RegisteredWorker,
  WorkerIdentity,
  WorkerStatus,
} from "./types";

export interface WorkerRegistry {
  register(identity: WorkerIdentity, status?: WorkerStatus): void;
  unregister(workerId: string): void;
  updateStatus(status: WorkerStatus): void;
  get(workerId: string): RegisteredWorker | undefined;
  list(): RegisteredWorker[];
}

export class InMemoryWorkerRegistry implements WorkerRegistry {
  private readonly workers = new Map<string, RegisteredWorker>();

  register(identity: WorkerIdentity, status?: WorkerStatus): void {
    this.workers.set(identity.id, {
      identity,
      status:
        status ?? {
          workerId: identity.id,
          state: "offline",
          health: "nominal",
        },
    });
  }

  unregister(workerId: string): void {
    this.workers.delete(workerId);
  }

  updateStatus(status: WorkerStatus): void {
    const existing = this.workers.get(status.workerId);
    if (!existing) {
      throw new Error(`Worker ${status.workerId} is not registered.`);
    }

    this.workers.set(status.workerId, {
      ...existing,
      status,
    });
  }

  get(workerId: string): RegisteredWorker | undefined {
    return this.workers.get(workerId);
  }

  list(): RegisteredWorker[] {
    return [...this.workers.values()];
  }
}
