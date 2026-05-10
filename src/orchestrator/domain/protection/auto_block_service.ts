import { EventBus } from "../analysis/events.ts";
import { FirewallPort } from "@core/ports.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

/**
 * AutoBlockService
 * Autonomous threat response engine that consumes security events
 * and enforces immediate firewall blocks.
 */
export class AutoBlockService {
  constructor(
    private eventBus: EventBus,
    private firewall: FirewallPort,
    private logging: LoggingPort
  ) {
    this.start();
  }

  private start() {
    this.logging.log({
      timestamp: new Date().toISOString(),
      type: LogType.ACTIVITY,
      severity: LogSeverity.INFO,
      caller: "AUTO_BLOCK",
      message: "Automated Threat Response engine engaged."
    });

    this.eventBus.subscribe(async (event) => {
      // Listen for high-confidence honeypot triggers
      if (event.type === "AUDIT_EVENT" && event.data?.caller?.startsWith("decoy:")) {
        const payload = event.data?.payload;
        const ip = payload?.source_ip || payload?.ip;

        if (ip && typeof ip === "string") {
            await this.executeBlock(ip, event.data.caller);
        }
      }

      // Listen for critical eBPF alerts
      if (event.type === "EBPF_CRITICAL") {
          const ip = event.data?.ip;
          if (ip) {
              await this.executeBlock(ip, "ebpf:critical");
          }
      }
    });
  }

  private async executeBlock(ip: string, trigger: string) {
    // Prevent self-blocking or blocking critical infrastructure
    // (Verification logic is also inside firewall.blockIp, but we log here)

    this.logging.log({
      timestamp: new Date().toISOString(),
      type: LogType.AUDIT,
      severity: LogSeverity.WARNING,
      caller: "AUTO_BLOCK",
      message: `THREAT MITIGATION: Automated block triggered for ${ip} (Source: ${trigger})`
    });

    try {
      const result = await this.firewall.blockIp(ip);
      if (result.success) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.SUCCESS,
              caller: "AUTO_BLOCK",
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
        caller: "AUTO_BLOCK",
        message: `Countermeasure failure for ${ip}: ${(e as Error).message}`
      });
    }
  }
}
