import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { broadcast } from "@api/ws.ts";
import { AuditService } from "./audit.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";

interface IpHistory {
  timestamps: number[];
  intervals: number[];
}

export class BehavioralService {
  private history: Map<string, IpHistory> = new Map();
  private analyzer = new BehavioralAnalyzer();
  private readonly MAX_HISTORY = 10;

  constructor(private firewall: FirewallManager, private audit?: AuditService) {}
  
  getSuspiciousIps() {
    return Array.from(this.history.entries()).map(([ip, stats]) => ({
      ip,
      attempts: stats.timestamps.length,
      lastSeen: stats.timestamps[stats.timestamps.length - 1]
    }));
  }

  async analyze(ip: string) {
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

      broadcast({
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
        return "BLOCK";
      } else {
        await this.firewall.shadowBanIp(ip);
        return "SHADOW_BAN";
      }
    }

    return "PENDING";
  }

  async checkSyscallAnomalies(pid: number, comm: string, syscall: string, args: string[]) {
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
        return "ALERT";
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

       broadcast({
          type: "AUDIT_EVENT",
          data: {
            type: "security",
            severity: "warning",
            caller: "analysis:behavioral",
            message,
            data: { pid, comm, syscall, args }
          }
       });
       return "ALERT";
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

          broadcast({
            type: "AUDIT_EVENT",
            data: {
              type: "forensic",
              severity: "critical",
              caller: "analysis:behavioral",
              message,
              data: { pid, comm, path }
            }
          });
          return "BLOCK_SYSCALL";
       }
    }

    return "PASS";
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
