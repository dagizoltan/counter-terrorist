import { WebAdapter } from "./interface/web/web_adapter.tsx";
import { ProtectionAdapter } from "@infrastructure/system/protection/protection_adapter.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { BaselineService, ProcessTracker, SessionService, ApiKeysService, EventBus, MeshAuthService } from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
// Try to load .env but don't fail if some variables are missing from example
await load({ export: true, allowEmptyValues: true });

import { z } from "npm:zod";
import { ServiceContainer } from "@core/container.ts";
import { MeshManager, setMeshManager } from "@domain/engine/mesh.ts";
import { PlaybookService } from "@domain/engine/playbook_service.ts";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@api/ws.ts";
import { PlaybookEngine } from "@domain/engine/playbook_engine.ts";
import { BehavioralService } from "@domain/analysis/behavioral_service.ts";
import { MetricsService, setMetricsService } from "@domain/analysis/metrics_service.ts";
import { ShadowProtocolService } from "@domain/protection/shadow_protocol_service.ts";
import { GeoIpService } from "@domain/analysis/geoip_service.ts";
import { AnonymizationService } from "@domain/protection/anonymization_service.ts";
import { CuratedIntelService } from "@domain/analysis/curated_intel_service.ts";
import { NewsSignalService } from "@domain/analysis/news_signal_service.ts";
import { DeceptionGridService } from "@domain/protection/deception_grid.ts";
import { MorphingService } from "@domain/protection/morphing_service.ts";
import { ChaosEngine } from "@domain/engine/chaos_engine.ts";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";
import { CanaryService } from "@domain/protection/canary_service.ts";
import { AutopilotService } from "@domain/engine/autopilot_service.ts";
import { KernelService } from "@domain/protection/kernel_service.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { LedgerService } from "@domain/analysis/ledger_service.ts";
import { GovernanceService } from "@domain/engine/governance_service.ts";
import { ShadowService } from "@domain/protection/shadow_service.ts";
import { CovertChannelService } from "@domain/engine/covert_service.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { ProvisioningService } from "@domain/engine/provisioning_service.ts";
import { SidecarEvent } from "@infrastructure/system/validation.ts";
import { TacticalIntelIngestor } from "@domain/analysis/tactical_intel_ingestor.ts";
import { NetworkDiscoveryService } from "@domain/analysis/network_discovery.ts";
import { NetworkLogService } from "@domain/analysis/network_log_service.ts";
import { IncidentService } from "@domain/analysis/incident_service.ts";
import { ComplianceService } from "@domain/analysis/compliance_service.ts";

import { loadConfig } from "./core/config_schema.ts";

// ── Phase 1: Core infrastructure ──────────────────────────────────────
await loggingService.log("Initiating Sovereign Boot Sequence", SyslogSeverity.NOTICE, "BOOT");
await camouflage();
const config = loadConfig();
const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const configProvider = new EnvConfigProvider(config);
const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);
const platformInfo = await getPlatformInfo();
const systemStatus = await bootstrap();
await loggingService.log("Core infrastructure initialized", SyslogSeverity.INFORMATIONAL, "BOOT", { platform: platformInfo.os, isRoot: systemStatus.isRoot });

// ── Phase 2: Service layer ────────────────────────────────────────────
await loggingService.log("Orchestrating domain services", SyslogSeverity.INFORMATIONAL, "BOOT");
const tpmManager = new TPMManager(executor, loggingService);
const auditService = new AuditService(kv, loggingService, tpmManager);
const notificationService = new NotificationService(kv, loggingService);
const eventBus = new EventBus(loggingService);
const networkLogService = new NetworkLogService(kv, loggingService);
const incidentService = new IncidentService(kv, loggingService);
const meshAuthService = new MeshAuthService(kv, tpmManager);
const meshManager = new MeshManager(meshAuthService, loggingService, auditService);
setMeshManager(meshManager);
await meshManager.init();
meshManager.startDiscovery();

const complianceService = new ComplianceService(auditService, kv);

