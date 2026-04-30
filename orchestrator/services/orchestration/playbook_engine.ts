import { EventBusPort, ProtectionPort, SyslogSeverity, LoggingPort } from "../../core/ports.ts";

export class PlaybookEngine {
  constructor(
    private eventBus: EventBusPort,
    private protection: ProtectionPort,
    private logging: LoggingPort
  ) {}

  start() {
    this.logging.log("[PLAYBOOK] Starting Autonomous Defense Engine...", SyslogSeverity.NOTICE);

    this.eventBus.subscribe(async (event) => {
      // 1. SSH Brute Force Detection
      if (event.type === "THREAT" && event.message.includes("SSH Brute Force")) {
        const ip = event.data?.src_ip;
        if (ip) {
          this.logging.log(`[PLAYBOOK] SSH Brute Force detected from ${ip}. Executing Block protocol.`, SyslogSeverity.ALERT);
          await this.protection.firewall.blockIp(ip);
        }
      }

      // 2. Critical System Intrusion
      if (event.type === "CRITICAL" && (event.message.includes("Exploit") || event.message.includes("Reverse Shell"))) {
         this.logging.log("[PLAYBOOK] CRITICAL INTRUSION DETECTED. Executing EMERGENCY LOCKDOWN.", SyslogSeverity.EMERGENCY);
         await this.protection.lockdown();
      }

      // 3. Honeypot Interaction
      if (event.type === "HONEYPOT" && event.data?.severity === "CRITICAL") {
        const ip = event.data?.ip;
        if (ip) {
          this.logging.log(`[PLAYBOOK] Critical Honeypot hit from ${ip}. Pre-emptively blocking.`, SyslogSeverity.ALERT);
          await this.protection.firewall.blockIp(ip);
        }
      }
    });
  }
}
