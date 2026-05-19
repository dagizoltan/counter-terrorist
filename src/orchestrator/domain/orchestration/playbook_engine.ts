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
      const threatCode = event.data?.code;

      // 1. SSH Brute Force Detection
      if (event.type === "THREAT" && (threatCode === TacticalThreatCode.SSH_BRUTE_FORCE || event.message.includes("SSH Brute Force"))) {
        const ip = event.data?.src_ip;
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
      if ((event.type === "CRITICAL" || event.type === "THREAT") &&
          (threatCode === TacticalThreatCode.REVERSE_SHELL ||
           threatCode === TacticalThreatCode.EXPLOIT_ATTEMPT ||
           event.type === "LEDGER_TAMPER" ||
           event.message.includes("Exploit") ||
           event.message.includes("Reverse Shell"))) {
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
      if (event.type === "HONEYPOT" &&
          (threatCode === TacticalThreatCode.CRITICAL_HONEYPOT_HIT || event.data?.severity === "CRITICAL")) {
        const ip = event.data?.ip;
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
