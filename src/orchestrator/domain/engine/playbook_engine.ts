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
      // 1. SSH Brute Force Detection
      if (event.type === "THREAT" && event.message.includes("SSH Brute Force")) {
        const ip = event.data?.src_ip;
        if (ip) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.CRITICAL,
              caller: "PLAYBOOK",
              message: `SSH Brute Force detected from ${ip}. Executing Block protocol.`
          });
          await this.protection.firewall.blockIp(ip);
        }
      }

      // 2. Critical System Intrusion
      if (event.type === "CRITICAL" && (event.message.includes("Exploit") || event.message.includes("Reverse Shell"))) {
         this.logging.log({
             timestamp: new Date().toISOString(),
             type: LogType.AUDIT,
             severity: LogSeverity.CRITICAL,
             caller: "PLAYBOOK",
             message: "CRITICAL INTRUSION DETECTED. Executing EMERGENCY LOCKDOWN."
         });
         await this.protection.lockdown();
      }

      // 3. Honeypot Interaction
      if (event.type === "HONEYPOT" && event.data?.severity === "CRITICAL") {
        const ip = event.data?.ip;
        if (ip) {
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.AUDIT,
              severity: LogSeverity.CRITICAL,
              caller: "PLAYBOOK",
              message: `Critical Honeypot hit from ${ip}. Pre-emptively blocking.`
          });
          await this.protection.firewall.blockIp(ip);
        }
      }
    });
  }
}
