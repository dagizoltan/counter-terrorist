import { BaseService } from "@core/base_service.ts";
import { FirewallPort } from "@core/ports.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";

/**
 * AutoBlockService
 * Autonomous threat response engine that consumes security events
 * and enforces immediate firewall blocks.
 */
export class AutoBlockService extends BaseService {
  private unsubscriber?: () => void;

  constructor(
    private firewall: FirewallPort,
    private logging: LoggingPort
  ) {
    super();
  }

  override async init(): Promise<Result<void>> {
    if (this.initialized) return ok(undefined);
    this.start();
    this.initialized = true;
    return ok(undefined);
  }

  override async shutdown(): Promise<Result<void>> {
      if (this.unsubscriber) {
          this.unsubscriber();
          this.unsubscriber = undefined;
      }
      this.initialized = false;
      return await super.shutdown();
  }

  private start() {
    this.logging.log({
      timestamp: new Date().toISOString(),
      type: LogType.ACTIVITY,
      severity: LogSeverity.INFO,
      caller: "orchestrator:domain:protection:auto_block",
      message: "Automated Threat Response engine engaged."
    });

    if (!this.eventBus) return;
    this.unsubscriber = this.eventBus.subscribe(async (event) => {
      // Listen for high-confidence honeypot triggers
      if (event.type === "HONEYPOT") {
        const ip = event.data?.source_ip || event.data?.ip;
        if (ip && typeof ip === "string") {
            await this.executeBlock(ip, `honeypot:${event.data.type}`);
        }
      }

      // Listen for critical eBPF alerts
      if (event.type === "EBPF_CRITICAL") {
          const ip = event.data?.ip;
          if (ip) {
              await this.executeBlock(ip, "ebpf:critical");
          }

          // If the event has a PID and indicates a severe behavioral anomaly, isolate the process
          if (event.data?.pid && (event.data?.anomalyScore > 0.8 || event.data?.intent)) {
              await this.executeIsolation(event.data.pid, `ebpf:behavioral:${event.data.comm || 'unknown'}`);
          }
      }

      // Listen for Exfiltration Alerts
      if (event.type === "EXFIL_ALERT") {
          const pid = event.data?.pid;
          if (pid) {
              await this.executeIsolation(pid, "pcap:exfil_threshold_exceeded");
          }
      }
    });
  }

  private async executeIsolation(pid: number, reason: string) {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:protection:auto_block",
        message: `PROCESS ISOLATION: Automated LSM lockdown for PID ${pid} (Reason: ${reason})`
    });

    try {
        const result = await this.firewall.enforcePid(pid);
        if (result.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:domain:protection:auto_block",
                message: `Successfully restricted PID ${pid} via LSM.`
            });
        } else {
            // Fallback to Quarantine if LSM fails
            await this.firewall.quarantineProcess(pid);
        }
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:protection:auto_block",
            message: `Process isolation failure for ${pid}: ${(e as Error).message}`
        });
    }
  }

  private async executeBlock(ip: string, trigger: string) {
    // Prevent self-blocking or blocking critical infrastructure
    // (Verification logic is also inside firewall.blockIp, but we log here)

    this.logging.log({
      timestamp: new Date().toISOString(),
      type: LogType.AUDIT,
      severity: LogSeverity.WARNING,
      caller: "orchestrator:domain:protection:auto_block",
      message: `THREAT MITIGATION: Automated block triggered for ${ip} (Source: ${trigger})`
    });

    try {
      const result = await this.firewall.blockIp(ip);
      if (result.success) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.SUCCESS,
              caller: "orchestrator:domain:protection:auto_block",
              message: `Successfully neutralized threat from ${ip}`
          });
      } else {
          throw new Error(result.stderr || "Firewall rejected block command");
      }
    } catch (e) {
      this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:domain:protection:auto_block",
        message: `Countermeasure failure for ${ip}: ${(e as Error).message}`
      });
    }
  }
}
