import type { EventType, FoundryEvent } from "./types";

export type EventHandler<TPayload = unknown> = (event: FoundryEvent<TPayload>) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus {
  publish<TPayload>(event: FoundryEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(type: EventType, handler: EventHandler<TPayload>): Unsubscribe;
  subscribeAll(handler: EventHandler): Unsubscribe;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Set<EventHandler>>();
  private readonly allHandlers = new Set<EventHandler>();

  subscribe<TPayload>(type: EventType, handler: EventHandler<TPayload>): Unsubscribe {
    const handlersForType = this.handlers.get(type) ?? new Set<EventHandler>();
    handlersForType.add(handler as EventHandler);
    this.handlers.set(type, handlersForType);

    return () => {
      const current = this.handlers.get(type);
      current?.delete(handler as EventHandler);
      if (current?.size === 0) this.handlers.delete(type);
    };
  }

  subscribeAll(handler: EventHandler): Unsubscribe {
    this.allHandlers.add(handler);
    return () => this.allHandlers.delete(handler);
  }

  async publish<TPayload>(event: FoundryEvent<TPayload>): Promise<void> {
    const typedHandlers = [...(this.handlers.get(event.type) ?? [])];
    const globalHandlers = [...this.allHandlers];

    await Promise.all([
      ...typedHandlers.map((handler) => handler(event)),
      ...globalHandlers.map((handler) => handler(event)),
    ]);
  }
}

export function createFoundryEvent<TPayload>(input: {
  id?: string;
  type: EventType;
  sourceWorkerId: string;
  payload: TPayload;
  correlationId?: string;
  causationId?: string;
  subjectId?: string;
  occurredAt?: string;
}): FoundryEvent<TPayload> {
  return {
    id: input.id ?? crypto.randomUUID(),
    type: input.type,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    sourceWorkerId: input.sourceWorkerId,
    payload: input.payload,
    correlationId: input.correlationId,
    causationId: input.causationId,
    subjectId: input.subjectId,
  };
}
