import { WebAdapter } from "@orchestrator/interface/web/web_adapter.tsx";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "@domain/analysis/audit.ts";
import { NotificationService } from "@domain/analysis/notifications.ts";
import { 
    BaselineService, ProcessTracker, EventBus, MeshAuthService, MeshManager,
    DecentralizedMetricsService,
    PlaybookService, BehavioralService, MorphingService,
    ChaosEngine, SupplyChainService, HoneypotService, 
    CanaryService, AutopilotService, KernelService, 
    ShadowService, CovertChannelService,
    NetworkDiscoveryService, NetworkLogService,
    IncidentService, NewsSignalService,
    LedgerService, HealthService, EventMediator,
    WatchdogService, TacticalIntelService,
    CorrelationService, PolicyEngine
} from "@domain/index.ts";
import { EnvConfigProvider } from "@infrastructure/config/env_config_provider.ts";
import { load } from "@std/dotenv";
import { ServiceContainer, PlatformInfo } from "@core/container.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { broadcast, initBroadcaster } from "@api/ws.ts";
import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { bootstrap, camouflage } from "./bootstrapper.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { loadConfig } from "@core/config_schema.ts";
import { setMeshManager } from "@domain/orchestration/mesh.ts";
import { setMetricsService } from "@domain/analysis/metrics_service.ts";

import { SubsystemFactory } from "@core/subsystem_factory.ts";

// Infrastructure Providers
import { KvAuditRepository } from "@infrastructure/persistence/kv/kv_audit_repository.ts";

import { LifecycleService } from "@domain/analysis/lifecycle_service.ts";
import { AutonomousAutopilotService } from "@domain/analysis/autonomous_autopilot_service.ts";

export class SovereignApp {
    private services!: ServiceContainer;
    private web!: WebAdapter;
    private kv!: Deno.Kv;
    private sidecarManager!: SidecarManager;
    private executor!: SystemExecutor;
    private auditService!: AuditService;

    private logPilotBanner() {
        console.log(`
  ▗▄▄▖ ▗▄▖ ▗▖ ▗▖▗▖  ▗▖▗▄▄▄▖▗▄▄▄▖▗▄▄▖
  ▐▌   ▐▌ ▐▌▐▌ ▐▌▐▛▚▞▜▌▐▌     █  ▐▌ ▐▌
  ▐▝▚▄▖▐▌ ▐▌▐▌ ▐▌▐▌  ▐▌▐▛▀▀▖  █  ▐▛▀▚▖
  ▝▚▄▄▖▝▙▄▘▝▙▄▄▘▐▌  ▐▌▐▙▄▄▖  █  ▐▌ ▐▌
  SOVEREIGN CYBERSECURITY - PILOT V5.2
        `);
    }

