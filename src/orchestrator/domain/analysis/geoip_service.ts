import { ok } from "@core/result.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { MmdbReader } from "@infrastructure/system/geoip/mmdb_reader.ts";

/** How the location was obtained — the map renders estimated points differently. */
export type GeoPrecision = "city" | "country" | "estimated";

export interface TacticalIntel {
    ip: string;
    country: string;   // ISO code, or "" when only estimated
    city: string;      // "" when unknown
    asn: string;       // "" unless an ASN database resolved it
    isp: string;       // "" unless an ASN database resolved it
    lat: number;
    lon: number;
    /**
     * How trustworthy the location is. "city"/"country" come from a real local
     * database; "estimated" is an RIR-allocation guess (continent-level only).
     */
    precision: GeoPrecision;
    /** True only for "estimated" — the caller/UI must not present it as fact. */
    provisional: boolean;
    /** Human region label for estimated points (e.g. "Europe / Eurasia"). */
    region?: string;
    lastSeen: string;
    tags: string[];
}

const DEFAULT_DB = "./volume/storage/intel/geoip.mmdb";
const DEFAULT_ASN_DB = "./volume/storage/intel/geoip-asn.mmdb";

/**
 * Resolves an IP to a location.
 *
 * Preference order: (1) a real local MaxMind-format database (DB-IP Lite,
 * IP2Location LITE, or GeoLite2) if the operator has provisioned one — no
 * network, no external API, so the sovereign posture holds; (2) a continent-
 * level estimate from real RIR allocation ranges, plainly flagged provisional.
 * It never fabricates a specific country or city: an estimate reports its
 * region and nothing finer.
 */
export class GeoIpService extends BaseService {
    private cache: Map<string, TacticalIntel> = new Map();
    private cityDb: MmdbReader | null = null;
    private asnDb: MmdbReader | null = null;
    private dbTried = false;

