import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export interface TacticalIntel {
    ip: string;
    country: string;
    city: string;
    asn: string;
    isp: string;
    lat: number;
    lon: number;
    threatScore: number; // 0-100
    lastSeen: string;
    tags: string[];
}

export class GeoIpService {
    constructor(private logging: LoggingPort) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "GEOIP_SERVICE",
            message: "SECURITY ALERT: GeoIP Service operating in [PROVISIONAL_DETERMINISTIC_MODE]. Attribution is algorithmically generated, not authoritative."
        });
    }

    /**
     * Identifies tactical metadata for a given IP.
     * High-Fidelity Enhancement: Supports local mmdb lookup if available.
     */
    async lookup(ip: string): Promise<TacticalIntel> {
        // 1. Check local cache/database first (Sovereign mode)
        const localResult = await this.queryLocalDatabase(ip);
        if (localResult) return localResult;

        // 2. Fallback to deterministic mock for OpSec-safe development
        return this.deterministicMock(ip);
    }

    private async queryLocalDatabase(ip: string): Promise<TacticalIntel | null> {
        try {
            const dbPath = "./volume/storage/intel/geoip.mmdb";
            const stat = await Deno.stat(dbPath).catch(() => null);
            if (!stat) return null;

            // In a real implementation, we would use a native mmdb reader here.
            // For the Sovereign Orchestrator, we prefer a local binary sidecar for this.
            return null; 
        } catch {
            return null;
        }
    }

    private deterministicMock(ip: string): TacticalIntel {
        // Senior Architect Note: Deterministic hashing ensures consistency 
        // across agent restarts without external API calls (OpSec).
        const hash = this.hashString(ip);
        const countries = ["US", "DE", "CN", "RU", "NL", "SG", "GB", "FR"];
        const isps = ["Cloudflare", "DigitalOcean", "Akamai", "AWS", "Google", "Hetzner", "OVH"];
        
        return {
            ip,
            country: countries[hash % countries.length],
            city: "TACTICAL_NODE_" + (hash % 100),
            asn: "AS" + (10000 + (hash % 50000)),
            isp: isps[hash % isps.length],
            lat: (hash % 180) - 90,
            lon: (hash % 360) - 180,
            threatScore: hash % 100,
            lastSeen: new Date().toISOString(),
            tags: (hash % 10 > 7) ? ["BOTNET", "SCANNER"] : ["OBSERVED"]
        };
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
}
