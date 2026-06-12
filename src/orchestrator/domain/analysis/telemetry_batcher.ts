import { EventBus } from "./events.ts";

export class TelemetryBatcher {
    private batches: Map<string, any[]> = new Map();
    private readonly MAX_BATCH_SIZE = 1000;

    constructor(private eventBus: EventBus) {}

    add(type: string, event: any) {
        if (!this.batches.has(type)) {
            this.batches.set(type, []);
        }
        const batch = this.batches.get(type)!;
        batch.push(event);

        if (batch.length >= 50) {
            this.flush(type);
        }
    }

    flush(type?: string) {
        if (type) {
            this.flushType(type);
        } else {
            for (const t of this.batches.keys()) {
                this.flushType(t);
            }
        }
    }

    private flushType(type: string) {
        const batch = this.batches.get(type);
        if (!batch || batch.length === 0) return;

        const toEmit = batch.splice(0, this.MAX_BATCH_SIZE);
        // @ts-ignore: Dynamic event emission for batches
        this.eventBus.emit(`${type}_BATCH`, toEmit);
    }
}
