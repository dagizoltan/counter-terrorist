import { LoggingPort, LogSeverity, LogType, CommandPort } from "@core/ports.ts";
import { CorrelationService, KillChain } from "./correlation_service.ts";

/**
 * AutonomousAutopilotService
 * The autonomous response engine of the Sovereign Orchestrator.
 * Automatically executes defensive playbooks based on behavioral correlation verdicts.
 */
export class AutonomousAutopilotService {
    constructor(
        private correlation: CorrelationService,
        private commands: CommandPort,
        private logging: LoggingPort
    ) {}

    /**
     * Continuously monitors the correlation engine for breaches.
     */
    public start() {
        setInterval(() => this.evaluateThreats(), 5000);
    }

    private async evaluateThreats() {
        const chains = this.correlation.getKillChains();
        
        for (const chain of chains) {
            if (chain.isConfirmedBreach && chain.overallRisk >= 100) {
                await this.executeContainment(chain);
            }
        }
    }

    private async executeContainment(chain: KillChain) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "AUTOPILOT",
            message: `AUTONOMOUS CONTAINMENT ENGAGED for subject: ${chain.subject}. Executing 'Full-Lockdown' playbook.`
        });

        // 1. NETWORK BLOCK: Block the attacking IP via eBPF
        if (chain.subject.includes(".")) { // Basic IP check
             await this.commands.sendCommand("sentinel", {
                type: "BLOCK_IP",
                ip: chain.subject,
                id: crypto.randomUUID()
            });
        }

        // 2. PROCESS KILL & DUMP: If it's a local PID, terminate the process tree after forensic dump
        const processNode = chain.stages.exploitation.find(n => n.type === "PROCESS");
        if (processNode && processNode.pid) {
            // 2a. Forensic Dump
            await this.commands.sendCommand("enforcer", {
                type: "DumpProcess",
                pid: processNode.pid,
                path: `forensics_dump_breach_${processNode.pid}.dump`,
                id: crypto.randomUUID()
            });

            // 2b. Active Kill
            await this.commands.sendCommand("enforcer", {
                type: "KillProcess",
                pid: processNode.pid,
                id: crypto.randomUUID()
            });
        }

        // 3. FORENSIC EVIDENCE: Start capturing traffic from this source
        await this.commands.sendCommand("netcap", {
            type: "StartCapture",
            payload: {
                interface: "eth0", 
                filename: `./volume/storage/forensics/forensics_breach_${chain.id.substring(0, 8)}.pcap`
            },
            id: crypto.randomUUID()
        });

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "AUTOPILOT",
            message: `Containment sequence completed. Subject ${chain.subject} is now isolated and under forensic surveillance.`
        });
    }
}
