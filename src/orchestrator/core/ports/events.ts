import type { EventName } from "@core/event_schema.ts";

export enum EventPriority {
    CRITICAL = 0,
    HIGH = 1,
    NORMAL = 2,
    LOW = 3
}

export type SystemEventEnvelope<T extends EventName = string> = {
  type: T;
  message: string;
  timestamp: string;
  data: unknown;
  correlationId?: string;
  fromAudit?: boolean;
};

export type EventHandler<T extends EventName> = (
  data: unknown,
  event: SystemEventEnvelope<T>
) => void | Promise<void>;

export interface EventBusPort {
  publish<T extends EventName>(type: T, message: string, data?: unknown): Promise<void>;
  emit<T extends EventName>(event: T, data: unknown): Promise<void>;
  subscribe(handler: (event: SystemEventEnvelope<string>) => void | Promise<void>, priority?: EventPriority): () => void;
  unsubscribe(handler: (event: SystemEventEnvelope<string>) => void): void;
  on<T extends EventName>(event: T, callback: EventHandler<T>, priority?: EventPriority): () => void;
}