    constructor(private logging: LoggingPort) {
        super();
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        await this.loadDatabases();
        if (!this.cityDb) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "GEOIP_SERVICE",
                message: "GeoIP running in ESTIMATED mode: no local database at " +
                    (this.dbPath()) + ". Locations are continent-level RIR estimates, flagged provisional. " +
                    "Provision a DB-IP/IP2Location/GeoLite2 .mmdb for real attribution.",
            });
        } else {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "GEOIP_SERVICE",
                message: `GeoIP resolving against local database (${this.cityDb.metadata.databaseType})` +
                    (this.asnDb ? " with ASN enrichment" : ""),
            });
        }
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        return ok(undefined);
    }

    /** True when a real geolocation database is loaded (not estimated mode). */
    hasDatabase(): boolean {
        return this.cityDb !== null;
    }

    async lookup(ip: string): Promise<TacticalIntel> {
        const cached = this.cache.get(ip);
        if (cached) return cached;

        if (!this.dbTried) await this.loadDatabases();

        const fromDb = this.queryLocalDatabase(ip);
        const result = fromDb ?? this.estimate(ip);
        this.cache.set(ip, result);
        return result;
    }

    async resolve(ip: string): Promise<TacticalIntel> {
        return this.lookup(ip);
    }

    /** Current state of the GeoIP cache, for metrics. */
    getCache(): Record<string, TacticalIntel> {
        return Object.fromEntries(this.cache.entries());
    }

    private dbPath(): string {
        return safeEnv("CTS_GEOIP_DB") || DEFAULT_DB;
    }

    private async loadDatabases(): Promise<void> {
        this.dbTried = true;
        this.cityDb = await this.tryOpen(this.dbPath());
        this.asnDb = await this.tryOpen(safeEnv("CTS_GEOIP_ASN_DB") || DEFAULT_ASN_DB);
    }

    private async tryOpen(path: string): Promise<MmdbReader | null> {
        try {
            const stat = await Deno.stat(path).catch(() => null);
            if (!stat || !stat.isFile) return null;
            return await MmdbReader.open(path);
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "GEOIP_SERVICE",
                message: `Failed to open GeoIP database ${path}: ${(e as Error).message}`,
            });
            return null;
        }
    }

    /** Real lookup against the loaded database. Returns null on a miss. */
    private queryLocalDatabase(ip: string): TacticalIntel | null {
        if (!this.cityDb) return null;
        let rec: Record<string, unknown> | null;
        try {
            rec = this.cityDb.lookup(ip) as Record<string, unknown> | null;
        } catch {
            return null;
        }
        if (!rec) return null;

        if (typeof rec !== "object") return null;
        const country = pick(rec, ["country", "iso_code"]) ?? pick(rec, ["country", "country_code"]) ?? "";
        const city = pick(rec, ["city", "names", "en"]) ?? "";
        const loc = (rec.location && typeof rec.location === "object" ? rec.location : {}) as Record<string, unknown>;
        const lat = typeof loc.latitude === "number" ? loc.latitude : null;
        const lon = typeof loc.longitude === "number" ? loc.longitude : null;
        if (lat === null || lon === null) return null; // a record with no coordinates is not plottable

        let asn = "";
        let isp = "";
        if (this.asnDb) {
            try {
                const a = this.asnDb.lookup(ip) as Record<string, unknown> | null;
                if (a) {
                    const num = a.autonomous_system_number;
                    if (typeof num === "number") asn = "AS" + num;
                    isp = (a.autonomous_system_organization as string) ?? (a.isp as string) ?? "";
                }
            } catch { /* ASN enrichment is best-effort */ }
        }

        return {
            ip,
            country: String(country),
            city: String(city),
            asn,
            isp,
            lat,
            lon,
            precision: city ? "city" : "country",
            provisional: false,
            lastSeen: new Date().toISOString(),
            tags: ["GEOIP_DB", this.cityDb.metadata.databaseType],
        };
    }

    /**
     * Continent-level estimate from real RIR allocation ranges. Honest by
     * construction: it fixes only the region a block was allocated to and plots
     * the region centroid — country, city, ASN and ISP are left empty rather
     * than invented, and the result is flagged provisional.
     */
    private estimate(ip: string): TacticalIntel {
        const parts = ip.split(".").map((p) => parseInt(p, 10));
        const o1 = Number.isFinite(parts[0]) ? parts[0] : 0;
        const o2 = Number.isFinite(parts[1]) ? parts[1] : 0;
        const o3 = Number.isFinite(parts[2]) ? parts[2] : 0;
        const o4 = Number.isFinite(parts[3]) ? parts[3] : 0;

        let region = "North America";
        let lat = 40.0, lon = -100.0; // ARIN centroid

        if ((o1 >= 62 && o1 <= 95) || o1 === 109 || o1 === 141 ||
            (o1 >= 176 && o1 <= 188) || (o1 >= 193 && o1 <= 195) || (o1 >= 212 && o1 <= 217)) {
            region = "Europe / Eurasia"; lat = 50.0; lon = 15.0;                 // RIPE NCC
        } else if (o1 === 1 || o1 === 14 || o1 === 27 || o1 === 36 || o1 === 39 || o1 === 42 || o1 === 49 ||
            (o1 >= 58 && o1 <= 61) || o1 === 101 || o1 === 103 || (o1 >= 110 && o1 <= 126) || o1 === 175 ||
            (o1 >= 180 && o1 <= 183) || (o1 >= 202 && o1 <= 203) || o1 === 210 || o1 === 211 || (o1 >= 218 && o1 <= 223)) {
            region = "Asia-Pacific"; lat = 20.0; lon = 100.0;                    // APNIC
        } else if ((o1 >= 177 && o1 <= 179) || (o1 >= 186 && o1 <= 191) || o1 === 200 || o1 === 201) {
            region = "Latin America"; lat = -15.0; lon = -60.0;                  // LACNIC
        } else if (o1 === 41 || o1 === 102 || o1 === 105 || o1 === 197) {
            region = "Africa"; lat = 5.0; lon = 20.0;                            // AFRINIC
        }

        // Deterministic spatial jitter per IP so region estimates scatter across their geographic area
        const hashLat = ((o2 * 31 + o3 * 17 + o4 * 7) % 1000) / 1000 - 0.5;
        const hashLon = ((o2 * 13 + o3 * 37 + o4 * 23) % 1000) / 1000 - 0.5;

        lat = Math.round((Math.max(-85, Math.min(85, lat + hashLat * 16.0))) * 10000) / 10000;
        lon = Math.round((Math.max(-180, Math.min(180, lon + hashLon * 30.0))) * 10000) / 10000;

        return {
            ip,
            country: "",
            city: "",
            asn: "",
            isp: "",
            lat,
            lon,
            precision: "estimated",
            provisional: true,
            region,
            lastSeen: new Date().toISOString(),
            tags: ["RIR_ESTIMATED", region],
        };
    }
}

/** Read an env var without throwing if --allow-env is not granted. */
function safeEnv(name: string): string | undefined {
    try {
        return Deno.env.get(name) ?? undefined;
    } catch {
        return undefined;
    }
}

/** Safely walk a nested-object path, returning a string leaf or undefined. */
function pick(obj: Record<string, unknown>, path: string[]): string | undefined {
    let cur: unknown = obj;
    for (const key of path) {
        if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[key];
        } else {
            return undefined;
        }
    }
    return typeof cur === "string" ? cur : undefined;
}
