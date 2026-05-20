import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { 
    BaselineService, ProcessTracker, EventBus, MeshAuthService, MeshManager,
    DecentralizedMetricsService,
    PlaybookService, MorphingService,
    ChaosEngine, SupplyChainService, HoneypotService, 
    CanaryService, AutopilotService, KernelService, 
    ShadowService, CovertChannelService,
    NetworkDiscoveryService, NetworkLogService,
    IncidentService, NewsSignalService,
    LedgerService, HealthService, EventMediator,
    WatchdogService, TacticalIntelService,
    CorrelationService, PolicyEngine, ViewModelService,
    DeceptionGridService, IntegrityService,
    BehavioralService
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@api/ws.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loadConfig } from "@core/config_schema.ts";
import { setMeshManager } from "@domain/orchestration/mesh.ts";
import { setMetricsService } from "@domain/analysis/metrics_service.ts";

import { SubsystemFactory } from "@core/subsystem_factory.ts";
import { SystemLifecycleService } from "@domain/analysis/system_lifecycle_service.ts";

// Infrastructure Providers
import { KvAuditRepository } from "@infrastructure/persistence/kv/kv_audit_repository.ts";

import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";
import { Result, ok, err } from "@core/result.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private web!: WebAdapter;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;
    private lifecycleService!: SystemLifecycleService;

    private logPilotBanner() {
        console.log(`
  ▗▄▄▖ ▗▄▖ ▗▖ ▗▖▗▖  ▗▖▗▄▄▄▖▗▄▄▄▖▗▄▄▖
  ▐▌   ▐▌ ▐▌▐▌ ▐▌▐▛▚▞▜▌▐▌     █  ▐▌ ▐▌
  ▐▝▚▄▖▐▌ ▐▌▐▌ ▐▌▐▌  ▐▌▐▛▀▀▖  █  ▐▛▀▚▖
  ▝▚▄▄▖▝▙▄☘▝▙▄▄☘▐▌  ▐▌▐▙▄▄▖  █  ▐▌ ▐▌
  SOVEREIGN CYBERSECURITY - PILOT V5.2
        `);
    }

    async boot() {
        this.logPilotBanner();
        await this.initCore();

        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);

        loggingService.setConfig({
            host: config.SYSLOG_HOST,
            port: config.SYSLOG_PORT,
            transport: config.SYSLOG_TRANSPORT,
            caPath: config.SYSLOG_CA_PATH
        });

        // ── Phase 2: Fundamental Infrastructure ───────────────────────────────
        this.sidecarManager.setConfig(configProvider);
        const tpmManager = new TPMManager(this.sidecarManager, loggingService);
        this.sidecarManager.setTpm(tpmManager);
        this.sidecarManager.init();

        const factory = new SubsystemFactory(this.kv, loggingService, this.executor, this.sidecarManager, this.auditService);
        this.lifecycleService = factory.initSystemLifecycle(tpmManager);

        await this.setupSafetyAndErrorHandlers();

        const { platformInfo, notificationService, eventBus, meshManager, healthService } =
            await this.initializeInfrastructure(configProvider, tpmManager);

        // ── Phase 5: Service Orchestration ────────────────────────────────────
        this.services = await this.initServices(
            configProvider, platformInfo, notificationService,
            eventBus, meshManager, tpmManager, healthService
        );

        await this.finalizeBoot(configProvider, healthService);
    }

    private async setupSafetyAndErrorHandlers() {
        // Active Safety: Crash Loop Detection / Safe Mode
        const isSafeMode = await this.lifecycleService.checkCrashLoop();
        if (isSafeMode) {
             Deno.env.set("SHADOW_MODE", "true");
             Deno.env.set("STRICT_POLICY_ENFORCEMENT", "false");
             loggingService.log({
                 timestamp: new Date().toISOString(),
                 type: LogType.AUDIT,
                 severity: LogSeverity.ERROR,
                 caller: "orchestrator:app:sovereign_app",
                 message: "⚠️ SAFE MODE ACTIVATED: Multiple boot failures detected. All enforcement disabled."
             });

             if (Deno.env.get("AUTO_RESTORE_LKG") === "true") {
                 await this.lifecycleService.tryRestoreLkg();
             }
        }

        // SOV-P3: Global Error Handlers (Fail-Closed Hardening)
        globalThis.addEventListener("unhandledrejection", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Unhandled Promise Rejection: ${e.reason}. Initiating fail-closed sequence.`
            }).catch(() => {});

            this.emergencyLockdown(`Unhandled Promise Rejection: ${e.reason}`);
        });

        globalThis.addEventListener("error", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Fatal Runtime Error: ${e.message}. Initiating fail-closed sequence.`
            }).catch(() => {});

            this.emergencyLockdown(`Fatal Runtime Error: ${e.message}`);
        });
    }

    private async initializeInfrastructure(configProvider: ConfigurationPort, tpmManager: TPMManager) {
        // ── Phase 1.1: Security Lockdown Check ───────────────────────────────
        const lockdown = await this.kv.get(["system", "lockdown"]);
        if (lockdown.value) {
            const data = lockdown.value as any;
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:app:sovereign_app:boot",
                message: `BOOT ABORTED: System is in PERMANENT LOCKDOWN. Reason: ${data.reason}. Timestamp: ${data.timestamp}`
            });
            console.error("!!! CRITICAL: SYSTEM LOCKED !!!");
            console.error(`Reason: ${data.reason}`);
            console.error("Run 'deno run -A scripts/recover.ts' with a valid recovery token to restore access.");
            Deno.exit(1);
        }

        const platformInfo = await getPlatformInfo(this.executor);

        await bootstrap();
        const eventBus = new EventBus(loggingService);
        const notificationService = new NotificationService(this.kv, loggingService);
        const healthService = new HealthService(loggingService);
        healthService.setSidecarManager(this.sidecarManager);
        
        // REPOSITORY INJECTION
        const auditRepo = new KvAuditRepository(this.kv);
        this.auditService = new AuditService(auditRepo, loggingService, tpmManager);
        this.auditService.setConfig(configProvider);
        const auditInitRes = await this.auditService.init();
        if (!auditInitRes.success) {
            await this.emergencyLockdown(`Audit Integrity Violation: ${auditInitRes.error.message}`);
        }

        // ── Phase 3: Mesh & Network ──────────────────────────────────────────
        const meshManager = await this.initMesh(tpmManager, configProvider);
        const meshInitRes = await meshManager.init();
        if (!meshInitRes.success) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:app:sovereign_app",
                message: `Mesh initialization non-critical failure: ${meshInitRes.error.message}`
            });
        }

        // ── Phase 4: Hardware Integrity ──────────────────────────────────────
        const isHardwareSecure = await this.lifecycleService.verifyHardware(configProvider);
        if (!isHardwareSecure) {
            await this.emergencyLockdown("Hardware Integrity Violation");
        }

        return { platformInfo, notificationService, eventBus, meshManager, healthService };
    }

    private async finalizeBoot(configProvider: ConfigurationPort, healthService: HealthService) {
        // ── Phase 6: Web, Metrics & Signals ──────────────────────────────────
        await this.initOperationalLayer(this.services);

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8000);
        this.checkPilotSafety(configProvider);

        this.lifecycleService.registerSignalHandlers(async () => {
            await this.gracefulShutdown();
        });

        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.SUCCESS,
            caller: "orchestrator:app:sovereign_app",
            message: `Sovereign Orchestrator fully engaged on port ${port}`
        });
        await this.web.start(port);

        this.services.lifecycle.setKv(this.kv);
        this.services.lifecycle.setPolicyEngine(this.services.policy);
        this.services.lifecycle.startShadowModeTimer(configProvider);
        this.services.lifecycle.scheduleLkgSnapshot();
        this.watchdog = this.startWatchdog(healthService);
    }

    private watchdog?: WatchdogService;

    private async gracefulShutdown() {
        if (this.watchdog) this.watchdog.shutdown();

        if (this.services) {
            const {
                autopilot, mesh, audit, mediator, logging, lifecycle,
                health, metrics, honeypot, behavioral, processTracker,
                kernelService, protection, provisioning,
                morphing, chaos, supplyChain, curatedIntel, news, networkDiscovery,
                canaryService, autonomousAutopilot, integrity
            } = this.services;

            if (autopilot) await autopilot.shutdown();
            if (autonomousAutopilot) await autonomousAutopilot.shutdown();
            if (provisioning) await provisioning.shutdown();
            if (integrity) await integrity.shutdown();
            if (morphing) await morphing.shutdown();
            if (chaos && "shutdown" in chaos) await (chaos as any).shutdown();
            if (supplyChain && "shutdown" in supplyChain) await (supplyChain as any).shutdown();
            if (curatedIntel) await curatedIntel.shutdown();
            if (news) await news.shutdown();
            if (networkDiscovery) await networkDiscovery.shutdown();
            if (canaryService) await canaryService.shutdown();

            if (mesh) await mesh.shutdown();
            if (audit) await audit.shutdown();
            if (mediator && "shutdown" in mediator && typeof mediator.shutdown === "function") {
                await mediator.shutdown();
            }
            if (lifecycle) await lifecycle.shutdown();
            if (health && "shutdown" in health && typeof health.shutdown === "function") {
                await (health as any).shutdown();
            }
            if (metrics && "stop" in metrics && typeof metrics.stop === "function") {
                metrics.stop();
            }
            if (honeypot && "shutdown" in honeypot && typeof honeypot.shutdown === "function") {
                await (honeypot as any).shutdown();
            }
            if (behavioral && "shutdown" in behavioral && typeof behavioral.shutdown === "function") {
                await (behavioral as any).shutdown();
            }
            if (processTracker) await processTracker.shutdown();
            if (kernelService && "shutdown" in kernelService && typeof kernelService.shutdown === "function") {
                await (kernelService as any).shutdown();
            }
            if (protection?.firewall && "shutdown" in protection.firewall && typeof (protection.firewall as any).shutdown === "function") {
                await (protection.firewall as any).shutdown();
            }
            if (protection?.vpn && "shutdown" in protection.vpn && typeof (protection.vpn as any).shutdown === "function") {
                await (protection.vpn as any).shutdown();
            }
            if (logging) await logging.shutdown();
        }

        if (this.web) this.web.stop();
        if (this.sidecarManager) await this.sidecarManager.shutdown();
        if (this.kv) this.kv.close();
    }

    private async initCore() {
        loggingService.enableGlobalIntercept();
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:init",
            message: "Initiating Sovereign Boot Sequence (Self-Test Phase)"
        });
        await camouflage();
        await load({ export: true, allowEmptyValues: true });

        this.kv = await Deno.openKv("./volume/storage/orchestrator.db");
        loggingService.setKv(this.kv);
        this.executor = new SystemExecutor();
        this.sidecarManager = new SidecarManager(this.executor, loggingService);
    }

    private async initMesh(tpm: TPMManager, config: ConfigurationPort): Promise<MeshManager> {
        const meshAuthService = new MeshAuthService(this.kv, loggingService, config, tpm);
        const meshManager = new MeshManager(meshAuthService, loggingService, this.auditService, config);
        
        setMeshManager(meshManager);
        meshManager.startDiscovery();
        return meshManager;
    }

    private async initOperationalLayer(services: ServiceContainer) {
        this.web = new WebAdapter(services);
        
        // Phase 2: Decouple Metrics Service
        const metricsService = new DecentralizedMetricsService(
            services.eventBus,
            loggingService
        );
        setMetricsService(metricsService as any);

        this.injectEventBus(services);
        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();
    }

    private injectEventBus(services: ServiceContainer) {
        const bus = services.eventBus;
        if ("setEventBus" in services.protection.firewall && typeof (services.protection.firewall as any).setEventBus === "function") {
            (services.protection.firewall as any).setEventBus(bus);
        }
        services.mesh.setEventBus(bus);
        services.honeypot.setEventBus(bus);
        services.processTracker.setEventBus(bus);
        services.kernelService.setEventBus(bus);
        services.audit.setEventBus(bus);
        if ("setEventBus" in services.protection.vpn && typeof (services.protection.vpn as any).setEventBus === "function") {
            (services.protection.vpn as any).setEventBus(bus);
        }
        services.behavioral.setEventBus(bus);
        services.viewModel.setEventBus(bus);
    }

    private startWatchdog(health: HealthService): WatchdogService {
        const watchdog = new WatchdogService(health, loggingService, async (name) => {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:app:sovereign_app:watchdog",
                message: `Attempting to resurrect failed service: ${name}`
            });

            try {
                // 1. Check if it's a sidecar
                const sidecars = ["analyzer", "enforcer", "decoy", "netcap", "sentinel", "watchfile", "tunnel"];
                if (sidecars.includes(name.toLowerCase())) {
                    await this.sidecarManager.restartSidecar(name.toLowerCase());
                    return true;
                }

                // 2. Specialized re-initialization for domain services
                if (name === "CuratedIntel") {
                    await this.services.curatedIntel.start(this.kv);
                    return true;
                }
                if (name === "Honeypot") {
                    await this.services.honeypot.start();
                    return true;
                }
                if (name === "Lure") {
                    await this.services.autopilot.spawnLureProcess();
                    return true;
                }

                return false;
            } catch (e) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:watchdog",
                    message: `Resurrection failed for ${name}: ${(e as Error).message}`
                });
                return false;
            }
        });
        watchdog.start();
        return watchdog;
    }

    private wireEvents() {
        this.services.mediator.wireSidecars(this.services.command);

        // Fail-Closed Lifecycle: Monitor critical sidecar health
        this.sidecarManager.onEvent("SYSTEM_ERROR", (payload) => {
            if (payload.type === "SIDECAR_CRASH_LOOP" && payload.critical) {
                this.loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:fail_closed",
                    message: `FATAL: Critical sidecar '${payload.sidecar}' entered crash loop. Initiating emergency lockdown.`
                }).catch(() => {});

                this.emergencyLockdown(`Critical Sidecar Failure: ${payload.sidecar}`);
            }
        });
    }

    // Accessor for internal logging
    private get loggingService() {
        return (this as any).services?.logging || loggingService;
    }

    private async startSubsystems() {
        const { autopilot, honeypot, canaryService, kernelService, curatedIntel, news, networkDiscovery, lifecycle, autonomousAutopilot, provisioning, integrity, behavioral } = this.services;
        
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:domain",
            message: "Activating autonomous subsystems..."
        });

        const report = (name: string, status: string, message?: string) => this.services.health.reportStatus(name, status, message);

        report("Playbook", "OPERATIONAL");
        report("Autopilot", "OPERATIONAL");
        report("Morphing", "OPERATIONAL");
        report("Anonymization", "OPERATIONAL");
        report("DeceptionGrid", "OPERATIONAL");
        report("ProcessTracker", "OPERATIONAL");
        
        const wrap = (name: string, promise: Promise<Result<any, Error> | void>) => {
            report(name, "BOOTING");
            promise.then((res) => {
                if (!res || res.success) {
                    report(name, "OPERATIONAL");
                } else if (res && !res.success) {
                    report(name, "FAILED", res.error.message);
                }
            })
            .catch(e => report(name, "FAILED", e.message));
        };

        wrap("Autopilot", autopilot.start());
        wrap("Behavioral", behavioral.init());
        wrap("Honeypot", honeypot.start());
        wrap("Canary", canaryService.start());
        wrap("KernelService", (async () => {
            const res = await (kernelService as any).start();
            if (!res.success) return res;

            // SOV-P2: Apply AppArmor Lockdown for critical sidecars
            if (this.services.config.getEnv("ENVIRONMENT") === "production") {
                const sidecars = ["analyzer", "sentinel", "watchfile"];
                for (const name of sidecars) {
                    const aaRes = await kernelService.deployAppArmorProfile(name, `/var/lib/cts/bin/${name}`);
                    if (!aaRes.success) {
                        loggingService.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.ERROR,
                            caller: "orchestrator:app:sovereign_app",
                            message: `AppArmor deployment failed for ${name}: ${aaRes.error.message}`
                        });
                    }
                }
            }
            return ok(undefined);
        })());
        wrap("CuratedIntel", curatedIntel.start(this.kv));
        wrap("NewsSignal", news.start(this.kv));
        wrap("NetworkDiscovery", networkDiscovery.start());
        wrap("Provisioning", provisioning.run());
        integrity.start();
        
        this.services.baseline.startMonitor();
        lifecycle.start();
        autonomousAutopilot.start();

        this.startDaemons();
    }

    private async startDaemons() {
        const { command: sm, platformInfo } = this.services;
        const daemons = ["decoy", "watchfile", "netcap", "analyzer", "tunnel"];

        if ((platformInfo.name as string) === "linux" || platformInfo.name === "ubuntu") {
            daemons.push("enforcer");
        }

        if (platformInfo.name === "macos") daemons.push("sentinel-darwin");
        if (platformInfo.name === "windows") {
            daemons.push("telemetry-win");
            daemons.push("enforcer-win");
        }

        // BUG-5.5 FIX: Handle persistent sidecar failures during boot
        const { SIDECAR_REGISTRY } = await import("@infrastructure/runtime/sidecar_registry.ts");

        for (const s of daemons) {
            try {
                const child = await sm.getPersistentSidecar(s);
                if (!child && SIDECAR_REGISTRY[s]?.critical) {
                    throw new Error(`Critical sidecar '${s}' failed to spawn.`);
                }
            } catch (e) {
                const isCritical = SIDECAR_REGISTRY[s]?.critical;
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:boot",
                    message: `${isCritical ? "FATAL" : "CRITICAL"}: Persistent sidecar '${s}' failed to start: ${(e as Error).message}`
                });

                if (isCritical) {
                    await this.emergencyLockdown(`Boot Failure: Critical agent '${s}' offline.`);
                }
            }
        }
        
        const ebpf = await sm.getPersistentSidecar("sentinel").catch(() => null);
        if (ebpf) {
            await sm.sendCommand("sentinel", { type: "HIDE_PID", pid: Deno.pid }).catch(() => {});

            // Performance Hardening: Implement in-kernel filtering for "Quiet Security"
            // Skip events from the orchestrator and its trusted sidecars
            for (const comm of ["deno", "enforcer", "sentinel", "watchfile", "netcap", "analyzer", "decoy"]) {
                await sm.sendCommand("sentinel", { type: "TRUST_COMM", comm }).catch(() => {});
            }
        }
    }

    private async seedForensics() {
        const { incidents, networkLogs } = this.services;
        const existing = await incidents.getIncidents();
        if (existing.length > 0) return;

        await networkLogs.log({ direction: "INBOUND", source: "185.220.101.42", destination: "LOCAL", protocol: "TCP/443", length: 512, action: "BLOCK" });
        await incidents.reportIncident({ severity: "HIGH", title: "Suspicious Vault Access", description: "Tor exit node attempt.", source: "Network", indicators: ["185.220.101.42"] });
    }

    private async initServices(
        configProvider: EnvConfigProvider, platformInfo: PlatformInfo, notifications: NotificationService,
        eventBus: EventBus, mesh: MeshManager, 
        tpm: TPMManager, health: HealthService
    ): Promise<ServiceContainer> {
        initBroadcaster({ notificationService: notifications, auditService: this.auditService, eventBus, loggingService });

        const factory = new SubsystemFactory(this.kv, loggingService, this.executor, this.sidecarManager, this.auditService);

        const identity = factory.initIdentity(configProvider);
        const { protection, networkLog } = await factory.initProtection(platformInfo, configProvider);
        
        const processTracker = factory.initProcessTracker(platformInfo);
        
        const correlation = new CorrelationService(this.auditService, loggingService);
        this.auditService.setCorrelation(correlation);

        const security = factory.initSecurity(protection, mesh, configProvider, health);

        const intelligence = factory.initIntelligence(protection, processTracker, health, configProvider, mesh, identity.meshAuth);

        const playbook = new PlaybookService();
        const { autopilot, autonomousAutopilot, lifecycle, policy, provisioning } = await factory.initEngine(correlation, mesh);

        const integrity = factory.createService(health, "Integrity", () => new IntegrityService(mesh, this.auditService, tpm, loggingService));
        const morphing = factory.createService(health, "Morphing", () => new MorphingService(security.honeypot, security.canaryService, this.auditService, mesh));
        const chaos = factory.createService(health, "Chaos", () => new ChaosEngine(eventBus, this.auditService, this.sidecarManager));
        const supplyChain = factory.createService(health, "SupplyChain", () => new SupplyChainService());
        await supplyChain.init();
        const shadow = factory.createService(health, "Shadow", () => new ShadowService(this.executor, loggingService));
        const covert = factory.createService(health, "Covert", () => new CovertChannelService(this.executor, loggingService));
        const viewModel = new ViewModelService();

        const services: ServiceContainer = {
            config: configProvider, protection, command: this.sidecarManager, audit: this.auditService,
            notifications, baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService),
            processTracker, sessions: identity.sessions, apiKeys: identity.apiKeys, eventBus,
            honeypot: security.honeypot, canaryService: security.canaryService, kernelService: security.kernelService, forensicService: intelligence.forensicService,
            autopilot, autonomousAutopilot, lifecycle, logging: loggingService,
            playbook, morphing, chaos,
            supplyChain, mesh, meshAuth: identity.meshAuth, threatIntel: intelligence.curatedIntel as any,
            compliance: intelligence.compliance, anonymization: security.anonymization, shadowProtocol: security.shadowProtocol, deceptionGrid: new DeceptionGridService(security.honeypot, security.canaryService, loggingService),
            curatedIntel: intelligence.curatedIntel, news: intelligence.news, networkDiscovery: intelligence.networkDiscovery, networkLogs: networkLog,
            provisioning, integrity,
            incidents: intelligence.incidents, platformInfo, shadow, covert,
            ledger: new LedgerService(mesh, loggingService),
            tpm, health,
            metrics: (setMetricsService as any)._instance,
            mediator: new EventMediator(eventBus, processTracker, security.canaryService, broadcast, loggingService, this.kv),
            behavioral: security.behavioral, geoIp: intelligence.geoIp, rateLimit: identity.rateLimit, policy, correlation,
            viewModel
        };

        playbook.setServices(services);
        autopilot.setServices(services);

        return services;
    }

    private checkPilotSafety(config: ConfigurationPort) {
        const isPilot = config.getEnv("PILOT_MODE") === "true";
        if (isPilot) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "orchestrator:app:sovereign_app",
                message: "🛡️ PILOT SAFETY CHECK: System is running in Pilot Mode. Ensure 'scripts/emergency_off.sh' is accessible."
            });
        }
    }

    private async emergencyLockdown(reason: string = "Hardware Integrity Failure") {
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:app:sovereign_app",
            message: `CRITICAL: EMERGENCY LOCKDOWN ACTIVATED (${reason}). System quarantined. Forensic state preserved. Physical/MFA recovery required.`
        });

        await this.kv.set(["system", "lockdown"], {
            reason,
            timestamp: new Date().toISOString(),
            status: "QUARANTINED"
        });

        try {
            await this.sidecarManager.sendCommand("sentinel", { type: "LOCKDOWN" });
        } catch {}

        Deno.exit(1);
    }
}
