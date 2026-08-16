import type { EventBus, EventHandler, Unsubscribe } from "./eventBus";
import type { EventType, FoundryEvent } from "./types";
import type { MeshPersistence } from "./persistence";

export class DurableEventBus implements EventBus {
  constructor(
    private readonly inner: EventBus,
    private readonly persistence: MeshPersistence,
  ) {}

  subscribe<TPayload>(type: EventType, handler: EventHandler<TPayload>): Unsubscribe {
    return this.inner.subscribe(type, handler);
  }

  subscribeAll(handler: EventHandler): Unsubscribe {
    return this.inner.subscribeAll(handler);
  }

  async publish<TPayload>(event: FoundryEvent<TPayload>): Promise<void> {
    await this.persistence.appendEvent(event as FoundryEvent);
    await this.inner.publish(event);
  }
}
