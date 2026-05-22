import { AuditEvent, AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";
import { BaseService } from "@core/base_service.ts";

export interface CorrelationNode {
    id: string;
    type: "IP" | "PROCESS" | "ARTIFACT" | "WEB_ACTION";
    value: string;
    firstSeen: string;
    lastSeen: string;
    events: AuditEvent[];
    riskScore: number;
    correlationId?: string;
    pid?: number;
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
    isConfirmedBreach: boolean;
}

export class CorrelationService extends BaseService {
    private activeNodes: Map<string, CorrelationNode> = new Map();
    private killChains: Map<string, KillChain> = new Map();
    private readonly ATTACK_BURST_WINDOW_MS = 60000;

    constructor(private audit: AuditService, private logging: LoggingPort) {
        super();
    }

    override async init(): Promise<import("../../core/result.ts").Result<void>> {
        if (this.initialized) return { success: true, data: undefined };
        this.initialized = true;
        return { success: true, data: undefined };
    }

    override async shutdown(): Promise<import("../../core/result.ts").Result<void>> {
        this.initialized = false;
        return await super.shutdown();
    }

    async processEvent(event: AuditEvent) {
        const subjects = this.extractSubjects(event);
        if (subjects.length === 0) return;

        const now = new Date().getTime();

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
                    correlationId: event.correlationId,
                    pid: typeof event.data?.pid === "number" ? event.data.pid : undefined
                };
                this.activeNodes.set(subject.value, node);
            }

            const activeNode = node;

            // RISK DECAY: Reduce risk based on elapsed time since last seen
            const lastSeenTime = new Date(activeNode.lastSeen).getTime();
            const elapsed = now - lastSeenTime;
            if (elapsed > 0 && activeNode.riskScore > 0) {
                const decayFactor = Math.pow(0.5, elapsed / TACTICAL_CONSTANTS.CORRELATION.RISK_DECAY_HALFLIFE_MS);
                activeNode.riskScore *= decayFactor;
            }

            activeNode.lastSeen = event.timestamp;
            activeNode.events.push(event);
            
            // BEHAVIORAL MULTIPLIER: Increase risk if events are happening in a tight burst
            const timeDiff = new Date(event.timestamp).getTime() - new Date(activeNode.firstSeen).getTime();
            const burstMultiplier = (timeDiff < this.ATTACK_BURST_WINDOW_MS && timeDiff > 0) ? 1.5 : 1.0;
            
            activeNode.riskScore += (this.calculateRisk(event) * burstMultiplier);
            
            if (activeNode.events.length > TACTICAL_CONSTANTS.CORRELATION.MAX_NODES_PER_SUBJECT) {
                activeNode.events.shift();
            }

            await this.updateKillChain(activeNode, event);
        }
    }

    private extractSubjects(event: AuditEvent): { type: CorrelationNode["type"], value: string }[] {
        const subjects: { type: CorrelationNode["type"], value: string }[] = [];
        if (typeof event.data?.ip === "string") subjects.push({ type: "IP", value: event.data.ip });
        if (typeof event.data?.pid === "number") subjects.push({ type: "PROCESS", value: `pid:${event.data.pid}` });
        if (event.actor?.ip) subjects.push({ type: "IP", value: event.actor.ip });
        return subjects;
    }

    private calculateRisk(event: AuditEvent): number {
        const type = event.type;
        const msg = (event.message || "").toUpperCase();

        if (type === "SYSCALL_EVENT" || type === "SECURITY") {
            const syscall = event.data?.syscall;
            if (syscall === "ptrace") return 35;
            if (syscall === "memfd_create") return 30;
            if (syscall === "execve") {
                const comm = (event.data?.comm as string) || "";
                if (["nc", "netcat", "ncat", "curl", "wget", "sh", "bash"].includes(comm)) return 25;
            }
        }

        if (type === "EXFIL_ALERT") return 40;
        if (type === "CANARY_TRIGGER") return 50;
        if (type === "FILE_ALERT" && msg.includes("DENIED")) return 45; // NEW: Active Fanotify Block

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
                    reconnaissance: [], weaponization: [], delivery: [],
                    exploitation: [], installation: [], commandAndControl: [],
                    actionsOnObjectives: []
                },
                overallRisk: 0,
                lastActivity: event.timestamp,
                isConfirmedBreach: false
            };
            this.killChains.set(chainKey, chain);
        }

        chain.lastActivity = event.timestamp;
        this.mapEventToStage(chain, node, event);
        chain.overallRisk = Math.min(100, node.riskScore);

        // BREACH CONFIRMATION: Sequence Logic
        if (chain.stages.exploitation.length > 0 && chain.stages.commandAndControl.length > 0) {
            chain.isConfirmedBreach = true;
            chain.overallRisk = 100;
        }

        if (chain.overallRisk >= TACTICAL_CONSTANTS.CORRELATION.CRITICAL_RISK_THRESHOLD) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "SOVEREIGN_VERDICT",
                message: `AUTONOMOUS VERDICT: ${chain.isConfirmedBreach ? "CONFIRMED_BREACH" : "HIGH_RISK_ANOMALY"} detected for ${chain.subject}. Escalating to Quarantine.`
            });
        }
    }

    private mapEventToStage(chain: KillChain, node: CorrelationNode, event: AuditEvent) {
        const type = event.type;
        const msg = (event.message || "").toUpperCase();
        const data = event.data || {};

        const add = (stage: keyof KillChain["stages"]) => {
            if (!chain.stages[stage].some(n => n.id === node.id)) chain.stages[stage].push(node);
        };

        if (type === "SCAN_RESULT") add("reconnaissance");
        if (data.syscall === "execve" && ["nc", "curl"].includes(data.comm as string)) add("weaponization");
        if (type === "HONEYPOT" || type === "CANARY_TRIGGER") add("delivery");
        if (data.syscall === "ptrace" || data.syscall === "memfd_create") add("exploitation");
        if (type === "FILE_ALERT" && msg.includes("DENIED")) add("installation");
        if (type === "EXFIL_ALERT") add("commandAndControl");
        if (msg.includes("EXFIL") || type === "SELF_DESTRUCT") add("actionsOnObjectives");
    }

    getKillChains(): KillChain[] {
        return Array.from(this.killChains.values()).sort((a, b) => b.overallRisk - a.overallRisk);
    }
}
