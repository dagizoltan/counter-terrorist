import { z } from "npm:zod";
import type { EventName, EventRegistry } from "@core/event_schema.ts";

export type EventData<T extends EventName> = T extends keyof EventRegistry
  ? z.infer<EventRegistry[T]>
  : unknown;

export type SystemEventEnvelope<T extends EventName = EventName> = {
  type: T;
  message: string;
  timestamp: string;
  data: EventData<T>,
  correlationId?: string;
  fromAudit?: boolean;
};

export type EventHandler<T extends EventName> = (
  data: EventData<T>,
  event: SystemEventEnvelope<T>
) => void | Promise<void>;

export interface EventBusPort {
  publish<T extends EventName>(type: T, message: string, data?: EventData<T>): Promise<void>;
  emit<T extends EventName>(event: T, data: EventData<T>): Promise<void>;
  subscribe(handler: (event: SystemEventEnvelope) => void | Promise<void>): () => void;
  unsubscribe(handler: (event: SystemEventEnvelope) => void): void;
  on<T extends EventName>(event: T, callback: EventHandler<T>): () => void;
}