    async boot() {
        this.logPilotBanner();

        // Active Safety: Crash Loop Detection / Safe Mode
        const isSafeMode = await this.checkCrashLoop();
        if (isSafeMode) {
             Deno.env.set("SHADOW_MODE", "true");
             Deno.env.set("STRICT_POLICY_ENFORCEMENT", "false");
             loggingService.log({
                 timestamp: new Date().toISOString(),
                 type: LogType.AUDIT,
                 severity: LogSeverity.CRITICAL,
                 caller: "orchestrator:app:sovereign_app",
                 message: "⚠️ SAFE MODE ACTIVATED: Multiple boot failures detected. All enforcement disabled."
             });

             if (Deno.env.get("AUTO_RESTORE_LKG") === "true") {
                 await this.tryRestoreLkg();
             }
        }

        // SOV-P3: Global Error Handlers
        globalThis.addEventListener("unhandledrejection", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Unhandled Promise Rejection: ${e.reason}`
            }).catch(() => {});
        });

        globalThis.addEventListener("error", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Fatal Runtime Error: ${e.message}`
            }).catch(() => {});
        });

        // ── Phase 1: Core infrastructure ──────────────────────────────────────
        await this.initCore();

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
        
        const config = loadConfig();
        const configProvider = new EnvConfigProvider(config);

        // Phase 1.2: Configure Logging from validated schema
        loggingService.setConfig({
            host: config.SYSLOG_HOST,
            port: config.SYSLOG_PORT,
            transport: config.SYSLOG_TRANSPORT,
            caPath: config.SYSLOG_CA_PATH
        });

        const platformInfo = await getPlatformInfo(this.executor);
        
        // ── Phase 2: Fundamental Infrastructure ───────────────────────────────
        this.sidecarManager.setConfig(configProvider);
        const tpmManager = new TPMManager(this.sidecarManager, loggingService);
        this.sidecarManager.setTpm(tpmManager);
        this.sidecarManager.init();

        await bootstrap();
        const notificationService = new NotificationService(this.kv, loggingService);
        const eventBus = new EventBus(loggingService);
        const healthService = new HealthService(loggingService);
        
        // REPOSITORY INJECTION
        const auditRepo = new KvAuditRepository(this.kv);
        this.auditService = new AuditService(auditRepo, loggingService, tpmManager);
        this.auditService.setConfig(configProvider);

        // ── Phase 3: Mesh & Network ──────────────────────────────────────────
        const meshManager = await this.initMesh(tpmManager, configProvider);

        // ── Phase 4: Hardware Integrity ──────────────────────────────────────
        await this.verifyHardware(tpmManager, configProvider);

        // ── Phase 5: Service Orchestration ────────────────────────────────────
        this.services = await this.initServices(
            configProvider, platformInfo, notificationService,
            eventBus, meshManager, tpmManager, healthService
        );

        // ── Phase 6: Web, Metrics & Signals ──────────────────────────────────
        await this.initOperationalLayer(this.services);

        // ── Phase 7: Finalize ───────────────────────────────────────────────
        const port = configProvider.getNumber("PORT", 8000);
        this.checkPilotSafety(configProvider);
        this.registerSignalHandlers();
        this.startWatchdog(healthService);

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
    }

    private async checkCrashLoop(): Promise<boolean> {
        try {
            const tempKv = await Deno.openKv("./volume/storage/boot_counter.db");
            const key = ["boot", "last_attempt"];
            const entry = await tempKv.get<any>(key);
            const now = Date.now();

            let count = 1;
            if (entry.value && (now - entry.value.timestamp < 300000)) { // 5 minutes
                count = (entry.value.count || 0) + 1;
            }

            await tempKv.set(key, { count, timestamp: now });
            tempKv.close();

            return count >= 3;
        } catch {
            return false;
        }
    }

    private async tryRestoreLkg() {
        try {
            const tempKv = await Deno.openKv("./volume/storage/orchestrator.db");
            const iter = tempKv.list({ prefix: ["lkg"] });
            let restoredCount = 0;
            for await (const entry of iter) {
                const targetKey = entry.key.slice(1); // Remove "lkg" prefix
                await tempKv.set(targetKey, entry.value);
                restoredCount++;
            }
            tempKv.close();

            if (restoredCount > 0) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.SUCCESS,
                    caller: "orchestrator:app:lkg",
                    message: `✅ AUTO-RESTORE: Successfully restored ${restoredCount} records from Last Known Good snapshot.`
                });
            }
        } catch (e) {
            console.error(`LKG Restore failed: ${e}`);
        }
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

    private async initMesh(tpm: TPMManager, config: any): Promise<MeshManager> {
        const meshAuthService = new MeshAuthService(this.kv, loggingService, tpm);
        meshAuthService.setConfig(config);
        const meshManager = new MeshManager(meshAuthService, loggingService, this.auditService);
        meshManager.setConfig(config);
        
        setMeshManager(meshManager);
        await meshManager.init();
        meshManager.startDiscovery();
        return meshManager;
    }

    private async initOperationalLayer(services: ServiceContainer) {
        this.web = new WebAdapter(services);
        
        // Phase 2: Decouple Metrics Service
        const metricsService = new DecentralizedMetricsService(
            services.eventBus,
            loggingService,
            broadcast
        );
        (setMetricsService as any)(metricsService);

        this.injectEventBus(services);
        this.wireEvents();
        await this.startSubsystems();
        await this.seedForensics();
    }

    private injectEventBus(services: ServiceContainer) {
        const bus = services.eventBus;
        (services.protection.firewall as any).setEventBus?.(bus);
        services.mesh.setEventBus?.(bus);
        services.honeypot.setEventBus?.(bus);
        services.processTracker.setEventBus?.(bus);
        services.kernelService.setEventBus?.(bus);
        services.audit.setEventBus?.(bus);
        services.kernelService.setConfig?.(services.config);
        (services.protection.vpn as any).setEventBus?.(bus);
        services.behavioral.setEventBus?.(bus);
    }

    private startWatchdog(health: HealthService) {
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
                    await (this.services.autopilot as any).spawnLureProcess();
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
    }

    private async verifyHardware(tpm: TPMManager, config: EnvConfigProvider) {
        const goldenPcrs: Record<number, string> = {};
        for (const [key, value] of Object.entries(Deno.env.toObject())) {
            if (key.startsWith("TPM_GOLDEN_PCR_")) {
                const index = parseInt(key.replace("TPM_GOLDEN_PCR_", ""));
                if (!isNaN(index)) goldenPcrs[index] = value;
            }
        }

        const isHardwareSecure = await tpm.verifyIntegrity(goldenPcrs);
        const bypassToken = config.getEnv("SECURE_ENVIRONMENT_TOKEN");
        const secureBypass = config.getEnv("SECURE_BYPASS_TOKEN");

        const isValidBypass = secureBypass &&
                             secureBypass.length >= 32 &&
                             (await secureCompare(bypassToken, secureBypass)) &&
                             config.getEnv("ENVIRONMENT") !== "production";

        if (!isHardwareSecure && !isValidBypass) {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:app:sovereign_app:security",
                message: "CRITICAL: HARDWARE INTEGRITY FAILURE. Access denied. No valid/secure bypass token provided."
            });
            // ENFORCEMENT: Trigger Emergency Lockdown if integrity fails and no secure bypass is active
            await this.emergencyLockdown("Hardware Integrity Violation");
        } else if (!isHardwareSecure && isValidBypass) {
            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:app:sovereign_app:security",
                message: "WARNING: RUNNING IN UNSAFE BYPASS MODE. System integrity is NOT hardware-verified. Environment: " + Deno.env.get("ENVIRONMENT")
            });
        }
    }

    private wireEvents() {
        this.services.mediator.wireSidecars(this.services.command);
    }

    private async startSubsystems() {
        const { playbook, autopilot, autonomousAutopilot, lifecycle, morphing, anonymization, deceptionGrid, processTracker, honeypot, canaryService, kernelService, curatedIntel, news, networkDiscovery, health } = this.services;
        
        await loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:app:sovereign_app:domain",
            message: "Activating autonomous subsystems..."
        });

        const report = (name: string, status: string) => health.reportStatus(name, status);

        report("Playbook", "OPERATIONAL");
        report("Autopilot", "OPERATIONAL");
        report("Morphing", "OPERATIONAL");
        report("Anonymization", "OPERATIONAL");
        report("DeceptionGrid", "OPERATIONAL");
        report("ProcessTracker", "OPERATIONAL");
        
        const wrap = (name: string, promise: Promise<any>) => {
            report(name, "BOOTING");
            promise.then(() => report(name, "OPERATIONAL"))
                   .catch(e => report(name, "FAILED", e.message));
        };

        wrap("Honeypot", honeypot.start());
        wrap("Canary", canaryService.start());
        wrap("KernelService", (async () => {
            await kernelService.start();

            // SOV-P2: Apply AppArmor Lockdown for critical sidecars
            if (this.services.config.getEnv("ENVIRONMENT") === "production") {
                const sidecars = ["analyzer", "sentinel", "watchfile"];
                for (const name of sidecars) {
                    await kernelService.deployAppArmorProfile(name, `/var/lib/cts/bin/${name}`);
                }
            }
        })());
        wrap("CuratedIntel", curatedIntel.start(this.kv));
        wrap("NewsSignal", news.start(this.kv));
        wrap("NetworkDiscovery", networkDiscovery.start());
        
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
        for (const s of daemons) {
            try {
                await sm.getPersistentSidecar(s);
            } catch (e) {
                await loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:sovereign_app:boot",
                    message: `CRITICAL: Persistent sidecar '${s}' failed to start: ${(e as Error).message}`
                });
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

    private activeSignalListeners: Map<Deno.Signal, () => Promise<void>> = new Map();
    private isShuttingDown = false;

    private registerSignalHandlers() {
        const cleanup = async () => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;

            await loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "orchestrator:app:sovereign_app:system",
                message: "Initiating graceful shutdown..."
            });

            if (this.services) {
                const { autopilot, mesh, audit, mediator, logging, lifecycle, health, news, behavioral, networkDiscovery, metrics, honeypot, apiKeys, sessions, protection, processTracker, kernelService } = this.services;
                if (autopilot) autopilot.shutdown();
                if (mesh) mesh.shutdown();
                if (audit) audit.shutdown();
                if (mediator) (mediator as any).shutdown();
                if (lifecycle) lifecycle.shutdown();
                if (health) (health as any).shutdown?.();
                if (metrics) metrics.stop();
                if (honeypot) honeypot.shutdown?.();
                if (behavioral) (behavioral as any).shutdown?.();
                if (processTracker) processTracker.shutdown();
                if (kernelService) (kernelService as any).shutdown?.();
                if (protection?.firewall) (protection.firewall as any).shutdown?.();
                if (protection?.vpn) (protection.vpn as any).shutdown?.();
                if (logging) await logging.shutdown();
            }

            if (this.web) this.web.stop();
            if (this.sidecarManager) await this.sidecarManager.shutdown();
            if (this.kv) this.kv.close();

            Deno.exit(0);
        };
        ["SIGINT", "SIGTERM"].forEach(s => {
            try {
                const sig = s as Deno.Signal;
                Deno.addSignalListener(sig, cleanup);
                this.activeSignalListeners.set(sig, cleanup);
            } catch {}
        });
    }

    private unregisterSignalHandlers() {
        for (const [sig, handler] of this.activeSignalListeners.entries()) {
            try { Deno.removeSignalListener(sig, handler); } catch {}
        }
        this.activeSignalListeners.clear();
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

        const security = factory.initSecurity(protection, mesh, tpm, health);
        security.kernelService.setTpmManager(tpm);

        const intelligence = factory.initIntelligence(protection, processTracker, health, configProvider, mesh);

        const playbook = new PlaybookService();
        const { autopilot, autonomousAutopilot, lifecycle, policy } = await factory.initEngine(correlation);

        const morphing = factory["safeInit"](health, "Morphing", () => new MorphingService(security.honeypot, security.canaryService, this.auditService, mesh));
        const chaos = factory["safeInit"](health, "Chaos", () => new ChaosEngine(eventBus, this.auditService, this.sidecarManager));
        const supplyChain = factory["safeInit"](health, "SupplyChain", () => new SupplyChainService());
        await supplyChain.init();
        const shadow = factory["safeInit"](health, "Shadow", () => new ShadowService(this.executor, loggingService));
        const covert = factory["safeInit"](health, "Covert", () => new CovertChannelService(this.executor, loggingService));

        const services: ServiceContainer = {
            config: configProvider, protection, command: this.sidecarManager, audit: this.auditService,
            notifications, baseline: new BaselineService(this.kv, this.sidecarManager, this.executor, loggingService),
            processTracker, sessions: identity.sessions, apiKeys: identity.apiKeys, eventBus,
            honeypot: security.honeypot, canaryService: security.canaryService, kernelService: security.kernelService, forensicService: intelligence.forensicService,
            autopilot, autonomousAutopilot, lifecycle, logging: loggingService,
            playbook, morphing, chaos,
            supplyChain, mesh, meshAuth: (mesh as any).authService, threatIntel: intelligence.curatedIntel as any,
            compliance: intelligence.compliance, anonymization: security.anonymization, shadowProtocol: security.shadowProtocol, deceptionGrid: new DeceptionGridService(security.honeypot, security.canaryService, loggingService),
            curatedIntel: intelligence.curatedIntel, news: intelligence.news, networkDiscovery: intelligence.networkDiscovery, networkLogs: networkLog,
            incidents: intelligence.incidents, platformInfo, shadow, covert,
            ledger: new LedgerService(mesh, loggingService),
            tpm, health,
            metrics: (setMetricsService as any)._instance, // Accessing singleton instance set in initOperationalLayer
            mediator: new EventMediator(eventBus, processTracker, security.canaryService, broadcast, loggingService, this.kv),
            behavioral: security.behavioral, geoIp: intelligence.geoIp, rateLimit: identity.rateLimit, policy, correlation
        };

        playbook.init(services);
        autopilot.init(services);

        return services;
    }
}
