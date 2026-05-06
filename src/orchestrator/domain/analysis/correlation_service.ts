import { AuditEvent, AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";

export interface CorrelationNode {
    id: string;
    type: "IP" | "PROCESS" | "ARTIFACT" | "WEB_ACTION";
    value: string;
    firstSeen: string;
    lastSeen: string;
    events: AuditEvent[];
    riskScore: number;
    correlationId?: string;
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
    lastActivity: string;
}

/**
 * CorrelationService
 * High-fidelity behavioral attribution engine.
 * Automatically correlates eBPF syscalls, Scanner reports, and Web actions into a unified Kill-Chain.
 */
export class CorrelationService {
    private activeNodes: Map<string, CorrelationNode> = new Map();
    private killChains: Map<string, KillChain> = new Map();

    constructor(private audit: AuditService, private logging: LoggingPort) {}

    /**
     * Process an incoming audit event and attempt to correlate it with existing intelligence.
     */
    async processEvent(event: AuditEvent) {
        // 1. Identify Subject
        const subjects = this.extractSubjects(event);
        if (subjects.length === 0) return;

        for (const subject of subjects) {
            let node = this.activeNodes.get(subject.value);
            if (!node) {
                node = {
                    id: crypto.randomUUID(),
                    type: subject.type,
                    value: subject.value,
                    firstSeen: event.timestamp,
                    lastSeen: event.timestamp,
                    events: [],
                    riskScore: 0,
                    correlationId: event.correlationId
                };
                this.activeNodes.set(subject.value, node);
            }

            node.lastSeen = event.timestamp;
            node.events.push(event);
            node.riskScore += this.calculateRisk(event);
            
            // Limit event history to prevent memory leak
            if (node.events.length > TACTICAL_CONSTANTS.CORRELATION.MAX_NODES_PER_SUBJECT) {
                node.events.shift();
            }

            if (node.riskScore >= TACTICAL_CONSTANTS.CORRELATION.WARNING_RISK_THRESHOLD) {
                await this.updateKillChain(node, event);
            }
        }
    }

    private extractSubjects(event: AuditEvent): { type: CorrelationNode["type"], value: string }[] {
        const subjects: { type: CorrelationNode["type"], value: string }[] = [];

        if (event.data?.ip) subjects.push({ type: "IP", value: event.data.ip });
        if (event.data?.pid) subjects.push({ type: "PROCESS", value: `pid:${event.data.pid}` });
        if (event.actor?.ip) subjects.push({ type: "IP", value: event.actor.ip });
        if (event.correlationId) subjects.push({ type: "WEB_ACTION", value: `web:${event.correlationId}` });
        
        // Link web action to IP if available
        if (event.correlationId && event.actor?.ip) {
            // Internal cross-link placeholder
        }

        return subjects;
    }

    private calculateRisk(event: AuditEvent): number {
        const type = event.type;
        const msg = (event.message || "").toUpperCase();

        // 1. Syscall Risk (eBPF)
        if (type === "SYSCALL_EVENT" || type === "SECURITY") {
            const syscall = event.data?.syscall;
            if (syscall === "ptrace") return 30;
            if (syscall === "memfd_create") return 25;
            if (syscall === "execve") {
                const comm = event.data?.comm || "";
                if (["nc", "netcat", "ncat", "curl", "wget"].includes(comm)) return 20;
                return 5;
            }
            return TACTICAL_CONSTANTS.CORRELATION.MIN_SYSCALL_SCORE;
        }

        // 2. Network & Threat Intel
        if (type === "THREAT") return 40;
        if (type === "HONEYPOT") return 35;
        if (type === "CANARY_TRIGGER") return 50;

        // 3. Web & Admin Actions
        if (type === "ADMIN_ACTION") {
            if (msg.includes("DELETE") || msg.includes("PUT")) return 10;
            return 5;
        }

        // 4. File Integrity
        if (type === "FORENSIC" && msg.includes("UNAUTHORIZED_ACCESS")) return 30;

        return 1;
    }

    private async updateKillChain(node: CorrelationNode, event: AuditEvent) {
        const chainKey = node.correlationId || node.value;
        let chain = this.killChains.get(chainKey);

        if (!chain) {
            chain = {
                id: crypto.randomUUID(),
                subject: chainKey,
                stages: {
                    reconnaissance: [],
                    weaponization: [],
                    delivery: [],
                    exploitation: [],
                    installation: [],
                    commandAndControl: [],
                    actionsOnObjectives: []
                },
                overallRisk: 0,
                lastActivity: event.timestamp
            };
            this.killChains.set(chainKey, chain);
        }

        chain.lastActivity = event.timestamp;
        this.mapEventToStage(chain, node, event);
        
        // Aggregate risk from all involved nodes
        chain.overallRisk = Math.min(100, node.riskScore);

        if (chain.overallRisk >= TACTICAL_CONSTANTS.CORRELATION.CRITICAL_RISK_THRESHOLD) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "CORRELATION",
                message: `CRITICAL ATTRIBUTION: Kill-Chain stage '${this.getHighestStage(chain)}' reached for ${chain.subject}. Total Risk: ${chain.overallRisk}`
            });
        }
    }

    private mapEventToStage(chain: KillChain, node: CorrelationNode, event: AuditEvent) {
        const type = event.type;
        const data = event.data || {};
        const msg = (event.message || "").toUpperCase();

        const addIfMissing = (stage: keyof KillChain["stages"]) => {
            if (!chain.stages[stage].some(n => n.id === node.id)) {
                chain.stages[stage].push(node);
            }
        };

        // Mapping Logic
        if (type === "SCAN_RESULT" || msg.includes("RECON")) {
            addIfMissing("reconnaissance");
        } else if (data.syscall === "execve" && ["curl", "nc"].includes(data.comm)) {
            addIfMissing("weaponization");
        } else if (type === "HONEYPOT" || type === "THREAT") {
            addIfMissing("delivery");
        } else if (data.syscall === "ptrace" || data.syscall === "memfd_create" || msg.includes("EXPLOIT")) {
            addIfMissing("exploitation");
        } else if (type === "FORENSIC" && (msg.includes("CREATE") || msg.includes("MODIFY"))) {
            addIfMissing("installation");
        } else if (type === "PCAP_ALERT" || (data.direction === "OUTBOUND" && node.riskScore > 20)) {
            addIfMissing("commandAndControl");
        } else if (msg.includes("EXFIL") || msg.includes("DELETE_ALL") || type === "SELF_DESTRUCT") {
            addIfMissing("actionsOnObjectives");
        }
    }

    private getHighestStage(chain: KillChain): string {
        const order: (keyof KillChain["stages"])[] = [
            "actionsOnObjectives", "commandAndControl", "installation", 
            "exploitation", "delivery", "weaponization", "reconnaissance"
        ];
        for (const stage of order) {
            if (chain.stages[stage].length > 0) return stage.toUpperCase();
        }
        return "UNKNOWN";
    }

    getKillChains(): KillChain[] {
        return Array.from(this.killChains.values())
            .sort((a, b) => b.overallRisk - a.overallRisk);
    }
}