// HARDWARE INTEGRITY ENFORCEMENT
const goldenPcrs: Record<number, string> = {};
for (const [key, value] of Object.entries(Deno.env.toObject())) {
    if (key.startsWith("TPM_GOLDEN_PCR_")) {
        const index = parseInt(key.replace("TPM_GOLDEN_PCR_", ""));
        if (!isNaN(index)) goldenPcrs[index] = value;
    }
}

const isHardwareSecure = await tpmManager.verifyIntegrity(goldenPcrs);
const bypassHardware = Deno.env.get("ALLOW_HARDWARE_BYPASS") === "true";

if (!isHardwareSecure && !bypassHardware) {
    await loggingService.log("HARDWARE INTEGRITY FAILURE. TAMPER DETECTED OR NO BASELINE SET.", SyslogSeverity.EMERGENCY, "SECURITY");
    if (Object.keys(goldenPcrs).length === 0) {
        const current = await tpmManager.getPcrs();
        console.log("\n[SETUP] No Golden PCR baseline found. To establish trust, set the following environment variables:");
        for (const [idx, val] of Object.entries(current)) {
            console.log(`TPM_GOLDEN_PCR_${idx}=${val}`);
        }
        console.log("");
    }
    await selfDestruct(kv, auditService);
} else if (!isHardwareSecure && bypassHardware) {
    await loggingService.log("Hardware integrity bypass active. Running in software-trust mode.", SyslogSeverity.WARNING, "SECURITY");
}

async function selfDestruct(kv: Deno.Kv, audit: AuditService) {
    await loggingService.log("Initiating self-destruct protocol...", SyslogSeverity.EMERGENCY, "SOVEREIGN");
    await audit.logEvent({ type: "EMERGENCY", message: "SELF-DESTRUCT TRIGGERED DUE TO HARDWARE TAMPER." });
    const iter = kv.list({ prefix: [] });
    for await (const entry of iter) await kv.delete(entry.key);
    try {
        const wipeFile = async (path: string) => {
            const info = await Deno.stat(path).catch(() => null);
            if (!info) return;
            if (info.isFile) {
                const file = await Deno.open(path, { write: true });
                await file.write(new Uint8Array(info.size));
                file.close();
            } else if (info.isDirectory) {
                for await (const entry of Deno.readDir(path)) await wipeFile(`${path}/${entry.name}`);
            }
        };
        await wipeFile("./volume");
        await Deno.remove("./volume", { recursive: true }).catch(() => {});
    } catch (e) {
        await loggingService.log(`Purge error: ${(e as Error).message}`, SyslogSeverity.ERROR, "SOVEREIGN");
    }
    Deno.exit(1);
}

// ── Phase 3: Initialize Broadcaster ──
initBroadcaster({ notificationService, auditService, eventBus, loggingService });

const rawProtection = createProtection(sidecarManager, executor, platformInfo, networkLogService);
const protection = new ProtectionAdapter(rawProtection);

