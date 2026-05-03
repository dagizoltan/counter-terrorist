import { WebAdapter } from "./interface/web/web_adapter.tsx";
import { ProtectionAdapter } from "@infrastructure/system/protection/protection_adapter.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { 
    BaselineService, ProcessTracker, SessionService, ApiKeysService, 
    EventBus, MeshAuthService, ForensicService, MeshManager, 
    PlaybookService, BehavioralService, MetricsService, 
    ShadowProtocolService, GeoIpService, AnonymizationService, 
    CuratedIntelService, DeceptionGridService, MorphingService, 
    ChaosEngine, SupplyChainService, HoneypotService, 
    CanaryService, AutopilotService, KernelService, 
    GovernanceService, ShadowService, CovertChannelService, 
    ProvisioningService, NetworkDiscoveryService, NetworkLogService, 
    IncidentService, ComplianceService, NewsSignalService, 
    PlatformInfoService, LedgerService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, SyslogSeverity } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@api/ws.ts";
import { PlaybookEngine } from "@domain/engine/playbook_engine.ts";
import { createProtection } from "@infrastructure/system/protection/index.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loadConfig } from "./core/config_schema.ts";
import { setMeshManager } from "@domain/engine/mesh.ts";
import { setMetricsService } from "@domain/analysis/metrics_service.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private web!: WebAdapter;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;

    async boot() {
        // ── Phase 1: Core infrastructure ──────────────────────────────────────
        loggingService.enableGlobalIntercept();
        await loggingService.log("Initiating Sovereign Boot Sequence", SyslogSeverity.NOTICE, "BOOT");
        await camouflage();
        
        await load({ export: true, allowEmptyValues: true });
        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);
        
        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
        
        const platformInfo = await getPlatformInfo();
        const systemStatus = await bootstrap();
        await loggingService.log("Core infrastructure initialized", SyslogSeverity.INFORMATIONAL, "BOOT", { platform: platformInfo.os, isRoot: systemStatus.isRoot });

        // ── Phase 2: Service layer ────────────────────────────────────────────
        const tpmManager = new TPMManager(this.executor, loggingService);
        this.auditService = new AuditService(this.kv, loggingService, tpmManager);
        const notificationService = new NotificationService(this.kv, loggingService);
        const eventBus = new EventBus(loggingService);
        const networkLogService = new NetworkLogService(this.kv, loggingService);
        const incidentService = new IncidentService(this.kv, loggingService);
        const meshAuthService = new MeshAuthService(this.kv, tpmManager);
        const meshManager = new MeshManager(meshAuthService, loggingService, this.auditService);
        
        setMeshManager(meshManager);
        await meshManager.init();
        meshManager.startDiscovery();

        // ── Phase 3: Hardware Integrity ──────────────────────────────────────
        await this.verifyHardware(tpmManager);

        // ── Phase 4: Domain Services ──────────────────────────────────────────
        initBroadcaster({ notificationService, auditService: this.auditService, eventBus, loggingService });

        const rawProtection = createProtection(this.sidecarManager, this.executor, platformInfo, networkLogService);
        const protection = new ProtectionAdapter(rawProtection);
        const processTracker = new ProcessTracker(loggingService);
        
        const sessionService = new SessionService(this.kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
        const apiKeysService = new ApiKeysService(this.kv, loggingService);
        const anonymization = new AnonymizationService(protection.vpn, loggingService);
        const shadowProtocol = new ShadowProtocolService(meshManager, anonymization, loggingService);
        const playbookService = new PlaybookService(this.sidecarManager, protection, notificationService, meshManager, shadowProtocol);
        
        const behavioralService = new BehavioralService(protection.firewall as any);
        const geoIpService = new GeoIpService(loggingService);
        const honeypotService = new HoneypotService(this.sidecarManager, protection.firewall, protection.pcap, broadcast, loggingService);
        honeypotService.setBehavioralService(behavioralService);

        const canaryService = new CanaryService(this.auditService, this.sidecarManager, loggingService);
        const kernelService = new KernelService(this.executor, this.auditService, this.sidecarManager);
        const forensicService = new ForensicService(this.auditService, loggingService, this.kv, processTracker);
        
        const autopilotService = new AutopilotService(eventBus, playbookService, this.auditService, protection, meshManager, notificationService, loggingService, processTracker, kernelService);
        const morphingService = new MorphingService(honeypotService, canaryService, this.auditService, meshManager);
        const chaosEngine = new ChaosEngine(eventBus, this.auditService, this.sidecarManager);
        const supplyChain = new SupplyChainService();
        const provisioningService = new ProvisioningService(this.sidecarManager, meshManager, this.executor, loggingService);
        const governanceService = new GovernanceService(meshManager, protection, loggingService);
        const shadowService = new ShadowService(this.executor, loggingService);
        const covertService = new CovertChannelService(this.executor, loggingService);
        const deceptionGrid = new DeceptionGridService(honeypotService, canaryService, loggingService);
        const complianceService = new ComplianceService(this.auditService, this.kv, processTracker);
        const curatedIntel = new CuratedIntelService(loggingService, protection.firewall, configProvider);
        const newsSignal = new NewsSignalService(loggingService);
        const networkDiscovery = new NetworkDiscoveryService(loggingService);

        this.services = {
            config: configProvider, protection, command: this.sidecarManager, audit: this.auditService,
            notifications: notificationService, baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService), 
            processTracker, sessions: sessionService, apiKeys: apiKeysService, eventBus,
            honeypot: honeypotService, canaryService, kernelService, forensicService,
            autopilot: autopilotService,
            playbook: playbookService,
            morphing: morphingService,
            chaos: chaosEngine,
            supplyChain, mesh: meshManager, meshAuth: meshAuthService, threatIntel: curatedIntel as any,
            compliance: complianceService, anonymization, shadowProtocol, deceptionGrid,
            curatedIntel, news: newsSignal, networkDiscovery, networkLogs: networkLogService,
            incidents: incidentService, platformInfo,
            shadow: shadowService,
            covert: covertService,
            ledger: new LedgerService(meshManager, loggingService),
            tpm: tpmManager,
            policy: autopilotService.getPolicy()
        };

        // ── Phase 5: Web & Metrics ──────────────────────────────────────────
        this.web = new WebAdapter(this.services);
        const metricsService = new MetricsService(
            protection.firewall as any, meshManager, honeypotService, processTracker,
            kernelService, this.auditService, canaryService, this.sidecarManager, protection.vpn,
            behavioralService, anonymization, geoIpService, broadcast, 
            curatedIntel, newsSignal, networkDiscovery, autopilotService
        );
        setMetricsService(metricsService);

        // ── Phase 6: Wire & Start ───────────────────────────────────────────
        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8001);
        this.registerSignalHandlers();
        await loggingService.log(`Sovereign Orchestrator fully engaged on port ${port}`, SyslogSeverity.NOTICE, "BOOT");
        await this.web.start(port);
    }

    private async verifyHardware(tpm: TPMManager) {
        const goldenPcrs: Record<number, string> = {};
        for (const [key, value] of Object.entries(Deno.env.toObject())) {
            if (key.startsWith("TPM_GOLDEN_PCR_")) {
                const index = parseInt(key.replace("TPM_GOLDEN_PCR_", ""));
                if (!isNaN(index)) goldenPcrs[index] = value;
            }
        }

        const isHardwareSecure = await tpm.verifyIntegrity(goldenPcrs);
        const bypassHardware = Deno.env.get("ALLOW_HARDWARE_BYPASS") === "true";

        if (!isHardwareSecure && !bypassHardware) {
            await loggingService.log("HARDWARE INTEGRITY FAILURE.", SyslogSeverity.EMERGENCY, "SECURITY");
            await this.selfDestruct();
        }
    }

    private wireEvents() {
        const { command, processTracker, eventBus, honeypot, canaryService } = this.services;

        honeypot.onEvent((event) => {
            broadcast({ type: "HONEYPOT", message: `Honeypot Trigger: ${event.type}`, data: event });
            eventBus.emit("HONEYPOT", event);
        });

        command.onEvent("ebpf", async (event: any) => {
            if (event.type === "SYSCALL_EVENT") {
                let type = "EBPF_SYSCALL";
                if (event.syscall === "ptrace") type = "EBPF_CRITICAL";
                const analysis = await processTracker.analyzeEvent(event.pid, event.comm);
                if (analysis.isStrayShell) type = "EBPF_STRAY_SHELL";
                
                broadcast({ type, message: `eBPF Alert: ${event.comm} called ${event.syscall}`, data: event });
                eventBus.emit(type, event); 
            }
        });

        command.onEvent("fim", (event: any) => {
            const payload = event.data;
            if (payload?.type === "FileAlert") {
                canaryService.handleFileAccess(payload.path, "UNKNOWN_COMM");
                broadcast({ type: "DRIFT_PROCESS", message: `FIM Alert: ${payload.action} on ${payload.path}`, data: payload });
                eventBus.emit("DRIFT_PROCESS", payload); 
            }
        });
    }

    private async startSubsystems() {
        const { playbook, autopilot, morphing, anonymization, deceptionGrid, processTracker, honeypot, canaryService, kernelService, curatedIntel, news, networkDiscovery } = this.services;
        
        await loggingService.log("Deploying active defense subsystems", SyslogSeverity.INFORMATIONAL, "BOOT");
        
        playbook.init().catch(() => {});
        autopilot.start().catch(() => {});
        morphing.start();
        anonymization.start().catch(() => {});
        deceptionGrid.start().catch(() => {});
        processTracker.fullScan();
        honeypot.start();
        canaryService.deploy();
        kernelService.harden();
        
        curatedIntel.start(this.kv).catch(() => {});
        news.start().catch(() => {});
        networkDiscovery.start().catch(() => {});

        this.startDaemons();
    }

    private async startDaemons() {
        const { command: sm } = this.services;
        sm.getPersistentSidecar("honeypot").catch(() => {});
        sm.getPersistentSidecar("fim").catch(() => {});
        sm.getPersistentSidecar("blocker").catch(() => {});
        sm.getPersistentSidecar("pcap").catch(() => {});
        
        const ebpf = await sm.getPersistentSidecar("ebpf").catch(() => null);
        if (ebpf) {
            await sm.sendCommand("ebpf", { type: "HIDE_PID", pid: Deno.pid }).catch(() => {});
        }
    }

    private async seedForensics() {
        const { incidents, networkLogs } = this.services;
        const existing = await incidents.getIncidents();
        if (existing.length > 0) return;

        await networkLogs.log({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
        await incidents.reportIncident({ severity: "HIGH", title: "Suspicious Vault Access", description: "Tor exit node attempt.", source: "Network", indicators: ["185.220.101.42"] });
    }

    private registerSignalHandlers() {
        const cleanup = async () => {
            await loggingService.log("Initiating graceful shutdown...", SyslogSeverity.NOTICE, "BOOT");
            
            // 1. Notify Mesh of departure
            if (this.services?.mesh) {
                this.services.mesh.broadcast({ type: "MESH_EXIT", nodeId: this.services.mesh.getNodeId() }).catch(() => {});
            }

            // 2. Kill Sidecars
            await this.sidecarManager.shutdown();

            // 3. Close KV
            if (this.kv) {
                this.kv.close();
            }

            Deno.exit(0);
        };
        try {
            Deno.addSignalListener("SIGINT", cleanup);
            Deno.addSignalListener("SIGTERM", cleanup);
        } catch {}
    }

    private async selfDestruct() {
        await loggingService.log("SELF-DESTRUCT TRIGGERED.", SyslogSeverity.EMERGENCY, "SOVEREIGN");
        const iter = this.kv.list({ prefix: [] });
        for await (const entry of iter) await this.kv.delete(entry.key);
        Deno.exit(1);
    }
}
