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
import { ThreatIntelService } from "@domain/protection/threat_intel.ts";
import { MorphingService } from "@domain/protection/morphing_service.ts";
import { ChaosEngine } from "@domain/engine/chaos_engine.ts";
import { SupplyChainService } from "@domain/analysis/supply_chain.ts";
import { HoneypotService } from "@domain/protection/honeypot_service.ts";
import { CanaryService } from "@domain/protection/canary_service.ts";
import { AutopilotService } from "@domain/engine/autopilot_service.ts";
import { KernelService } from "@domain/protection/kernel_service.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { bootstrap } from "./bootstrapper.ts";
import { SidecarEvent } from "@infrastructure/system/validation.ts";

import { loadConfig } from "./core/config_schema.ts";

// ── Phase 1: Core infrastructure ──────────────────────────────────────
const config = loadConfig();
const kv = await Deno.openKv("./volume/storage/orchestrator.db");
const configProvider = new EnvConfigProvider(config);
const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);
const platformInfo = await getPlatformInfo();
const systemStatus = await bootstrap();

// ── Phase 2: Service layer ────────────────────────────────────────────
const auditService = new AuditService(kv, loggingService);
const notificationService = new NotificationService(kv, loggingService);
const eventBus = new EventBus(loggingService);
const meshAuthService = new MeshAuthService(kv);
const meshManager = new MeshManager(meshAuthService, loggingService);
setMeshManager(meshManager);
await meshManager.init();

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
const playbookService = new PlaybookService(sidecarManager, protection, notificationService, meshManager);

const behavioralService = new BehavioralService(protection.firewall as any);
const threatIntel = new ThreatIntelService(protection, loggingService);
const honeypotService = new HoneypotService(sidecarManager, protection.firewall, protection.pcap, broadcast);
honeypotService.setBehavioralService(behavioralService);

const canaryService = new CanaryService(auditService, sidecarManager);
const kernelService = new KernelService(executor, auditService);
const autopilotService = new AutopilotService(eventBus, playbookService, auditService);
const morphingService = new MorphingService(honeypotService, canaryService, auditService);
const chaosEngine = new ChaosEngine(eventBus, auditService, sidecarManager);
const supplyChain = new SupplyChainService();

// ── Phase 4: Start subsystems ─────────────────────────────────────────
await playbookService.init();
await autopilotService.start();
await morphingService.start();
await processTracker.fullScan();
await threatIntel.start();
await honeypotService.start();
await canaryService.deploy();
await kernelService.harden();

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
  if (event.type === "FILE_EVENT") {
    canaryService.handleFileAccess(event.path, event.comm);
    broadcast({ type: "INFO", message: `FIM Alert: ${event.comm} ${event.action} ${event.path}`, data: event });
  }
});

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
  platformInfo
};

const web = new WebAdapter(services);

// MetricsService starts AFTER broadcaster is initialized
const metricsService = new MetricsService(
  protection.firewall as any, meshManager, honeypotService, processTracker,
  kernelService, auditService, canaryService, sidecarManager, broadcast
);
setMetricsService(metricsService);

// ── Phase 7: Start persistent sidecars ────────────────────────────────
const startDaemons = async () => {
  sidecarManager.getPersistentSidecar("honeypot").catch(() => {});
  sidecarManager.getPersistentSidecar("fim").catch(() => {});
  try {
    await sidecarManager.getPersistentSidecar("ebpf");
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