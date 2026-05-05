import { AuditEvent, AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export interface CorrelationNode {
    id: string;
    type: "IP" | "PROCESS" | "ARTIFACT";
    value: string;
    firstSeen: string;
    lastSeen: string;
    events: AuditEvent[];
    riskScore: number;
}

export interface KillChain {
    id: string;
    subject: string;
    stages: {
        reconnaissance: CorrelationNode[];
        weaponization: CorrelationNode[];
        delivery: CorrelationNode[];
        exploitation: CorrelationNode[];
        installation: CorrelationNode[];
        commandAndControl: CorrelationNode[];
        actionsOnObjectives: CorrelationNode[];
    };
    overallRisk: number;
}

/**
 * CorrelationService
 * Automatically correlates eBPF syscalls, Scanner reports, and PCAP data into a unified Threat Kill-Chain.
 */
export class CorrelationService {
    private activeCorrelations: Map<string, CorrelationNode> = new Map();
    private killChains: Map<string, KillChain> = new Map();

    constructor(private audit: AuditService, private logging: LoggingPort) {}

    /**
     * Process an incoming audit event and attempt to correlate it with existing intelligence.
     */
    async processEvent(event: AuditEvent) {
        let subjectKey: string | undefined;

        // Extract potential correlation keys
        if (event.data?.ip) subjectKey = event.data.ip;
        else if (event.data?.pid) subjectKey = `pid:${event.data.pid}`;
        else if (event.actor?.ip) subjectKey = event.actor.ip;

        if (!subjectKey) return;

        let node = this.activeCorrelations.get(subjectKey);
        if (!node) {
            node = {
                id: crypto.randomUUID(),
                type: subjectKey.startsWith("pid:") ? "PROCESS" : "IP",
                value: subjectKey,
                firstSeen: event.timestamp,
                lastSeen: event.timestamp,
                events: [],
                riskScore: 0
            };
            this.activeCorrelations.set(subjectKey, node);
        }

        node.lastSeen = event.timestamp;
        node.events.push(event);
        node.riskScore += this.calculateRisk(event);

        if (node.riskScore > 50) {
            await this.updateKillChain(node);
        }
    }

    private calculateRisk(event: AuditEvent): number {
        switch (event.type) {
            case "SYSCALL_EVENT":
                if (event.data?.syscall === "ptrace") return 25;
                if (event.data?.syscall === "execve") return 5;
                return 2;
            case "THREAT": return 40;
            case "SCAN_RESULT": return 15;
            case "PCAP_ALERT": return 20;
            default: return 1;
        }
    }

    private async updateKillChain(node: CorrelationNode) {
        const chainKey = node.value;
        let chain = this.killChains.get(chainKey);

        if (!chain) {
            chain = {
                id: crypto.randomUUID(),
                subject: node.value,
                stages: {
                    reconnaissance: [],
                    weaponization: [],
                    delivery: [],
                    exploitation: [],
                    installation: [],
                    commandAndControl: [],
                    actionsOnObjectives: []
                },
                overallRisk: 0
            };
            this.killChains.set(chainKey, chain);
        }

        // Map events to Kill Chain stages
        for (const event of node.events) {
            if (event.type === "SCAN_RESULT") {
                if (!chain.stages.reconnaissance.includes(node)) chain.stages.reconnaissance.push(node);
            } else if (event.data?.syscall === "ptrace") {
                if (!chain.stages.exploitation.includes(node)) chain.stages.exploitation.push(node);
            } else if (event.type === "PCAP_ALERT" && event.data?.protocol === "IRC") {
                if (!chain.stages.commandAndControl.includes(node)) chain.stages.commandAndControl.push(node);
            }
        }

        chain.overallRisk = Math.min(100, node.riskScore);

        if (chain.overallRisk > 80) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "CORRELATION",
                message: `CRITICAL KILL-CHAIN DETECTED: ${chain.subject} (Score: ${chain.overallRisk})`
            });
        }
    }

    getKillChains(): KillChain[] {
        return Array.from(this.killChains.values());
    }
}
