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
    LedgerService, HealthService, EventMediator,
    WatchdogService, RateLimitService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer } from "@core/container.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
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
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Initiating Sovereign Boot Sequence"
        });
        await camouflage();
        
        await load({ export: true, allowEmptyValues: true });
        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);
        
        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
        
        const platformInfo = await getPlatformInfo();
        const systemStatus = await bootstrap();
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Core infrastructure initialized",
            payload: { platform: platformInfo.name, isRoot: systemStatus.isRoot }
        });

        // ── Phase 2: Service layer ────────────────────────────────────────────
        const tpmManager = new TPMManager(this.executor, loggingService);
        this.auditService = new AuditService(this.kv, loggingService, tpmManager);
        const notificationService = new NotificationService(this.kv, loggingService);
        const eventBus = new EventBus(loggingService);
        const networkLogService = new NetworkLogService(this.kv, loggingService);
        const incidentService = new IncidentService(this.kv, loggingService);
        const meshAuthService = new MeshAuthService(this.kv, tpmManager);
        const meshManager = new MeshManager(meshAuthService, loggingService, this.auditService);
        
        const healthService = new HealthService(loggingService);
        
        setMeshManager(meshManager);
        await meshManager.init();
        meshManager.startDiscovery();

        // ── Phase 3: Hardware Integrity ──────────────────────────────────────
        await this.verifyHardware(tpmManager);

        // ── Phase 4: Domain Services ──────────────────────────────────────────
        this.services = await this.initServices(configProvider, platformInfo, notificationService, eventBus, networkLogService, meshManager, tpmManager, healthService);

        // ── Phase 5: Web & Metrics ──────────────────────────────────────────
        this.web = new WebAdapter(this.services);
        const { 
            protection, mesh, honeypot, processTracker, kernelService, 
            audit, canaryService, command, anonymization, 
            curatedIntel, news, networkDiscovery, autopilot, health,
            behavioral, geoIp
        } = this.services;

        const metricsService = new MetricsService(
            protection.firewall as any, mesh, honeypot, processTracker,
            kernelService, audit as any, canaryService, command as any, protection.vpn,
            behavioral, anonymization, geoIp, broadcast, 
            curatedIntel, news, networkDiscovery, autopilot, health
        );
        setMetricsService(metricsService);

        // ── Phase 6: Wire & Start ───────────────────────────────────────────
        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8001);
        this.registerSignalHandlers();
        
        // ── Phase 8: Watchdog (Phoenix Pattern) ──────────────────────────────
        const watchdog = new WatchdogService(health, loggingService, async (name) => {
            // Re-initialization logic placeholder
            return false; 
        });
        watchdog.start();

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.SUCCESS,
            caller: "BOOT",
            message: `Sovereign Orchestrator fully engaged on port ${port}`
        });
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
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.CRITICAL,
                caller: "SECURITY",
                message: "HARDWARE INTEGRITY FAILURE."
            });
            await this.selfDestruct();
        }
    }

    private wireEvents() {
        this.services.mediator.wireSidecars(this.services.command);
    }

    private async startSubsystems() {
        const { playbook, autopilot, morphing, anonymization, deceptionGrid, processTracker, honeypot, canaryService, kernelService, curatedIntel, news, networkDiscovery, health } = this.services;
        
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Deploying active defense subsystems"
        });
        
        health.reportStatus("Playbook", "BOOTING");
        playbook.init()
            .then(() => health.reportStatus("Playbook", "OPERATIONAL"))
            .catch(e => health.reportStatus("Playbook", "FAILED", e.message));

        health.reportStatus("Autopilot", "BOOTING");
        autopilot.start()
            .then(() => health.reportStatus("Autopilot", "OPERATIONAL"))
            .catch(e => health.reportStatus("Autopilot", "FAILED", e.message));

        health.reportStatus("Morphing", "OPERATIONAL");
        morphing.start();

        health.reportStatus("Anonymization", "BOOTING");
        anonymization.start()
            .then(() => health.reportStatus("Anonymization", "OPERATIONAL"))
            .catch(e => health.reportStatus("Anonymization", "FAILED", e.message));

        health.reportStatus("DeceptionGrid", "BOOTING");
        deceptionGrid.start()
            .then(() => health.reportStatus("DeceptionGrid", "OPERATIONAL"))
            .catch(e => health.reportStatus("DeceptionGrid", "FAILED", e.message));

        processTracker.fullScan();
        
        health.reportStatus("Honeypot", "OPERATIONAL");
        honeypot.start();
        
        health.reportStatus("Canary", "OPERATIONAL");
        canaryService.deploy();
        
        health.reportStatus("KernelHardening", "OPERATIONAL");
        kernelService.harden();
        
        health.reportStatus("ThreatIntel", "BOOTING");
        curatedIntel.start(this.kv)
            .then(() => health.reportStatus("ThreatIntel", "OPERATIONAL"))
            .catch(e => health.reportStatus("ThreatIntel", "FAILED", e.message));

        health.reportStatus("NewsSignal", "BOOTING");
        news.start()
            .then(() => health.reportStatus("NewsSignal", "OPERATIONAL"))
            .catch(e => health.reportStatus("NewsSignal", "FAILED", e.message));

        health.reportStatus("NetworkDiscovery", "BOOTING");
        networkDiscovery.start()
            .then(() => health.reportStatus("NetworkDiscovery", "OPERATIONAL"))
            .catch(e => health.reportStatus("NetworkDiscovery", "FAILED", e.message));

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
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "BOOT",
                message: "Initiating graceful shutdown..."
            });
            
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

    private async initServices(
        configProvider: EnvConfigProvider, platformInfo: any, notifications: NotificationService, 
        eventBus: EventBus, networkLog: NetworkLogService, mesh: MeshManager, 
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {
        initBroadcaster({ notificationService: notifications, auditService: this.auditService, eventBus, loggingService });

        const rawProtection = createProtection(this.sidecarManager, this.executor, platformInfo, networkLog);
        const protection = new ProtectionAdapter(rawProtection);
        const processTracker = new ProcessTracker(loggingService);
        const sessions = new SessionService(this.kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
        const apiKeys = new ApiKeysService(this.kv, loggingService);
        const rateLimit = new RateLimitService(this.kv);
        
        // ── Security & Deception Subsystem ──────────────────────────────────
        const { anonymization, shadowProtocol, behavioral, honeypot, canaryService, kernelService } = this.initSecuritySubsystem(protection, mesh, tpm, health);
        
        // ── Intelligence & Forensic Subsystem ───────────────────────────────
        const { geoIp, forensicService, curatedIntel, news, networkDiscovery, incidents, compliance } = this.initIntelligenceSubsystem(protection, processTracker, health, configProvider);

        const playbook = new PlaybookService(this.sidecarManager, protection, notifications, mesh, shadowProtocol, eventBus);

        // ── Engine & Autopilot Subsystem ────────────────────────────────────
        const { autopilot, morphing, chaos, supplyChain, provisioning, governance, shadow, covert } = this.initEngineSubsystem(eventBus, playbook, notifications, mesh, shadowProtocol, this.sidecarManager, protection, forensicService, kernelService, processTracker, honeypot, canaryService, health);

        return {
            config: configProvider, protection, command: this.sidecarManager, audit: this.auditService,
            notifications, baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService), 
            processTracker, sessions, apiKeys, eventBus,
            honeypot, canaryService, kernelService, forensicService,
            autopilot, playbook, morphing, chaos,
            supplyChain, mesh, meshAuth: (mesh as any).authService, threatIntel: curatedIntel as any,
            compliance, anonymization, shadowProtocol, deceptionGrid: new DeceptionGridService(honeypot, canaryService, loggingService),
            curatedIntel, news, networkDiscovery, networkLogs: networkLog,
            incidents, platformInfo, shadow, covert,
            ledger: new LedgerService(mesh, loggingService),
            tpm, health,
            mediator: new EventMediator(eventBus, processTracker, canaryService, broadcast, loggingService),
            behavioral,
            geoIp,
            rateLimit,
            policy: autopilot.getPolicy()
        };
    }

    private initSecuritySubsystem(protection: any, mesh: any, tpm: any, health: any) {
        const anonymization = new AnonymizationService(protection.vpn, loggingService);
        const shadowProtocol = new ShadowProtocolService(mesh, anonymization, loggingService);
        const behavioral = new BehavioralService(protection.firewall as any);
        
        const honeypot = new HoneypotService(this.sidecarManager, protection.firewall, protection.pcap, broadcast, loggingService);
        if (honeypot) honeypot.setBehavioralService(behavioral);

        const canaryService = this.safeInit(health, "Canary", () => new CanaryService(this.auditService, this.sidecarManager, loggingService));
        const kernelService = new KernelService(this.executor, this.auditService, this.sidecarManager);

        return { anonymization, shadowProtocol, behavioral, honeypot, canaryService, kernelService };
    }

    private initIntelligenceSubsystem(protection: any, processTracker: any, health: any, configProvider: any) {
        const geoIp = this.safeInit(health, "GeoIP", () => new GeoIpService(loggingService));
        const forensicService = this.safeInit(health, "Forensics", () => new ForensicService(this.auditService, loggingService, this.kv, processTracker));
        const curatedIntel = this.safeInit(health, "CuratedIntel", () => new CuratedIntelService(loggingService, protection.firewall, configProvider));
        const news = this.safeInit(health, "News", () => new NewsSignalService(loggingService));
        const networkDiscovery = this.safeInit(health, "NetworkDiscovery", () => new NetworkDiscoveryService(loggingService));
        const incidents = this.safeInit(health, "Incidents", () => new IncidentService(this.kv, loggingService));
        const compliance = this.safeInit(health, "Compliance", () => new ComplianceService(this.auditService, this.kv, processTracker));

        return { geoIp, forensicService, curatedIntel, news, networkDiscovery, incidents, compliance };
    }

    private initEngineSubsystem(eventBus: any, playbook: any, notifications: any, mesh: any, shadowProtocol: any, sidecarManager: any, protection: any, forensicService: any, kernelService: any, processTracker: any, honeypot: any, canaryService: any, health: any) {
        const autopilot = new AutopilotService(eventBus, playbook, this.auditService, protection, mesh, notifications, loggingService, processTracker, forensicService, kernelService);
        const morphing = this.safeInit(health, "Morphing", () => new MorphingService(honeypot, canaryService, this.auditService, mesh));
        const chaos = this.safeInit(health, "Chaos", () => new ChaosEngine(eventBus, this.auditService, this.sidecarManager));
        const supplyChain = this.safeInit(health, "SupplyChain", () => new SupplyChainService());
        const provisioning = this.safeInit(health, "Provisioning", () => new ProvisioningService(this.sidecarManager, mesh, this.executor, loggingService));
        const governance = this.safeInit(health, "Governance", () => new GovernanceService(mesh, protection, loggingService));
        const shadow = this.safeInit(health, "Shadow", () => new ShadowService(this.executor, loggingService));
        const covert = this.safeInit(health, "Covert", () => new CovertChannelService(this.executor, loggingService));

        return { autopilot, morphing, chaos, supplyChain, provisioning, governance, shadow, covert };
    }

    private safeInit<T>(health: HealthService, name: string, factory: () => T): T {
        try {
            const service = factory();
            health.reportStatus(name, "OPERATIONAL");
            return service;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            loggingService.log(`[BOOT] Auxiliary Service '${name}' failed to initialize: ${msg}`, SyslogSeverity.WARNING);
            health.reportStatus(name, "FAILED", msg);
            return null as any;
        }
    }

    private async selfDestruct() {
        await loggingService.log("SELF-DESTRUCT TRIGGERED.", SyslogSeverity.EMERGENCY, "SOVEREIGN");
        const iter = this.kv.list({ prefix: [] });
        for await (const entry of iter) await this.kv.delete(entry.key);
        Deno.exit(1);
    }
}
