import { ServiceContainer } from "@core/container.ts";
import { LogType, LogSeverity } from "@core/ports.ts";
import { ThreatEvent } from "../autonomous_response.ts";
import { Result, ok, err } from "@core/result.ts";

/**
 * ThreatResponseSaga
 * Coordinates complex, multi-stage responses to high-severity threat events.
 * This decouples coordination logic from pure domain services like MeshManager.
 */
export class ThreatResponseSaga {
    constructor(private services: ServiceContainer) {}

    /**
     * Executes a coordinated response to a critical threat.
     * Stage 1: Local Lockdown/Blocking
     * Stage 2: Forensic Capture
     * Stage 3: Fleet-wide Gossip/Alerting
     * Stage 4: Mesh-wide Consensus (if required)
     */
    async executeCoordinatedResponse(event: ThreatEvent): Promise<Result<void>> {
        const { source, type, severity } = event;

        await this.services.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.CRITICAL,
            caller: "SAGA:THREAT_RESPONSE",
            message: `Initiating coordinated response saga for ${type} from ${source}`
        });

        try {
            // Stage 1: Local Remediation via AutonomousResponseEngine
            const remediationResult = await (this.services.autopilot as any).evaluate(event);
            if (!remediationResult.success) {
                return err(remediationResult.error);
            }

            // Stage 2: Forensic Capture (Async)
            this.initiateForensics(event).catch(e => {
                this.services.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "SAGA:FORENSICS",
                    message: `Forensic capture failed: ${e.message}`
                });
            });

            // Stage 3: Fleet-wide Gossip
            if (severity >= 8) {
                if (source.includes(".")) {
                    await this.services.mesh.broadcastBlock(source);
                } else {
                    const pid = parseInt(source);
                    if (!isNaN(pid)) {
                        const hash = await this.services.forensicService.calculateProcessHash(pid);
                        if (hash) {
                            await this.services.mesh.broadcastThreatHash(hash, Deno.hostname());
                        }
                    }
                }

                if (severity >= 10) {
                    await this.services.mesh.broadcastLockdown();
                }
            }

            // Stage 4: Mesh Consensus for Irreversible Actions
            if (severity >= 10 && !this.services.config.getBoolean("SINGLE_NODE", false)) {
                const consensus = await this.services.mesh.requestQuorumCommand("ISOLATE_NODE", { source });
                if (!consensus) {
                    await this.services.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "SAGA:CONSENSUS",
                        message: "Mesh-wide consensus for node isolation DENIED. Local remediation remains active."
                    });
                } else {
                    await this.services.mesh.isolateNode(Deno.hostname());
                }
            }

            return ok(undefined);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            return err(error);
        }
    }

    private async initiateForensics(event: ThreatEvent) {
        const { source } = event;
        if (source.includes(".")) {
            await this.services.protection.pcap.startCapture("any", 60, `saga_forensics_${source}.pcap`, `host ${source}`);
        } else {
            const pid = parseInt(source);
            if (!isNaN(pid)) {
                await this.services.forensicService.captureProcessArtifacts(pid);
            }
        }
    }
}
