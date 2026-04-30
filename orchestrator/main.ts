import { WebAdapter } from "./adapters/web_adapter.tsx";
import { SidecarManager } from "./infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "./infrastructure/system_executor.ts";
import { AuditService } from "./services/audit.ts";
import { NotificationService } from "./services/alerts.ts";
import { BaselineService, ProcessTracker, SessionService, ApiKeysService, EventBus, MeshAuthService } from "./services/index.ts";
import { EnvConfigProvider } from "./infrastructure/env_config_provider.ts";
import { MeshManager, setMeshManager } from "./services/mesh.ts";
import { PlaybookService } from "./services/playbook_service.ts";
import { loggingService } from "./infrastructure/logging.ts";
import { broadcast, initBroadcaster } from "./api/ws.ts";
import { PlaybookEngine } from "./services/playbook_engine.ts";
import { BehavioralService } from "./services/behavioral_service.ts";
import { MetricsService, setMetricsService } from "./services/metrics_service.ts";
import { ThreatIntelService } from "./services/threat_intel.ts";
import { MorphingService } from "./services/morphing_service.ts";
import { ChaosEngine } from "./services/chaos_engine.ts";
import { SupplyChainService } from "./services/supply_chain.ts";
import { HoneypotService } from "./services/honeypot_service.ts";
import { CanaryService } from "./services/canary_service.ts";
import { AutopilotService } from "./services/autopilot_service.ts";
import { KernelService } from "./services/kernel_service.ts";
import { createProtection } from "./protection/index.ts";
import { getPlatformInfo } from "./infrastructure/platform.ts";
import { bootstrap } from "./bootstrapper.ts";
import { SidecarEvent } from "./infrastructure/sidecar_manager.ts";

// ── Phase 1: Core infrastructure ──────────────────────────────────────
const kv = await Deno.openKv();
const configProvider = new EnvConfigProvider();
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

const protection = createProtection(sidecarManager, executor, platformInfo);

const processTracker = new ProcessTracker(loggingService);
const baselineService = new BaselineService(kv, sidecarManager, executor, loggingService);
const sessionService = new SessionService(kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
const apiKeysService = new ApiKeysService(kv, loggingService);
const playbookService = new PlaybookService(sidecarManager, protection as any, notificationService, meshManager);

const behavioralService = new BehavioralService(protection.firewall as any);
const threatIntel = new ThreatIntelService(protection as any, loggingService);
const honeypotService = new HoneypotService(sidecarManager, protection.firewall as any, protection.pcap as any, broadcast);
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
  eventBus.emit("honeypot", { event });
});

const playbookEngine = new PlaybookEngine(eventBus, protection as any, loggingService);
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
const web = new WebAdapter(
  configProvider,
  protection as any,
  sidecarManager as any,
  auditService,
  notificationService,
  baselineService,
  processTracker,
  sessionService,
  apiKeysService,
  eventBus as any,
  honeypotService,
  chaosEngine,
  supplyChain
);

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
          const res = await executor.execute("fuser", [token.path]);
          if (res.success && res.stdout) canaryService.handleFileAccess(token.path, `PID:${res.stdout.trim()}`);
        }
      } catch {}
    }, 5000);
  }
};

startDaemons();
const port = parseInt(Deno.env.get("PORT") || "8000");
await web.start(port);