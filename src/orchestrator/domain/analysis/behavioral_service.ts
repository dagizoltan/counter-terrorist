import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { broadcast } from "@api/ws.ts";

interface IpHistory {
  timestamps: number[];
  intervals: number[];
}

export class BehavioralService {
  private history: Map<string, IpHistory> = new Map();
  private readonly MAX_HISTORY = 10;

  constructor(private firewall: FirewallManager) {}
  
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

    // Keep history lean
    if (stats.timestamps.length > this.MAX_HISTORY) {
      stats.timestamps.shift();
    }
    if (stats.intervals.length > this.MAX_HISTORY) {
      stats.intervals.shift();
    }

    // Only analyze after we have enough intervals
    if (stats.intervals.length >= 8) {
      const entropy = this.calculateEntropy(stats.intervals);
      
      broadcast({
        type: "AUDIT_EVENT",
        data: {
          type: "activity",
          severity: "info",
          caller: "analysis:behavioral",
          message: `Behavioral Analysis: IP ${ip} // Entropy: ${entropy.toFixed(2)}`,
          data: { ip, entropy }
        }
      });

      if (entropy < 1.0) {
        // Highly predictable (Bot/Brute-force script) - Full Block
        await this.firewall.blockIp(ip);
        return "BLOCK";
      } else {
        // High entropy (Human/Manual manipulation or noise) - Shadow Ban (Throttle)
        await this.firewall.shadowBanIp(ip);
        return "SHADOW_BAN";
      }
    }

    // Default to block for first few attempts unless we want to wait
    return "PENDING";
  }

  private calculateEntropy(intervals: number[]): number {
    if (intervals.length === 0) return 0;

    // Bucket intervals (rounding to nearest 100ms for noise reduction)
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
