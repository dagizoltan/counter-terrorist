import { BaseService } from "@core/base_service.ts";
import { FirewallPort } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";

import { AuditService } from "./audit.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";

interface IpHistory {
  timestamps: number[];
  intervals: number[];
}

export class BehavioralService extends BaseService {
  private history: Map<string, IpHistory> = new Map();
  private eventBus?: any;
  private metricsInterval?: number;
  private analyzer = new BehavioralAnalyzer();
  private readonly MAX_HISTORY = 10;

  constructor(private firewall: FirewallPort, private audit?: AuditService) {
    super();
    this.metricsInterval = setInterval(() => this.emitMetrics(), 15000);
  }

  async shutdown(): Promise<Result<void>> {
      if (this.metricsInterval) clearInterval(this.metricsInterval);
      this.analyzer.shutdown();
      return ok(undefined);
  }

  setEventBus(eventBus: any) {
      this.eventBus = eventBus;
      this.eventBus.on("HONEYPOT", (event: any) => {
          if (event && event.source_ip) {
              this.analyze(event.source_ip).catch(() => {});
          }
      });
  }

  private emitMetrics() {
      if (!this.eventBus) return;
      this.eventBus.emit("METRIC_UPDATE", {
          domain: "firewall_behavioral",
          data: {
              suspiciousIps: this.getSuspiciousIps().slice(0, 10)
          }
      });
  }
  
  getSuspiciousIps() {
    return Array.from(this.history.entries()).map(([ip, stats]) => ({
      ip,
      attempts: stats.timestamps.length,
      lastSeen: stats.timestamps[stats.timestamps.length - 1]
    }));
  }

  async analyze(ip: string): Promise<Result<string>> {
    const now = Date.now();
    let stats = this.history.get(ip);

    if (!stats) {
      stats = { timestamps: [], intervals: [] };
      this.history.set(ip, stats);
    }

    if (stats.timestamps.length > 0) {
      const interval = now - stats.timestamps[stats.timestamps.length - 1];
      stats.intervals.push(interval);
    }

    stats.timestamps.push(now);

    if (stats.timestamps.length > this.MAX_HISTORY) {
      stats.timestamps.shift();
    }
    if (stats.intervals.length > this.MAX_HISTORY) {
      stats.intervals.shift();
    }

    if (stats.intervals.length >= 8) {
      const entropy = this.calculateEntropy(stats.intervals);
      
      const message = `Behavioral Analysis: IP ${ip} // Entropy: ${entropy.toFixed(2)}`;
      
      if (this.audit) {
        await this.audit.logEvent({
            type: "activity",
            severity: "info",
            caller: "analysis:behavioral",
            message,
            data: { ip, entropy }
        });
      }

      if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
        type: "AUDIT_EVENT",
        data: {
          type: "activity",
          severity: "info",
          caller: "analysis:behavioral",
          message,
          data: { ip, entropy }
        }
      });

      if (entropy < 1.0) {
        await this.firewall.blockIp(ip);
        return ok("BLOCK");
      } else {
        await this.firewall.shadowBanIp(ip);
        return ok("SHADOW_BAN");
      }
    }

    return ok("PENDING");
  }

  async checkSyscallAnomalies(pid: number, comm: string, syscall: string, args: string[]): Promise<Result<string>> {
    // 1. Neural Analysis (Syscall Frequency Anomaly)
    this.analyzer.trackSyscall(pid, comm, syscall);
    const anomalyScore = this.analyzer.getSyscallAnomalyScore(comm, syscall);

    if (anomalyScore > 0.8) {
        const message = `NEURAL_DEFENSE: Anomalous syscall distribution detected for '${comm}' (${syscall}). Potential polymorphic malware.`;
        if (this.audit) {
            await this.audit.logEvent({
               type: "THREAT",
               severity: "warning",
               caller: "analysis:neural",
               message,
               data: { pid, comm, syscall, score: anomalyScore }
            });
        }
        return ok("ALERT");
    }

    const suspiciousCommands = ["curl", "wget", "chmod", "chown", "nc", "netcat"];
    const sensitiveDirs = ["/etc", "/var/run", "/boot", "/root"];

    if (suspiciousCommands.includes(comm) && syscall === "execve") {
       const message = `SUSPICIOUS_EXECUTION: Process '${comm}' (PID: ${pid}) attempted ${syscall} with sensitive pattern.`;
       
       if (this.audit) {
         await this.audit.logEvent({
            type: "security",
            severity: "warning",
            caller: "analysis:behavioral",
            message,
            data: { pid, comm, syscall, args }
         });
       }

       if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
          type: "AUDIT_EVENT",
          data: {
            type: "security",
            severity: "warning",
            caller: "analysis:behavioral",
            message,
            data: { pid, comm, syscall, args }
          }
       });
       return ok("ALERT");
    }

    if (syscall === "openat" || syscall === "open") {
       const path = args[0] || "";
       if (sensitiveDirs.some(dir => path.startsWith(dir)) && !comm.includes("systemd")) {
          const message = `UNAUTHORIZED_ACCESS: Process '${comm}' attempted to access sensitive path: ${path}`;
          
          if (this.audit) {
            await this.audit.logEvent({
                type: "forensic",
                severity: "critical",
                caller: "analysis:behavioral",
                message,
                data: { pid, comm, path }
            });
          }

          if (this.eventBus) this.eventBus.emit("UI_BROADCAST", {
            type: "AUDIT_EVENT",
            data: {
              type: "forensic",
              severity: "critical",
              caller: "analysis:behavioral",
              message,
              data: { pid, comm, path }
            }
          });
          return ok("BLOCK_SYSCALL");
       }
    }

    return ok("PASS");
  }

  private calculateEntropy(intervals: number[]): number {
    if (intervals.length === 0) return 0;
    const buckets: Map<number, number> = new Map();
    for (const interval of intervals) {
      const bucket = Math.round(interval / 100) * 100;
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    let entropy = 0;
    const total = intervals.length;
    for (const count of buckets.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }
}
