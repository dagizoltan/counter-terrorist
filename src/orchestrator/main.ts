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
import { loggingService } from "@infrastructure/system/logging.ts";
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

import { loadConfig } from "./core/config_schema.ts";

// ── Phase 1: Core infrastructure ──────────────────────────────────────
await camouflage();
const config = loadConfig();
const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const configProvider = new EnvConfigProvider(config);
const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);
const platformInfo = await getPlatformInfo();
const systemStatus = await bootstrap();

// ── Phase 2: Service layer ────────────────────────────────────────────
const tpmManager = new TPMManager(executor, loggingService);
const auditService = new AuditService(kv, loggingService, tpmManager);
const notificationService = new NotificationService(kv, loggingService);
const eventBus = new EventBus(loggingService);
const meshAuthService = new MeshAuthService(kv, tpmManager);
const meshManager = new MeshManager(meshAuthService, loggingService, auditService);
setMeshManager(meshManager);
await meshManager.init();
meshManager.startDiscovery();

// HARDWARE INTEGRITY ENFORCEMENT (Tier-5 Sovereign Check)
const isHardwareSecure = await tpmManager.verifyIntegrity();
const bypassHardware = Deno.env.get("ALLOW_HARDWARE_BYPASS") === "true";

if (!isHardwareSecure && !bypassHardware) {
    console.error("[CRITICAL] HARDWARE INTEGRITY FAILURE DETECTED. PCR REGISTERS TAMPERED.");
    await selfDestruct(kv, auditService);
} else if (!isHardwareSecure && bypassHardware) {
    console.warn("[SECURITY] HARDWARE INTEGRITY BYPASS ACTIVE. Running in software-only trust mode.");
}

async function selfDestruct(kv: Deno.Kv, audit: AuditService) {
    console.error("[SOVEREIGN] Initiating self-destruct protocol...");
    await audit.logEvent({ type: "EMERGENCY", message: "SELF-DESTRUCT TRIGGERED DUE TO HARDWARE TAMPER." });
    
    // Wipe all KV data
    const iter = kv.list({ prefix: [] });
    for await (const entry of iter) {
        await kv.delete(entry.key);
    }
    
    // Wipe volume files securely (one-pass overwrite)
    try {
        const wipeFile = async (path: string) => {
            const info = await Deno.stat(path);
            if (info.isFile) {
                const file = await Deno.open(path, { write: true });
                const zeros = new Uint8Array(info.size);
                await file.write(zeros);
                file.close();
            } else if (info.isDirectory) {
                for await (const entry of Deno.readDir(path)) {
                    await wipeFile(`${path}/${entry.name}`);
                }
            }
        };
        await wipeFile("./volume");
        await Deno.remove("./volume", { recursive: true });
    } catch (e) {
        console.error(`[SOVEREIGN] Wipe error: ${(e as Error).message}`);
    }
    
    console.error("[SOVEREIGN] Local data purged. Halting execution.");
    Deno.exit(1);
}

// ── Phase 3: Initialize Broadcaster BEFORE any service calls broadcast() ──
initBroadcaster({
  notificationService,
  auditService,
  eventBus,
  loggingService,
});

const rawProtection = createProtection(sidecarManager, executor, platformInfo);
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
const autopilotService = new AutopilotService(eventBus, playbookService, auditService);
const morphingService = new MorphingService(honeypotService, canaryService, auditService, meshManager);
const chaosEngine = new ChaosEngine(eventBus, auditService, sidecarManager);
const supplyChain = new SupplyChainService();
const provisioningService = new ProvisioningService(sidecarManager, meshManager, executor, loggingService);
const governanceService = new GovernanceService(meshManager, protection, loggingService);
const shadowService = new ShadowService(executor, loggingService);
const covertService = new CovertChannelService(executor, loggingService);
const deceptionGrid = new DeceptionGridService(honeypotService, canaryService, loggingService);

// Phase 4: Start subsystems ─────────────────────────────────────────
await playbookService.init();
await autopilotService.start();
await morphingService.start();
await anonymization.start();
await deceptionGrid.start();

// Lateral Expansion (Defensive Worm) - Only if explicitly enabled
if (Deno.env.get("PROVISIONING_ENABLED") === "true") {
  provisioningService.run().catch(err => {
    console.error(`[PROVISIONING] Engine failure: ${err.message}`);
  });
}
await processTracker.fullScan();
// INITIAL SUBTERRANEAN INTEGRITY SCAN (ROOTKIT DETECTION)
const ghosts = await processTracker.scanForGhosts();
if (ghosts.length > 0) {
    await auditService.logEvent({
        type: "THREAT",
        message: `ROOTKIT IDENTIFIED ON STARTUP: PIDs ${ghosts.join(", ")} are hidden from /proc.`,
        data: { ghosts }
    });
}
await honeypotService.start();
await canaryService.deploy();
await kernelService.harden();
await covertService.startListener();

