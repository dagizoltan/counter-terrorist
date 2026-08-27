import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { ok, Result } from "@core/result.ts";
import { GeoIpService } from "./geoip_service.ts";
import { CuratedIntelService } from "./curated_intel_service.ts";

export interface ActiveSocket {
  localIp: string;
  localPort: number;
  remoteIp: string;
  remotePort: number;
  protocol: "tcp" | "udp";
  state: "ESTABLISHED" | "SYN_SENT" | "SYN_RECV" | "TIME_WAIT" | "CLOSE_WAIT" | "LISTEN" | "UNKNOWN";
  pid?: number;
  process?: string;
  geo?: {
    country: string;
    city?: string;
    region?: string;
    lat?: number;
    lon?: number;
  };
  threatScore?: number;
  isThreat?: boolean;
}

export class ActiveSocketService extends BaseService {
  constructor(
    private logging: LoggingPort,
    private geoip?: GeoIpService,
    private intel?: CuratedIntelService
  ) {
    super();
  }

  protected override async onInit(): Promise<Result<void>> {
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    return ok(undefined);
  }

  async listActiveSockets(): Promise<ActiveSocket[]> {
    const sockets: ActiveSocket[] = [];

    try {
      if (Deno.build.os === "linux") {
        const parsed = await this.parseProcNetSockets();
        sockets.push(...parsed);
      } else {
        const parsed = await this.parseNetstatSockets();
        sockets.push(...parsed);
      }
    } catch (e) {
      this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.WARNING,
        caller: "ACTIVE_SOCKET_SERVICE",
        message: `Failed socket enumeration: ${(e as Error).message}`,
      });
    }

    // Enrich remote endpoints with GeoIP & Threat Intel
    for (const s of sockets) {
      if (s.remoteIp && s.remoteIp !== "0.0.0.0" && s.remoteIp !== "127.0.0.1" && s.remoteIp !== "::" && s.remoteIp !== "::1") {
        if (this.geoip) {
          const geo = await this.geoip.resolve(s.remoteIp);
          if (geo) {
            s.geo = {
              country: geo.country || "unknown",
              city: geo.city || "",
              region: geo.region || "",
              lat: geo.lat,
              lon: geo.lon,
            };
          }
        }
        if (this.intel) {
          const threats = await this.intel.getThreats({ search: s.remoteIp, limit: 1 });
          if (threats.threats && threats.threats.length > 0) {
            s.threatScore = threats.threats[0].score;
            s.isThreat = s.threatScore >= 70;
          }
        }
      }
    }

    return sockets;
  }

  private async parseProcNetSockets(): Promise<ActiveSocket[]> {
    const sockets: ActiveSocket[] = [];
    const tcpContent = await Deno.readTextFile("/proc/net/tcp").catch(() => "");
    const tcp6Content = await Deno.readTextFile("/proc/net/tcp6").catch(() => "");

    const STATE_MAP: Record<string, ActiveSocket["state"]> = {
      "01": "ESTABLISHED",
      "02": "SYN_SENT",
      "03": "SYN_RECV",
      "06": "TIME_WAIT",
      "08": "CLOSE_WAIT",
      "0A": "LISTEN",
    };

    const parseLines = (content: string, isV6: boolean) => {
      const lines = content.split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        const local = parseHexAddr(parts[1], isV6);
        const remote = parseHexAddr(parts[2], isV6);
        const hexState = parts[3];
        const state = STATE_MAP[hexState] || "UNKNOWN";

        // Ignore LISTEN here as listening-ports handles LISTEN
        if (state === "LISTEN" || !remote.ip || remote.ip === "0.0.0.0" || remote.ip === "::") continue;

        sockets.push({
          localIp: local.ip,
          localPort: local.port,
          remoteIp: remote.ip,
          remotePort: remote.port,
          protocol: "tcp",
          state,
        });
      }
    };

    if (tcpContent) parseLines(tcpContent, false);
    if (tcp6Content) parseLines(tcp6Content, true);

    return sockets;
  }

  private async parseNetstatSockets(): Promise<ActiveSocket[]> {
    const sockets: ActiveSocket[] = [];
    const command = new Deno.Command("netstat", {
      args: ["-an"],
      stdout: "piped",
      stderr: "null",
    });

    const { stdout } = await command.output().catch(() => ({ stdout: new Uint8Array() }));
    const text = new TextDecoder().decode(stdout);
    const lines = text.split("\n");

    for (const line of lines) {
      if (!line.includes("ESTABLISHED") && !line.includes("SYN_SENT") && !line.includes("TIME_WAIT")) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const proto = parts[0].toLowerCase().includes("udp") ? "udp" : "tcp";
      const local = parseHostPort(parts[3] || parts[1]);
      const remote = parseHostPort(parts[4] || parts[2]);
      const rawState = (parts[5] || parts[3] || "").toUpperCase();

      const state: ActiveSocket["state"] =
        rawState.includes("ESTAB") ? "ESTABLISHED" :
        rawState.includes("SYN") ? "SYN_SENT" :
        rawState.includes("TIME") ? "TIME_WAIT" : "UNKNOWN";

      if (remote.ip && remote.ip !== "0.0.0.0" && remote.ip !== "*") {
        sockets.push({
          localIp: local.ip,
          localPort: local.port,
          remoteIp: remote.ip,
          remotePort: remote.port,
          protocol: proto,
          state,
        });
      }
    }

    return sockets;
  }
}

function parseHexAddr(hexStr: string, isV6: boolean): { ip: string; port: number } {
  const [ipHex, portHex] = hexStr.split(":");
  const port = parseInt(portHex || "0", 16);
  if (!isV6) {
    const num = parseInt(ipHex || "0", 16);
    const ip = `${num & 0xff}.${(num >> 8) & 0xff}.${(num >> 16) & 0xff}.${(num >> 24) & 0xff}`;
    return { ip, port };
  } else {
    return { ip: "IPv6", port };
  }
}

function parseHostPort(str: string): { ip: string; port: number } {
  if (!str) return { ip: "", port: 0 };
  const idx = str.lastIndexOf(":");
  if (idx === -1) return { ip: str, port: 0 };
  const ip = str.substring(0, idx).replace(/^\[|\]$/g, "");
  const port = parseInt(str.substring(idx + 1), 10) || 0;
  return { ip, port };
}