const processTracker = new ProcessTracker(loggingService);
const baselineService = new BaselineService(kv, sidecarManager, executor, loggingService);
const sessionService = new SessionService(kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
const apiKeysService = new ApiKeysService(kv, loggingService);
const anonymization = new AnonymizationService(protection.vpn, loggingService);
const shadowProtocol = new ShadowProtocolService(meshManager, anonymization, loggingService);
const playbookService = new PlaybookService(sidecarManager, protection, notificationService, meshManager, shadowProtocol);

const behavioralService = new BehavioralService(protection.firewall as any);
const geoIpService = new GeoIpService(loggingService);
const honeypotService = new HoneypotService(sidecarManager, protection.firewall, protection.pcap, broadcast, loggingService);
honeypotService.setBehavioralService(behavioralService);

const canaryService = new CanaryService(auditService, sidecarManager, loggingService);
const kernelService = new KernelService(executor, auditService);

const autopilotService = new AutopilotService(
    eventBus, 
    playbookService, 
    auditService, 
    protection, 
    meshManager, 
    notificationService, 
    loggingService
);

const morphingService = new MorphingService(honeypotService, canaryService, auditService, meshManager);
const chaosEngine = new ChaosEngine(eventBus, auditService, sidecarManager);
const supplyChain = new SupplyChainService();
const provisioningService = new ProvisioningService(sidecarManager, meshManager, executor, loggingService);
const governanceService = new GovernanceService(meshManager, protection, loggingService);
const shadowService = new ShadowService(executor, loggingService);
const covertService = new CovertChannelService(executor, loggingService);
const deceptionGrid = new DeceptionGridService(honeypotService, canaryService, loggingService);

// ── Phase 4: Wire Sidecar System Events ──────────────────────────────
sidecarManager.onEvent("SYSTEM_ERROR", (event) => {
    loggingService.log(`[SIDECAR] System Error: ${event.type} for ${event.sidecar}`, SyslogSeverity.CRITICAL, "SIDE-MAN", event);
    auditService.logEvent({ type: "SYSTEM_ERROR", message: `Sidecar failure: ${event.type} on ${event.sidecar}`, data: event });
    broadcast({ type: "CRITICAL", message: `System Component Failure: ${event.sidecar} (${event.type})`, data: event });
});

sidecarManager.onEvent("SIDECAR_ALERT", (event) => {
    broadcast({ type: event.type, message: `Sidecar Alert: ${event.sidecar} - ${event.message}`, data: event });
});

// Phase 5: Start subsystems ─────────────────────────────────────────
await loggingService.log("Deploying active defense subsystems", SyslogSeverity.INFORMATIONAL, "BOOT");
await playbookService.init();
await autopilotService.start();
await morphingService.start();
await anonymization.start();
await deceptionGrid.start();

if (Deno.env.get("PROVISIONING_ENABLED") === "true") {
  provisioningService.run().catch(err => loggingService.log(`Provisioning Engine failure: ${err.message}`, SyslogSeverity.ERROR, "PROVISIONING"));
}
await processTracker.fullScan();
const ghosts = await processTracker.scanForGhosts();
if (ghosts.length > 0) {
    await loggingService.log("ROOTKIT IDENTIFIED ON STARTUP", SyslogSeverity.CRITICAL, "SECURITY", { ghosts });
    await auditService.logEvent({ type: "THREAT", message: `ROOTKIT IDENTIFIED ON STARTUP: PIDs ${ghosts.join(", ")} are hidden from /proc.`, data: { ghosts } });
}
await honeypotService.start();
await canaryService.deploy();
await kernelService.harden();
await covertService.startListener();
await loggingService.log("Defense subsystems operational", SyslogSeverity.NOTICE, "BOOT");

// ── Phase 6: Wire event pipelines ─────────────────────────────────────
honeypotService.onEvent((event) => eventBus.emit("honeypot", event));
const playbookEngine = new PlaybookEngine(eventBus, protection, loggingService);
await playbookEngine.start();

sidecarManager.onEvent("ebpf", async (event: SidecarEvent) => {
  if (event.type === "ERROR") {
    broadcast({ type: "EBPF_ERROR", message: `eBPF Sidecar Error: ${event.message}`, data: event });
    return;
  }
  if (event.type === "SYSCALL_EVENT") {
    let type = "EBPF_SYSCALL";
    let message = `eBPF Alert: ${event.comm} (PID: ${event.pid}) called ${event.syscall}`;
    if (event.syscall === "ptrace") type = "EBPF_CRITICAL";
    else if (event.syscall === "execve") {
      const analysis = await processTracker.analyzeEvent(event.pid, event.comm);
      if (analysis.isStrayShell) {
        type = "EBPF_STRAY_SHELL";
        message = `STRAY SHELL DETECTED: ${event.comm} (PID: ${event.pid}) spawned by suspicious parent.`;
      }
    }
    broadcast({ type, message, data: event });
    eventBus.emit("ebpf", event); // Forward to autopilot
  }
});

sidecarManager.onEvent("fim", (event: any) => {
  const payload = event.data;
  if (payload && payload.type === "FileAlert") {
    canaryService.handleFileAccess(payload.path, "UNKNOWN_COMM");
    broadcast({ type: "INFO", message: `FIM Alert: ${payload.action} on ${payload.path}`, data: payload });
    eventBus.emit("fim", payload); // Forward to autopilot
  }
});

sidecarManager.onEvent("pcap", (event: any) => {
  if (event.type === "PACKET") {
    networkLogService.log({
      direction: event.direction || "INBOUND",
      source: event.source || "UNKNOWN",
      destination: "LOCAL",
      protocol: event.protocol || "TCP",
      length: event.length || 0,
      action: event.action || "ALLOW"
    });
  }
});

const curatedIntel = new CuratedIntelService(loggingService, protection.firewall, configProvider);
const newsSignal = new NewsSignalService(loggingService);
const networkDiscovery = new NetworkDiscoveryService(loggingService);

// ── Phase 7: Web adapter + MetricsService ──
const services: ServiceContainer = {
  config: configProvider, protection, command: sidecarManager, audit: auditService,
  notifications: notificationService, baseline: baselineService, processTracker,
  sessions: sessionService, apiKeys: apiKeysService, eventBus: eventBus,
  honeypot: honeypotService, autopilot: autopilotService, morphing: morphingService,
  chaos: chaosEngine, supplyChain: supplyChain, mesh: meshManager,
  meshAuth: meshAuthService, threatIntel: curatedIntel as any, compliance: complianceService,
  anonymization: anonymization, shadowProtocol: shadowProtocol, deceptionGrid: deceptionGrid,
  curatedIntel, news: newsSignal, networkDiscovery, networkLogs: networkLogService,
  incidents: incidentService, platformInfo
};

const web = new WebAdapter(services);
const metricsService = new MetricsService(
  protection.firewall as any, meshManager, honeypotService, processTracker,
  kernelService, auditService, canaryService, sidecarManager, protection.vpn,
  behavioralService, anonymization, geoIpService, broadcast, 
  curatedIntel, newsSignal, networkDiscovery
);
setMetricsService(metricsService);

// ── Phase 8: Start tactical services ──
await loggingService.log("Initiating tactical intelligence ingestion...", SyslogSeverity.NOTICE, "BOOT");
await curatedIntel.start(kv).catch(err => console.error(`[INTEL] Start failure: ${err.message}`));
newsSignal.start().catch(err => console.error(`[NEWS] Start failure: ${err.message}`));
networkDiscovery.start().catch(err => console.error(`[DISCOVERY] Start failure: ${err.message}`));
anonymization.start().catch(err => console.error(`[ANON] Start failure: ${err.message}`));

// ── Phase 9: Start persistent sidecars ────────────────────────────────
const startDaemons = async () => {
  sidecarManager.getPersistentSidecar("honeypot").catch(() => {});
  sidecarManager.getPersistentSidecar("fim").catch(() => {});
  sidecarManager.getPersistentSidecar("blocker").catch(() => {});
  sidecarManager.getPersistentSidecar("pcap").catch(() => {});
  try {
    const ebpf = await sidecarManager.getPersistentSidecar("ebpf");
    if (ebpf) {
      await sidecarManager.sendCommand("ebpf", { type: "HIDE_PID", payload: { pid: Deno.pid } }).catch(() => {});
    }
    await shadowService.startWatchdog().catch(() => {});
  } catch (_e) {
    setInterval(async () => {
      try {
        for (const token of canaryService.getTokens()) {
          const res = await executor.execute("fuser", [token.projectionPath]);
          if (res.success && res.stdout) canaryService.handleFileAccess(token.projectionPath, `PID:${res.stdout.trim()}`);
        }
      } catch {}
    }, 5000);
  }
};

startDaemons();
// ── Phase 10: Forensic Data Seeding ──
const seedForensics = async () => {
    const incidents = await incidentService.getIncidents();
    if (incidents.length > 0) return;
    await networkLogService.log({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
    await networkLogService.log({ direction: "INBOUND", source: "45.33.22.11", destination: "LOCAL", protocol: "TCP/22", length: 128, action: "SHADOW" });
    await incidentService.reportIncident({ severity: "HIGH", title: "Suspicious Inbound Connection to Vault", description: "Multiple failed connection attempts from a known Tor exit node.", source: "Network_Perimeter", indicators: ["185.220.101.42", "TOR_EXIT_NODE"] });
};

seedForensics();
const port = parseInt(Deno.env.get("PORT") || "8000");
await web.start(port);