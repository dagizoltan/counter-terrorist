import { z } from "npm:zod";
import type { EventName, EventRegistry } from "@core/event_schema.ts";

export type SystemEventEnvelope<T extends EventName = EventName> = {
  type: T;
  message: string;
  timestamp: string;
  data: z.infer<EventRegistry[T]>;
  correlationId?: string;
  fromAudit?: boolean;
};

export type EventHandler<T extends EventName> = (
  data: z.infer<EventRegistry[T]>,
  event: SystemEventEnvelope<T>
) => void | Promise<void>;

export interface EventBusPort {
  publish<T extends EventName>(type: T, message: string, data?: z.infer<EventRegistry[T]>): void;
  emit<T extends EventName>(event: T, data: z.infer<EventRegistry[T]>): void;
  subscribe(handler: (event: SystemEventEnvelope) => void | Promise<void>): () => void;
  unsubscribe(handler: (event: SystemEventEnvelope) => void): void;
  on<T extends EventName>(event: T, callback: EventHandler<T>): () => void;
}
