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

  protected override async onInit(): Promise<Result<void>> {
    this.start();
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
      if (this.unsubscriber) {
          this.unsubscriber();
          this.unsubscriber = undefined;
      }
      return ok(undefined);
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
      const payload = event.data as Record<string, unknown> | undefined;

      // Listen for high-confidence honeypot triggers
      if (event.type === "HONEYPOT" && payload) {
        const ip = typeof payload.source_ip === "string" ? payload.source_ip : typeof payload.ip === "string" ? payload.ip : undefined;
        const eventType = typeof payload.type === "string" ? payload.type : "unknown";
        if (ip) {
            await this.executeBlock(ip, `honeypot:${eventType}`);
        }
      }

      // Listen for critical eBPF alerts
      if (event.type === "EBPF_CRITICAL" && payload) {
          const ip = typeof payload.ip === "string" ? payload.ip : undefined;
          if (ip) {
              await this.executeBlock(ip, "ebpf:critical");
          }

          const pid = typeof payload.pid === "number" ? payload.pid : undefined;
          const anomalyScore = typeof payload.anomalyScore === "number" ? payload.anomalyScore : 0;
          const intent = typeof payload.intent === "string" ? payload.intent : undefined;
          const comm = typeof payload.comm === "string" ? payload.comm : "unknown";
          if (pid && (anomalyScore > 0.8 || intent)) {
              await this.executeIsolation(pid, `ebpf:behavioral:${comm}`);
          }
      }

      // Listen for Exfiltration Alerts
      if (event.type === "EXFIL_ALERT" && payload) {
          const pid = typeof payload.pid === "number" ? payload.pid : undefined;
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
