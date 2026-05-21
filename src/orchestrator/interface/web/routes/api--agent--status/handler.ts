import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { getMetricsSnapshot } from "@domain/analysis/metrics_service.ts";

export const handlerFactory = (_services: ServiceContainer) => {
  return async (c: Context) => {
    const metrics = getMetricsSnapshot();
    return c.json({
      firewall: { active: true, pid: _services.command.getPID("enforcer"), capabilities: ["PACKET_FILTER", "RATE_LIMITING", "IP_ISOLATION"], root: true, metrics: metrics?.firewall },
      vpn: { active: await _services.protection.vpn.isConnected(), capabilities: ["MTLS_TUNNEL", "ENCRYPTED_MESH"], root: true, interface: "wg0", metrics: metrics?.vpn },
      ebpf: { active: _services.command.isRunning("sentinel"), capabilities: ["LSM", "SYSCALL_HOOK", "PID_HIDING"], root: true, metrics: metrics?.forensics },
      fim: { active: _services.command.isRunning("watchfile"), capabilities: ["INOTIFY", "AUDIT_LOGGING"], root: true, metrics: metrics?.forensics },
      honeypot: { active: _services.command.isRunning("decoy"), capabilities: ["DECEPTION", "LOGGING"], root: false, metrics: metrics?.honeypot }
    });
  };
};
