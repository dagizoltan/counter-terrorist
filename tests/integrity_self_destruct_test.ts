import { assertEquals } from "@std/assert";
import { IntegrityService } from "@domain/analysis/integrity_service.ts";
import { MeshManager } from "@domain/orchestration/mesh.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { LoggingPort, LogEntry } from "@core/ports.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

Deno.test("IntegrityService - Dead Man's Switch Trigger", async () => {
    const logger = new MockLoggingPort();
    const mesh = { getActiveNodeCount: () => 0 } as any;
    const audit = { getRecentEvents: async () => new Array(50).fill({ type: "THREAT" }) } as any;
    const tpm = { wipeSecrets: async () => {} } as any;
    const config = { getEnv: () => "test" } as any;

    const service = new IntegrityService(mesh, audit, tpm, logger, config);

    // Stub initiateSelfDestruct to prevent Deno.exit(1)
    let triggered = false;
    // @ts-ignore
    service.initiateSelfDestruct = async () => {
        triggered = true;
    };

    // @ts-ignore
    await service.checkIntegrity();

    assertEquals(triggered, true);
    assertEquals(logger.logs.some(l => l.message.includes("IRRECOVERABLE COMPROMISE")), true);
});
