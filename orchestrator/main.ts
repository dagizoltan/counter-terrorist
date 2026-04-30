import { initializeApplication } from "./core/application.ts";
import { WebAdapter } from "./adapters/web_adapter.tsx";
import { SidecarManager } from "./infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "./infrastructure/system_executor.ts";
import { AuditService } from "./services/audit.ts";
import { NotificationService } from "./services/alerts.ts";
import { BaselineService, ProcessTracker, SessionService, ApiKeysService, EventBus, MeshAuthService } from "./services/index.ts";
import { EnvConfigProvider } from "./infrastructure/env_config_provider.ts";
import { MeshManager } from "./services/mesh.ts";
import { PlaybookService } from "./services/playbook_service.ts";
import { loggingService } from "./infrastructure/logging.ts";
import { broadcast } from "./api/ws.ts";
import { PlaybookEngine } from "./services/playbook_engine.ts";
import { BehavioralAnalyzer } from "./services/behavioral_analyzer.ts";
import { MetricsService } from "./services/metrics_service.ts";
import { ThreatIntelService } from "./services/threat_intel.ts";
import { HoneypotService } from "./services/honeypot_service.ts";
import { CanaryService } from "./services/canary_service.ts";
import { KernelService } from "./services/kernel_service.ts";
import { createProtection } from "./protection/index.ts";
import { getPlatformInfo } from "./infrastructure/platform.ts";
import { bootstrap } from "./bootstrapper.ts";
import { SidecarEvent } from "./infrastructure/sidecar_manager.ts";
import { pluginManager } from "./services/plugin_manager.ts";

const kv = await Deno.openKv();
const configProvider = new EnvConfigProvider();
const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);
const eventBus = new EventBus();
const platformInfo = await getPlatformInfo();
const systemStatus = await bootstrap();

const auditService = new AuditService(kv, loggingService);
const notificationService = new NotificationService(kv, loggingService);
const meshAuthService = new MeshAuthService(kv);
const meshManager = new MeshManager(meshAuthService, loggingService);
await meshManager.init();

const protection = createProtection(sidecarManager, executor, platformInfo);

const processTracker = new ProcessTracker(loggingService);
const baselineService = new BaselineService(kv, sidecarManager, executor, loggingService);
const sessionService = new SessionService(kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
const apiKeysService = new ApiKeysService(kv, loggingService);
const playbookService = new PlaybookService(sidecarManager, protection as any, notificationService, meshManager);

const behavioralAnalyzer = new BehavioralAnalyzer();
const threatIntel = new ThreatIntelService(protection as any, loggingService);
const honeypotService = new HoneypotService(sidecarManager, protection.firewall as any, protection.pcap as any, broadcast);
const canaryService = new CanaryService(auditService);
const kernelService = new KernelService(executor, auditService);
const metricsService = new MetricsService(protection.firewall as any, meshManager, honeypotService, processTracker, broadcast);

await playbookService.init();
await processTracker.fullScan();
await threatIntel.start();
await honeypotService.start();
await canaryService.deploy();
await kernelService.harden();

honeypotService.onEvent((event) => {
  if (event.type === "PortAccess") {
    behavioralAnalyzer.track(event.source_ip);
    const analysis = behavioralAnalyzer.analyze(event.source_ip);
    if (analysis.botProbability > 0.8) {
       console.log(`[BOT-DETECTOR] High bot probability for ${event.source_ip}: ${analysis.botProbability}`);
    }
  }
});

const playbookEngine = new PlaybookEngine(eventBus, protection as any, loggingService);
await playbookEngine.start();

// Handle Sidecar events
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

sidecarManager.onEvent("fim", (event: any) => {
  if (event.type === "FILE_EVENT") {
    canaryService.handleFileAccess(event.path, event.comm);
    broadcast({ type: "INFO", message: `FIM Alert: ${event.comm} ${event.action} ${event.path}`, data: event });
  }
});

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
  honeypotService
);

// Start persistent sidecars with specialized fallbacks
const startDaemons = async () => {
  sidecarManager.getPersistentSidecar("honeypot").catch(() => {});
  sidecarManager.getPersistentSidecar("fim").catch(() => {});
  try {
    await sidecarManager.getPersistentSidecar("ebpf");
  } catch (e) {
    console.warn("[FORENSICS] eBPF fallback active.");
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
await web.start();