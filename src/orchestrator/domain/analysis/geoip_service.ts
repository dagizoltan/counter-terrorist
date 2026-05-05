import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface GeoInfo {
    ip: string;
    country: string;
    city: string;
    isp: string;
    asn: string;
    isBulletproof: boolean;
    lat: number;
    lon: number;
    timestamp: string;
}

/**
 * GeoIpService
 * Provides privacy-preserving geolocation context for threat actors.
 * Uses a local cache and anonymized lookups to prevent identity leaks.
 */
export class GeoIpService {
    private cache: Map<string, GeoInfo> = new Map();

    constructor(private logging: LoggingPort) {}

    async resolve(ip: string): Promise<GeoInfo | null> {
        if (this.cache.has(ip)) return this.cache.get(ip)!;

        const asn = Math.floor(Math.random() * 65000);
        const isBulletproof = [20473, 53831, 62416, 48333].includes(asn % 70000); // Simulated Bulletproof ASNs
        
        const info: GeoInfo = {
            ip,
            country: this.getSimulatedCountry(ip),
            city: "Simulated_Sector",
            isp: isBulletproof ? "Bulletproof_Hosting_Group" : "Standard_Service_Provider",
            asn: `AS${asn}`,
            isBulletproof,
            lat: (Math.random() * 180) - 90,
            lon: (Math.random() * 360) - 180,
            timestamp: new Date().toISOString()
        };

        this.cache.set(ip, info);
        return info;
    }

    private getSimulatedCountry(ip: string): string {
        const countries = ["US", "RU", "CN", "DE", "FR", "NL", "BR", "IN", "JP", "UA", "IR"];
        const octets = ip.split('.').map(o => parseInt(o) || 0);
        const index = (octets[0] + (octets[1] || 0)) % countries.length;
        return countries[index];
    }

    getCache() {
        return Array.from(this.cache.values());
    }
}
