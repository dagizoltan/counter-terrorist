import { ok } from "@core/result.ts";
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

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        return ok(undefined);
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
        const data = event.data || {};

        // 1. Network Subjects
        if (typeof data.ip === "string") subjects.push({ type: "IP", value: data.ip });
        if (typeof data.remote_ip === "string") subjects.push({ type: "IP", value: data.remote_ip });
        if (event.actor?.ip) subjects.push({ type: "IP", value: event.actor.ip });

        // 2. Process Subjects
        if (typeof data.pid === "number") subjects.push({ type: "PROCESS", value: `pid:${data.pid}` });
        if (typeof data.comm === "string") subjects.push({ type: "PROCESS", value: `comm:${data.comm}` });

        // 3. Artifact Subjects
        if (typeof data.path === "string") subjects.push({ type: "ARTIFACT", value: data.path });
        if (typeof data.file_path === "string") subjects.push({ type: "ARTIFACT", value: data.file_path });
        if (typeof data.hash === "string") subjects.push({ type: "ARTIFACT", value: `sha256:${data.hash}` });

        // Deduplicate and return
        const seen = new Set<string>();
        return subjects.filter(s => {
            const key = `${s.type}:${s.value}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private calculateRisk(event: AuditEvent): number {
        const type = event.type;
        const msg = (event.message || "").toUpperCase();
        const data = event.data || {};

        if (type === "SYSCALL_EVENT" || type === "SECURITY") {
            const syscall = data.syscall;
            if (syscall === "ptrace") return 35;
            if (syscall === "memfd_create") return 30;
            if (syscall === "execve") {
                const comm = String(data.comm || "").toLowerCase();
                if (["nc", "netcat", "ncat", "curl", "wget", "sh", "bash", "python", "perl"].includes(comm)) return 25;
            }
            if (syscall === "finit_module" || syscall === "init_module") return 40; // Kernel rootkit attempt
        }

        if (type === "EXFIL_ALERT") return 40;
        if (type === "CANARY_TRIGGER") return 50;
        if (type === "FILE_ALERT" && msg.includes("DENIED")) return 45;
        if (type === "MALWARE_DETECTION" || type === "ROOTKIT_DETECTION") return 60;
        if (type === "HONEYPOT_TRIGGER") return 40;

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

        const comm = String(data.comm || "").toLowerCase();
        const syscall = String(data.syscall || "").toLowerCase();

        // 1. Reconnaissance
        if (type === "SCAN_RESULT" || type === "NETWORK_DISCOVERY") add("reconnaissance");

        // 2. Weaponization
        if (syscall === "execve" && ["nc", "curl", "wget", "python"].includes(comm)) add("weaponization");
        if (type === "MALWARE_DETECTION") add("weaponization");

        // 3. Delivery
        if (type === "HONEYPOT_TRIGGER" || type === "CANARY_TRIGGER" || type === "PHISHING_DETECTION") add("delivery");

        // 4. Exploitation
        if (syscall === "ptrace" || syscall === "memfd_create" || syscall === "unshare") add("exploitation");
        if (type === "EXPLOIT_PAYLOAD") add("exploitation");

        // 5. Installation
        if ((type === "FILE_ALERT" && msg.includes("DENIED")) || type === "PERSISTENCE_DETECTION") add("installation");
        if (syscall === "finit_module" || syscall === "init_module") add("installation");

        // 6. Command and Control (C2)
        if (type === "EXFIL_ALERT" || type === "BEHAVIORAL_ANOMALY" && msg.includes("BEACON")) add("commandAndControl");

        // 7. Actions on Objectives
        if (msg.includes("EXFIL") || type === "SELF_DESTRUCT" || type === "RANSOMWARE_TRIGGER") add("actionsOnObjectives");
    }

    getKillChains(): KillChain[] {
        return Array.from(this.killChains.values()).sort((a, b) => b.overallRisk - a.overallRisk);
    }
}
