import { EventBusPort, ProtectionPort, LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export class PlaybookEngine {
  constructor(
    private eventBus: EventBusPort,
    private protection: ProtectionPort,
    private logging: LoggingPort
  ) {}

  start() {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "PLAYBOOK",
        message: "Starting Autonomous Defense Engine..."
    });

    this.eventBus.subscribe(async (event) => {
      // BUG-4.26 FIX: Use structured threat codes for robust matching
      const { TacticalThreatCode } = await import("../../core/event_schema.ts");
      const data = event.data as Record<string, unknown> | undefined;
      const eventType = typeof event.type === "string" ? event.type : "";
      const eventMessage = typeof event.message === "string" ? event.message : "";
      const threatCode = data?.code;

      // 1. SSH Brute Force Detection
      if (eventType === "THREAT" && (threatCode === TacticalThreatCode.SSH_BRUTE_FORCE || eventMessage.includes("SSH Brute Force"))) {
        const ip = typeof data?.src_ip === "string" ? data.src_ip : undefined;
        if (ip) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "PLAYBOOK",
              message: `SSH Brute Force detected from ${ip}. Executing Block protocol.`
          });
          await this.protection.firewall.blockIp(ip);
        }
      }

      // 2. Critical System Intrusion
      if ((eventType === "CRITICAL" || eventType === "THREAT" || eventType === "LEDGER_TAMPER") &&
          (threatCode === TacticalThreatCode.REVERSE_SHELL ||
           threatCode === TacticalThreatCode.EXPLOIT_ATTEMPT ||
           eventMessage.includes("Exploit") ||
           eventMessage.includes("Reverse Shell"))) {
         this.logging.log({
             timestamp: new Date().toISOString(),
             type: LogType.AUDIT,
             severity: LogSeverity.ERROR,
             caller: "PLAYBOOK",
             message: "CRITICAL INTRUSION DETECTED. Executing EMERGENCY LOCKDOWN."
         });
         await this.protection.lockdown();
      }

      // 3. Honeypot Interaction
      if (eventType === "HONEYPOT" &&
          (threatCode === TacticalThreatCode.CRITICAL_HONEYPOT_HIT || eventMessage === "CRITICAL" || data?.severity === "CRITICAL")) {
        const ip = typeof data?.ip === "string" ? data.ip : undefined;
        if (ip) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.ERROR,
              caller: "PLAYBOOK",
              message: `Critical Honeypot hit from ${ip}. Pre-emptively blocking.`
          });
          await this.protection.firewall.blockIp(ip);
        }
      }
    });
  }
}
