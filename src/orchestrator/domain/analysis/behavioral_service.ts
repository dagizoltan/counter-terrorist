import { BaseService } from "@core/base_service.ts";
import { FirewallPort, EventBusPort } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";

import { AuditService } from "./audit.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { BoundedMap } from "../../core/utils/collections.ts";

interface IpHistory {
  timestamps: number[];
  intervals: number[];
}

export interface SuspiciousIp {
  ip: string;
  attempts: number;
  lastSeen: number;
}

export class BehavioralService extends BaseService {
  private history: BoundedMap<string, IpHistory> = new BoundedMap(1000);
  private metricsInterval?: number;
  private analyzer = new BehavioralAnalyzer();
  private readonly MAX_HISTORY = 10;

  constructor(private firewall: FirewallPort, private audit?: AuditService) {
    super();
  }

  protected override async onInit(): Promise<Result<void>> {

    console.log("BehavioralService initialized");
    this.metricsInterval = setInterval(() => this.emitMetrics(), 15000) as any;
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
      console.log("BehavioralService shutting down");
      if (this.metricsInterval) clearInterval(this.metricsInterval);
      this.analyzer.shutdown();
      return ok(undefined);
  }

  override setEventBus(eventBus: EventBusPort) {
      this.eventBus = eventBus;
      if (this.eventBus) this.eventBus.on("HONEYPOT", (event) => {
          if (event && (event as any).source_ip) {
              this.analyze((event as any).source_ip).catch(e => {
                  console.error(`Behavioral analysis failed for ${(event as any).source_ip}: ${e.message}`);
              });
          }
      });
  }

  private emitMetrics() {
      if (!this.eventBus) return;
      this.eventBus.emit("METRIC_UPDATE", {
          domain: "firewall_behavioral",
          data: {
              suspiciousIps: this.getSuspiciousIps(10) as any
          }
      });
  }
  
  getSuspiciousIps(limit: number = 100): SuspiciousIp[] {
    const result: SuspiciousIp[] = [];
    const iterator = this.history.entries();

    for (let i = 0; i < limit; i++) {
        const { value, done } = iterator.next();
        if (done) break;

        const [ip, stats] = value;
        result.push({
          ip,
          attempts: stats.timestamps.length,
          lastSeen: stats.timestamps[stats.timestamps.length - 1]
        });
    }
    return result;
  }

  async analyze(ip: string): Promise<Result<string>> {
    this.ensureReady();
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
    this.ensureReady();
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
