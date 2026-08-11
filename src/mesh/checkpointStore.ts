import type { Checkpoint } from "./types";

export interface CheckpointStore {
  save<TState>(checkpoint: Checkpoint<TState>): void;
  get(checkpointId: string): Checkpoint | undefined;
  latest(scope: string, subjectId?: string): Checkpoint | undefined;
  list(scope?: string, subjectId?: string): Checkpoint[];
  restore(checkpoints: Checkpoint[]): void;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, Checkpoint>();

  save<TState>(checkpoint: Checkpoint<TState>): void {
    this.checkpoints.set(checkpoint.id, checkpoint as Checkpoint);
  }

  get(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  latest(scope: string, subjectId?: string): Checkpoint | undefined {
    return this.list(scope, subjectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  list(scope?: string, subjectId?: string): Checkpoint[] {
    return [...this.checkpoints.values()].filter((checkpoint) => {
      if (scope && checkpoint.scope !== scope) return false;
      if (subjectId !== undefined && checkpoint.subjectId !== subjectId) return false;
      return true;
    });
  }

  restore(checkpoints: Checkpoint[]): void {
    this.checkpoints.clear();
    for (const checkpoint of checkpoints) this.checkpoints.set(checkpoint.id, checkpoint);
  }
}
