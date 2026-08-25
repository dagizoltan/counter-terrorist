import { assertEquals } from "@std/assert";
import { ChaosEngine } from "../src/orchestrator/domain/orchestration/chaos_engine.ts";
import { EventBus } from "../src/orchestrator/domain/index.ts";
import { AuditService } from "../src/orchestrator/domain/analysis/audit.ts";
import { SidecarManager } from "../src/orchestrator/infrastructure/runtime/sidecar_manager.ts";
import { LogType, LogSeverity } from "../src/orchestrator/core/ports.ts";

Deno.test("ChaosEngine - simulateBruteForce emits events", async () => {
    const eventBus = new EventBus({ log: async () => {} } as any);
    const auditService = {
        getLogging: () => ({ log: () => {} }),
        logEvent: async () => {}
    } as any;

    let sidecarEvents: any[] = [];
    const sidecar = {
        emitEvent: (type: string, data: any) => {
            sidecarEvents.push({ type, data });
        }
    } as any;

    const engine = new ChaosEngine({ log: () => {} } as any, eventBus, auditService, sidecar);
    await engine.simulateBruteForce("1.2.3.4");

    assertEquals(sidecarEvents.length, 3);
    assertEquals(sidecarEvents[0].type, "decoy");
    assertEquals(sidecarEvents[0].data.data.source_ip, "1.2.3.4");
});

Deno.test("ChaosEngine - simulateCanaryTrigger emits FIM event", async () => {
    const eventBus = new EventBus({ log: async () => {} } as any);
    const auditService = {
        getLogging: () => ({ log: () => {} }),
        logEvent: async () => {}
    } as any;

    let sidecarEvents: any[] = [];
    const sidecar = {
        emitEvent: (type: string, data: any) => {
            sidecarEvents.push({ type, data });
        }
    } as any;

    const engine = new ChaosEngine({ log: () => {} } as any, eventBus, auditService, sidecar);
    await engine.simulateCanaryTrigger("/tmp/secret");

    assertEquals(sidecarEvents.length, 1);
    assertEquals(sidecarEvents[0].type, "fim");
    assertEquals(sidecarEvents[0].data.data.path, "/tmp/secret");
});

Deno.test("ChaosEngine - simulateMalwareExecution emits eBPF event", async () => {
    const eventBus = new EventBus({ log: async () => {} } as any);
    const auditService = {
        getLogging: () => ({ log: () => {} }),
        logEvent: async () => {}
    } as any;

    let sidecarEvents: any[] = [];
    const sidecar = {
        emitEvent: (type: string, data: any) => {
            sidecarEvents.push({ type, data });
        }
    } as any;

    const engine = new ChaosEngine({ log: () => {} } as any, eventBus, auditService, sidecar);
    await engine.simulateMalwareExecution("evil_proc");

    assertEquals(sidecarEvents.length, 1);
    assertEquals(sidecarEvents[0].type, "ebpf");
    assertEquals(sidecarEvents[0].data.data.comm, "evil_proc");
});