// ── Phase 5: Wire event pipelines ─────────────────────────────────────
// Honeypot events → EventBus (for stats API) + Behavioral Analysis
honeypotService.onEvent((event) => {
  // Publish to EventBus so /api/stats/honeypot receives the event
  eventBus.emit("honeypot", event);
});

const playbookEngine = new PlaybookEngine(eventBus, protection, loggingService);
await playbookEngine.start();

// eBPF sidecar → broadcast pipeline
sidecarManager.onEvent("ebpf", async (event: SidecarEvent) => {
  if (event.type === "ERROR") {
    broadcast({ type: "WARN", message: `eBPF Sidecar Error: ${event.message}`, data: event });
    return;
  }
  
  if (event.type === "SYSCALL_EVENT") {
    let type = "INFO";
    let message = `eBPF Alert: ${event.comm} (PID: ${event.pid}) called ${event.syscall}`;
    if (event.syscall === "ptrace") type = "CRITICAL";
    else if (event.syscall === "execve") {
      const analysis = await processTracker.analyzeEvent(event.pid, event.comm);
      if (analysis.isStrayShell) {
        type = "CRITICAL";
        message = `STRAY SHELL DETECTED: ${event.comm} (PID: ${event.pid}) spawned by suspicious parent.`;
      }
    }
    broadcast({ type, message, data: event });
  }
});

// FIM sidecar → broadcast + canary pipeline
sidecarManager.onEvent("fim", (event: any) => {
  const payload = event.data;
  if (payload && payload.type === "FileAlert") {
    canaryService.handleFileAccess(payload.path, "UNKNOWN_COMM");
    broadcast({ 
      type: "INFO", 
      message: `FIM Alert: ${payload.action} on ${payload.path}`, 
      data: payload 
    });
  }
});

const curatedIntel = new CuratedIntelService(loggingService, protection.firewall, configProvider);
const newsSignal = new NewsSignalService(loggingService);
const networkDiscovery = new NetworkDiscoveryService(loggingService);

// ── Phase 6: Web adapter + MetricsService (started AFTER broadcaster is ready) ──
const services: ServiceContainer = {
  config: configProvider,
  protection,
  command: sidecarManager,
  audit: auditService,
  notifications: notificationService,
  baseline: baselineService,
  processTracker,
  sessions: sessionService,
  apiKeys: apiKeysService,
  eventBus: eventBus,
  honeypot: honeypotService,
  autopilot: autopilotService,
  morphing: morphingService,
  chaos: chaosEngine,
  supplyChain: supplyChain,
  mesh: meshManager,
  meshAuth: meshAuthService,
  threatIntel: curatedIntel as any,
  anonymization: anonymization,
  shadowProtocol: shadowProtocol,
  deceptionGrid: deceptionGrid,
  curatedIntel,
  news: newsSignal,
  networkDiscovery,
  platformInfo
};

const web = new WebAdapter(services);

// MetricsService starts AFTER broadcaster is initialized
const metricsService = new MetricsService(
  protection.firewall as any, meshManager, honeypotService, processTracker,
  kernelService, auditService, canaryService, sidecarManager, protection.vpn,
  behavioralService, anonymization, geoIpService, broadcast, 
  curatedIntel, newsSignal, networkDiscovery
);
setMetricsService(metricsService);

// ── Phase 7: Start tactical services & Early Hardening ────────────────
curatedIntel.start().catch(err => console.error(`[INTEL] Start failure: ${err.message}`));
newsSignal.start().catch(err => console.error(`[NEWS] Start failure: ${err.message}`));
networkDiscovery.start().catch(err => console.error(`[DISCOVERY] Start failure: ${err.message}`));

// ── Phase 8: Start persistent sidecars ────────────────────────────────
const startDaemons = async () => {
  sidecarManager.getPersistentSidecar("honeypot").catch(() => {});
  sidecarManager.getPersistentSidecar("fim").catch(() => {});
  try {
    const ebpf = await sidecarManager.getPersistentSidecar("ebpf");
    if (ebpf) {
      // Activate Kernel-Level Stealth: Hide our own PID from the system
      await sidecarManager.sendCommand("ebpf", { 
        type: "HIDE_PID", 
        payload: { pid: Deno.pid } 
      }).catch(err => console.warn(`[STEALTH] Kernel-level hiding failed: ${err.message}`));
      console.log("[STEALTH] Kernel-level PID hiding activated via eBPF.");
    }
    // Phase 4: Deploy Shadow Watchdog (Unkillable Architecture)
    await shadowService.startWatchdog().catch(err => console.warn(`[SHADOW] Watchdog deployment failed: ${err.message}`));
  } catch (_e) {
    console.warn("[FORENSICS] eBPF fallback active — polling canary tokens.");
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
const port = parseInt(Deno.env.get("PORT") || "8000");
await web.start(port);