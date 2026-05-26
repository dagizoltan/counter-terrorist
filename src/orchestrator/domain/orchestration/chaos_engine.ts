import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";

export interface ChaosConfig {
    latencyMs?: { min: number; max: number };
    packetLossRate?: number; // 0.0 to 1.0
    partialPartitionRate?: number; // 0.0 to 1.0
}

import { EventBusPort, CommandPort } from "@core/ports.ts";
import { AuditService } from "../analysis/audit.ts";

export { MeshChaosEngine as ChaosEngine };
export class MeshChaosEngine extends BaseService {
    private active = false;
    private config: ChaosConfig = {};

    constructor(
        private logging: LoggingPort,
        private eventBusLegacy?: EventBusPort,
        private auditServiceLegacy?: AuditService,
        private sidecarLegacy?: CommandPort
    ) {
        super();
    }

    // Legacy methods for chaos_engine_test.ts
    async simulateBruteForce(ip: string) {
        if (this.sidecarLegacy) {
            this.sidecarLegacy.emitEvent("decoy", { type: "brute_force", data: { source_ip: ip } });
            this.sidecarLegacy.emitEvent("decoy", { type: "brute_force", data: { source_ip: ip } });
            this.sidecarLegacy.emitEvent("decoy", { type: "brute_force", data: { source_ip: ip } });
        }
        if (this.eventBusLegacy) {
            this.eventBusLegacy.publish("THREAT" as any, "Simulated brute force", { type: "BRUTE_FORCE", source: ip, severity: "high", message: "Simulated brute force" } as any);
        }
    }

    async simulateCanaryTrigger(path: string) {
        if (this.sidecarLegacy) {
            this.sidecarLegacy.emitEvent("fim", { type: "file_access", data: { path } });
        }
        if (this.eventBusLegacy) {
            this.eventBusLegacy.publish("THREAT" as any, "Simulated canary trigger", { type: "CANARY_TRIGGER", source: path, severity: "high", message: "Simulated canary trigger" } as any);
        }
    }

    async simulateMalwareExecution(comm: string) {
        if (this.sidecarLegacy) {
            this.sidecarLegacy.emitEvent("ebpf", { type: "exec", data: { comm } });
        }
        if (this.eventBusLegacy) {
            this.eventBusLegacy.publish("THREAT" as any, "Simulated malware execution", { type: "MALWARE_EXEC", source: comm, severity: "critical", message: "Simulated malware execution" } as any);
        }
    }

    protected override onInit(): Promise<Result<void>> {
        return Promise.resolve(ok(undefined));
    }

    protected override onShutdown(): Promise<Result<void>> {
        this.active = false;
        return Promise.resolve(ok(undefined));
    }

    start(config: ChaosConfig) {
        this.config = config;
        this.active = true;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.WARNING,
            caller: "MESH:CHAOS",
            message: "Chaos Engine engaged. Simulating adversarial network conditions.",
            payload: config
        });
    }

    stop() {
        this.active = false;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "MESH:CHAOS",
            message: "Chaos Engine disengaged. Network conditions normalized."
        });
    }

    async applyChaos<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.active) return await fn();

        // 1. Simulate Packet Loss
        if (this.config.packetLossRate && Math.random() < this.config.packetLossRate) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.DEBUG,
                caller: "MESH:CHAOS",
                message: "Simulated packet loss: dropping operation."
            });
            throw new Error("CHAOS: Packet dropped");
        }

        // 2. Simulate Latency
        if (this.config.latencyMs) {
            const delay = Math.floor(Math.random() * (this.config.latencyMs.max - this.config.latencyMs.min + 1) + this.config.latencyMs.min);
            await new Promise(r => setTimeout(r, delay));
        }

        return await fn();
    }

    shouldPartition(nodeId: string): boolean {
        if (!this.active || !this.config.partialPartitionRate) return false;
        // Deterministic but "random" partition per node to simulate stable but partial partition
        // DJB2 Hash
        let hash = 5381;
        for (let i = 0; i < nodeId.length; i++) {
            hash = ((hash << 5) + hash) + nodeId.charCodeAt(i);
        }
        return (Math.abs(hash) % 100) / 100 < this.config.partialPartitionRate;
    }
}
