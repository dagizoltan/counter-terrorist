import { LoggingPort, LogSeverity, LogType, CommandPort } from "@core/ports.ts";
import { CorrelationService, KillChain } from "./correlation_service.ts";

/**
 * AutonomousAutopilotService
 * The autonomous response engine of the Sovereign Orchestrator.
 * Automatically executes defensive playbooks based on behavioral correlation verdicts.
 */
export class AutonomousAutopilotService {
    private containedSubjects: Set<string> = new Set();
    private protection: any; // ProtectionAdapter

    constructor(
        private correlation: CorrelationService,
        private commands: CommandPort,
        private logging: LoggingPort
    ) {}

    public setProtection(protection: any) {
        this.protection = protection;
    }

    /**
     * Continuously monitors the correlation engine for breaches.
     */
    public start() {
        setInterval(() => this.evaluateThreats(), 5000);
        
        // Scheduled Rootkit Audit (Every 1 hour)
        setInterval(() => this.runScheduledRootkitScan(), 60 * 60 * 1000);
        // Initial scan on boot
        setTimeout(() => this.runScheduledRootkitScan(), 30000);
    }

    private async runScheduledRootkitScan() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "AUTOPILOT",
            message: "Initiating scheduled Rootkit Vulnerability Audit..."
        });

        try {
            await this.commands.sendCommand("analyzer", {
                type: "RKH_SCAN",
                id: crypto.randomUUID()
            });
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "AUTOPILOT",
                message: `Scheduled RKH_SCAN failed: ${(e as Error).message}`
            });
        }
    }

    private async evaluateThreats() {
        const chains = this.correlation.getKillChains();
        
        for (const chain of chains) {
            if (chain.isConfirmedBreach && chain.overallRisk >= 100 && !this.containedSubjects.has(chain.subject)) {
                await this.executeContainment(chain);
            }
        }
    }

    private async executeContainment(chain: KillChain) {
        this.containedSubjects.add(chain.subject);
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "AUTOPILOT",
            message: `AUTONOMOUS CONTAINMENT ENGAGED for subject: ${chain.subject}. Executing 'Full-Lockdown' playbook.`
        });

        // 1. NETWORK BLOCK: Block the attacking IP via FirewallManager (which handles Sentinel/eBPF)
        if (chain.subject.includes(".") && this.protection) { // Basic IP check
             await this.protection.firewall.blockIp(chain.subject);
        } else if (chain.subject.includes(".")) {
             // Fallback if protection not yet wired
             await this.commands.sendCommand("sentinel", {
                type: "BLOCK_IP",
                ip: chain.subject,
                id: crypto.randomUUID()
            });
        }

        // 2. PROCESS KILL & DUMP: If it's a local PID, terminate the process tree after forensic dump
        const processNode = chain.stages.exploitation.find(n => n.type === "PROCESS");
        if (processNode && processNode.pid && this.protection) {
            await this.protection.firewall.killProcess(processNode.pid);
        } else if (processNode && processNode.pid) {
            // Fallback
            await this.commands.sendCommand("enforcer", {
                type: "KillProcess",
                pid: processNode.pid,
                id: crypto.randomUUID()
            });
        }

        // 3. FORENSIC EVIDENCE: Start capturing traffic from this source
        if (this.protection && this.protection.pcap) {
            await this.protection.pcap.startCapture("eth0", 300, `forensics_breach_${chain.id.substring(0, 8)}.pcap`, `host ${chain.subject}`);
        } else {
            await this.commands.sendCommand("netcap", {
                type: "StartCapture",
                payload: {
                    interface: "eth0", 
                    filename: `./volume/storage/forensics/forensics_breach_${chain.id.substring(0, 8)}.pcap`
                },
                id: crypto.randomUUID()
            });
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "AUTOPILOT",
            message: `Containment sequence completed. Subject ${chain.subject} is now isolated and under forensic surveillance.`
        });
    }
}
