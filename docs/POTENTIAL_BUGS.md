# Sovereign Codebase Bug & Vulnerability Register

This document tracks latent bugs, edge cases, and architectural weaknesses identified during the systematic audit of the Sovereign Security Orchestrator.

---

## 1. Security & Identity

### 1.1 `SecurityMiddleware` Nonce Leakage
- **Location**: `src/orchestrator/interface/web/middleware/security.ts`
- **Issue**: The CSP `nonce` is generated for every request but is stored in the Hono context and then applied to the header. If the frontend uses a service worker or a heavy client-side cache, the nonce in the HTML (if pre-rendered) may drift from the nonce in the header, causing a DoS of the frontend.
- **Severity**: Low (Functional Risk)

### 1.2 `ApiKeysService` Sequential KV Lookups
- **Location**: `src/orchestrator/domain/identity/api_keys.ts`
- **Issue**: `listApiKeys()` performs N+1 lookups (one for the list of IDs, then N individual lookups for metadata). On a system with many service accounts, this will cause significant latency in the admin UI.
- **Severity**: Medium (Performance)

---

## 2. Analysis & Forensics

### 2.1 `CorrelationService` Infinite Risk Accumulation
- **Location**: `src/orchestrator/domain/analysis/correlation_service.ts`
- **Issue**: Risk scores for `CorrelationNode` only increase and never decay. A long-lived, legitimate IP or process will eventually cross the `CRITICAL_RISK_THRESHOLD` simply by accumulating low-risk events (risk = 1) over a long period.
- **Severity**: High (Logic Flaw / False Positives)

### 2.2 `ProcessTracker` Race Condition in Parent Lookup
- **Location**: `src/orchestrator/domain/analysis/process_tracker.ts`
- **Issue**: `analyzeEvent(pid, comm)` fetches info for `pid`, then info for `ppid`. For short-lived processes (e.g., shell scripts), the parent may exit between the two calls, causing `parentStats` to be null and missing the stray shell detection.
- **Severity**: Medium (Reliability)

### 2.3 `BehavioralAnalyzer` Entropy Heuristic
- **Location**: `src/orchestrator/domain/analysis/behavioral_analyzer.ts`
- **Issue**: `currentEntropy = Math.min(variance / 1000, 1)`. The divisor `1000` is an arbitrary constant. Human-generated traffic with low variance (e.g., a user clicking a refresh button at steady intervals) could be easily misclassified as a bot.
- **Severity**: Medium (Detection Accuracy)

---

## 3. Mesh & Orchestration

### 3.2 `MeshManager` Unbounded Gossip Concurrency
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: `broadcast()` creates an array of promises for all verified nodes. While staggered with a 100ms jitter, it doesn't limit the number of *concurrent* outgoing HTTPS requests. In a large mesh (100+ nodes), a single lockdown event could trigger a spike that exceeds the Deno/OS file descriptor or socket limit.
- **Severity**: Medium (Scalability)

### 3.3 `MeshManager` mDNS Packet Size Assumptions
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: The `listenForDiscovery` loop assumes announcements are small and don't require fragmentation handling. If an attacker sends a jumbo UDP frame to port 5353, it might cause issues depending on the network stack.
- **Severity**: Low (Robustness)

---

## 4. Reliability & Resource Management

### 4.1 `HoneypotService` Port Morphing Race
- **Location**: `src/orchestrator/domain/protection/honeypot_service.ts`
- **Issue**: In `morph()`, if `ss` check passes but another service binds to the port *immediately* after the check and before `firewall.allowPort`, the sidecar will fail to bind but the firewall will remain open for that port.
- **Severity**: Low (Race Condition)

### 4.2 `MetricsService` Initial Verification Blocking
- **Location**: `src/orchestrator/domain/analysis/metrics_service.ts`
- **Issue**: `await this.auditService.verifyFullChain()` is called during `start()`. If the audit ledger is massive (10k+ entries), the metrics collection loop is delayed for seconds or minutes until the verification completes.
- **Severity**: Medium (Responsiveness)

### 4.3 `AuditService` Checkpoint Hash Ambiguity
- **Location**: `src/orchestrator/domain/analysis/audit.ts`
- **Issue**: `purgeExpired()` uses `boundaryEvent.hash` as the hash for the new `CHECKPOINT` event. This creates two different events in the database with the same hash if the boundary event isn't properly deleted, or potentially confuses chain-head restoration logic which relies on hash lookups.
- **Severity**: High (Data Integrity)

### 4.4 `watchfile` Sidecar Path Spoofing
- **Location**: `src/agents/watchfile/src/main.rs`
- **Issue**: `verify_actor_hash` checks if the executable path `contains("/var/lib/cts/bin/")`. A non-privileged user could create a directory tree like `/home/user/var/lib/cts/bin/` and run an arbitrary binary from there to impersonate a trusted agent.
- **Severity**: High (Security Bypass)

### 4.5 `SidecarManager` Hardcoded Capabilities
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `getCapabilities()` uses a hardcoded mapping. If new sidecars are added to the system or `SIDECAR_REGISTRY` without updating this private method, they will default to no capabilities in production mode, leading to silent failures or functional regressions.
- **Severity**: Medium (Maintainability)

### 4.6 `ProcessTracker` Unbounded Tree Growth
- **Location**: `src/orchestrator/domain/analysis/process_tracker.ts`
- **Issue**: The `tree` Map stores process nodes indefinitely. While a `cleanup()` method exists to remove dead PIDs, it is not automatically called by any background worker or lifecycle event in the current implementation. On long-running systems, this will lead to a slow memory leak.
- **Severity**: Medium (Memory Leak)

### 4.7 `trustroot` Sidecar Mock Signing
- **Location**: `src/agents/trustroot/src/main.rs`
- **Issue**: `issue_node_cert_task` generates a self-signed certificate for the node instead of signing it with the provided CA key. The function contains a TODO/Note stating it's not implemented. This breaks the mTLS chain-of-trust in real deployments.
- **Severity**: Critical (Broken Security Logic)

### 4.8 `decoy` Sidecar Sabotage List Leak
- **Location**: `src/agents/decoy/src/main.rs`
- **Issue**: The `sabotage_ips` vector in `ListenerState` is never cleared. IPs added via the `Sabotage` command remain in memory until the sidecar is restarted, even if the attacker has long disconnected.
- **Severity**: Medium (Resource Leak)

### 4.9 `ProvisioningService` MITM Vulnerability
- **Location**: `src/orchestrator/domain/orchestration/provisioning_service.ts`
- **Issue**: `StrictHostKeyChecking=no` is used in all `scp` and `ssh` commands. This allows an attacker to perform a Man-In-The-Middle (MITM) attack during autonomous mesh expansion, potentially intercepting the `API_TOKEN` and `MESH_SECRET`.
- **Severity**: High (Security)

### 4.10 `ProvisioningService` Secret Exposure in Process List
- **Location**: `src/orchestrator/domain/orchestration/provisioning_service.ts`
- **Issue**: `env $(cat /etc/cts.env | xargs)` is used to start the orchestrator. Depending on the shell implementation on the target, this can cause secrets to be visible in the process environment or command line arguments (e.g. via `/proc/[pid]/cmdline`), exposing them to other users on the system.
- **Severity**: Medium (Information Leakage)

### 4.11 `MeshManager` Active Subnet Probe Rate
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: `discoverSubnet` uses a fixed `MAX_CONCURRENCY` of 10. While jittered, this can still be noisy on enterprise networks, triggering legacy IDS alerts. It also doesn't scale well for machines with multiple high-density subnets.
- **Severity**: Low (Operational Stealth)

### 4.12 `ForensicService` OOM Risk on Large Binaries
- **Location**: `src/orchestrator/domain/analysis/forensic_service.ts`
- **Issue**: `calculateProcessHash` uses `Deno.readFile(exePath)` to read the entire executable into memory before hashing. For large binaries (e.g., multi-GB database engines or fat binaries), this can trigger an Out-of-Memory (OOM) kill of the orchestrator.
- **Severity**: High (Availability)

### 4.13 `CanaryService` Cross-Filesystem Link Failure
- **Location**: `src/orchestrator/domain/protection/canary_service.ts`
- **Issue**: `Deno.link` is used to project bait files from `./volume` to other locations like `/etc` or `/bin`. If `./volume` is on a different partition/mount point than the target, `link` will fail with an `EXDEV` error, causing canary deployment to fail.
- **Severity**: Medium (Functional Reliability)

### 4.14 `SystemExecutor` Permissive PowerShell Policy
- **Location**: `src/orchestrator/infrastructure/system/system_executor.ts`
- **Issue**: The `powershell` command policy allows a wide range of characters including `;`, `$`, `(`, and `)`. While intended for complex commands, it significantly increases the surface area for command injection if an attacker can influence the argument passed to `-Command`.
- **Severity**: High (Security)

### 4.15 `TimelineRepository` Expensive Counter Fallback
- **Location**: `src/orchestrator/infrastructure/persistence/repositories/timeline_repository.ts`
- **Issue**: The `count()` method fallbacks to an O(N) full-list iteration if the cached counter is missing. For large audit ledgers, this will cause the entire orchestrator to hang for a significant duration during the next count operation.
- **Severity**: Medium (Performance)

### 4.16 `AnonymizationService` Fixed IP Pool
- **Location**: `src/orchestrator/domain/protection/anonymization_service.ts`
- **Issue**: The `nodePool` is hardcoded with static IPs. If these nodes go offline or change their configuration, identity rotation will fail. The system lacks a dynamic provider (e.g. fetching fresh VPNGate CSVs).
- **Severity**: Medium (Functional Reliability)

### 4.17 `IntegrityService` Destructive Exit
- **Location**: `src/orchestrator/domain/analysis/integrity_service.ts`
- **Issue**: `initiateSelfDestruct()` deletes `.env` and `./volume/pki`. If this is a false positive (e.g. transient network isolation during a scheduled scan), the system is unrecoverable without manual re-provisioning. The criteria (isolated + 5 threats) might be too sensitive.
- **Severity**: High (Availability)

### 4.18 `NewsSignalService` Unbounded XML Regex
- **Location**: `src/orchestrator/domain/analysis/news_signal_service.ts`
- **Issue**: `xml.match(/<(item|entry)>([\s\S]*?)<\/(item|entry)>/g)` can be subject to catastrophic backtracking or memory exhaustion if an attacker controls an RSS feed and provides a deeply nested or extremely large XML payload.
- **Severity**: Medium (Reliability / DoS)

### 4.19 `HealthService` Mock Resource Audit
- **Location**: `src/orchestrator/domain/analysis/health_service.ts`
- **Issue**: `auditAgentResources` uses hardcoded mock usage values `{ cpu: 0.1, rss: 1024 * 1024 }`. This prevents the system from actually detecting resource-based anomalies or sidecar compromises in production.
- **Severity**: Medium (Monitoring Gap)

### 4.20 `analyzer` Sidecar Missing Scheduled Command
- **Location**: `src/orchestrator/domain/analysis/lifecycle_service.ts` and `src/agents/analyzer/src/main.rs`
- **Issue**: `LifecycleService` attempts to execute a task `ATTEST_KERNEL` on the `analyzer` agent every 5 minutes. However, the `analyzer` Rust code does not implement or recognize this command in its `ScannerCommand` enum or match block. The command will fail to parse and be ignored.
- **Severity**: Medium (Functional Regression)

### 4.21 `MeshManager` Unhandled Gossip Types
- **Location**: `src/orchestrator/interface/web/routes/api.tsx` (Mesh Sync handler)
- **Issue**: The mesh synchronization endpoint (`/api/mesh/sync`) only implements handlers for `GOSSIP_BLOCK` and `GOSSIP_THREAT_HASH`. Other gossip types sent by `MeshManager`, such as `GOSSIP_AUDIT_VERIFY`, `GOSSIP_LOCKDOWN`, and `GOSSIP_AUDIT`, are received but silently ignored. This prevents mesh-wide ledger verification and emergency propagation from working as designed.
- **Severity**: High (Broken Distributed Logic)

### 4.22 `EventMediator` Manual Scan Invisibility
- **Location**: `src/orchestrator/domain/analysis/event_mediator.ts` and `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `EventMediator` only listens for *events* (messages without an `id` field) from the `analyzer` sidecar. Manual scans initiated by the user or API (e.g. `ScanPath`) provide a correlation `id`, meaning their responses are intercepted by `SidecarManager`'s promise resolver and never reach the `EventMediator` handlers. Autonomous defense (Autopilot) will never react to threats found during manual scans.
- **Severity**: High (Security Visibility Gap)

### 4.23 `ChaosEngine` Event Storm
- **Location**: `src/orchestrator/domain/orchestration/chaos_engine.ts`
- **Issue**: `simulateBruteForce` emits 6 `PortAccess` events in rapid succession (200ms interval). This triggers 6 parallel PCAP captures and 6 duplicate audit entries in the `PlaybookService` / `EventMediator`, potentially causing I/O thrashing and ledger bloat during a simulation.
- **Severity**: Low (Performance / Noise)

### 4.24 `GovernanceService` Missing Proposal Expiration
- **Location**: `src/orchestrator/domain/orchestration/governance_service.ts`
- **Issue**: Proposals are stored in the `proposals` map indefinitely. If a proposal fails to reach quorum (e.g. nodes go offline), it remains in memory forever. There is no mechanism to expire old proposals or cleanup the map, leading to a memory leak in high-churn environments.
- **Severity**: Medium (Memory Leak)

### 4.25 `CanaryService` Blind Deployment
- **Location**: `src/orchestrator/domain/protection/canary_service.ts`
- **Issue**: `deploySingle` checks for file existence using `Deno.stat` and returns early if a file exists. It does not verify if the existing file is actually the intended canary. If a legitimate user file happens to have the same name as a bait file, the canary deployment is silently skipped for that path, leaving a gap in deception coverage.
- **Severity**: Low (Deception Reliability)

### 4.26 `PlaybookEngine` Fragile String Matching
- **Location**: `src/orchestrator/domain/orchestration/playbook_engine.ts`
- **Issue**: Remediation triggers rely on `.includes()` checks on event messages (e.g. `"SSH Brute Force"`, `"Reverse Shell"`). This is extremely fragile; if the sidecar's logging format changes or the message is localized, the automated defense will fail silently.
- **Severity**: High (Logic Reliability)

### 4.21 `AutonomousResponseEngine` Orphaned Remediations
- **Location**: `src/orchestrator/domain/orchestration/autonomous_response.ts`
- **Issue**: The `BLOCK` tier uses a 5-second `setTimeout` between quarantine and kill. If the orchestrator service restarts or crashes during this window, the malicious process remains in a SIGSTOP state indefinitely (orphaned), never being fully terminated.
- **Severity**: Medium (Reliability)

### 4.22 `validation.ts` Unbounded Decoding Loop
- **Location**: `src/orchestrator/infrastructure/system/validation.ts`
- **Issue**: `validatePath` uses a `do...while` loop to repeatedly `decodeURIComponent`. A malicious path with hundreds of levels of URL encoding (e.g. `%252525...`) could cause significant CPU spikes or execution timeouts in the orchestrator's main thread.
- **Severity**: Medium (DoS / Performance)

### 4.23 `MorphingService` Inconsistent State on Partial Failure
- **Location**: `src/orchestrator/domain/protection/morphing_service.ts`
- **Issue**: `executeMorph()` catches errors for honeypot and canary morphing independently. If one fails (e.g. a sidecar timeout), the system's "footprint" becomes inconsistent, with some lures rotated and others static, potentially alerting a sophisticated adversary.
- **Severity**: Low (OpSec Consistency)

### 5. Frontend & UI Gaps

### 5.1 `LogsPage` Reference Error
- **Location**: `src/orchestrator/interface/web/features/forensic/audit/logs.tsx`
- **Issue**: `LogsPage` attempts to access `props.csrfToken` and `props.nonce` but the component function does not define any parameters. This will cause a `ReferenceError` when the page is rendered.
- **Severity**: High (UI Crash)

### 5.2 `ComplianceService` Hardcoded Hardware Signature
- **Location**: `src/orchestrator/domain/analysis/compliance_service.ts`
- **Issue**: `exportSignedBundle` returns a hardcoded mock signature `"HW_SIGNED_MOCK_SIGNATURE"`. This provides zero cryptographic assurance to auditors, despite the system having access to a real TPM via `trustroot`.
- **Severity**: High (Compliance Gap)

### 5.3 `getPlatformInfo` Disk Metrics Missing
- **Location**: `src/orchestrator/infrastructure/system/platform.ts`
- **Issue**: `getMetrics` hardcodes disk usage to `{ total: 0, free: 0, used: 0 }`. This prevents the dashboard from showing storage warnings, which is critical for forensic captures and log retention.
- **Severity**: Low (Monitoring Gap)

### 5.8 `DiagnosticRepository` Double Counter Increment
- **Location**: `src/orchestrator/infrastructure/persistence/diagnostic_repository.ts`
- **Issue**: `addLog` calls `kv.set` which internally uses `TimelineRepository.set`. `TimelineRepository.set` already increments the counter. `addLog` then performs its own `kv.atomic().mutate(...)` to increment the same counter again. This leads to the log count being double the actual number of entries.
- **Severity**: Low (UI Inaccuracy)

### 5.9 `SupplyChainService` Brittle TOML Parsing
- **Location**: `src/orchestrator/domain/analysis/supply_chain.ts`
- **Issue**: The service parses `Cargo.toml` using simple string split/includes logic. This will fail or produce incorrect results for complex TOML structures like multi-line dependencies, inline tables, or workspace inheritance.
- **Severity**: Medium (Functional Reliability)

### 5.10 `reports.ts` Memory Pressure on Download
- **Location**: `src/orchestrator/interface/web/api/reports.ts`
- **Issue**: `/forensics/download/:name` uses `Deno.readFile(filePath)` to read the entire artifact (e.g. a 500MB PCAP) into memory before sending it. This can cause OOM on systems with many concurrent downloads or large forensic captures.
- **Severity**: High (Availability)

### 5.11 `stats.ts` Listener Leak
- **Location**: `src/orchestrator/interface/web/api/stats.ts`
- **Issue**: `eventBus.on("decoy", ...)` is called during API initialization, but the returned unsubscribe function is never stored or called. Every time the API router is re-initialized (if it happens during Hono reload or testing), a new duplicate listener is added to the singleton `EventBus`.
- **Severity**: Low (Memory Leak)

### 5.12 `threats.ts` Unbounded Query Limit
- **Location**: `src/orchestrator/interface/web/api/threats.ts`
- **Issue**: The `limit` parameter for `/identified` is parsed from user input but never validated against a maximum value. An attacker could provide a very large limit to force the system into performing a heavy KV scan and returning a massive JSON response, leading to DoS.
- **Severity**: Medium (DoS)

### 6. Architecture & Platform

### 6.1 `sentinel` Architecture-Dependent Syscall IDs
- **Location**: `src/agents/sentinel/src/main.rs`
- **Issue**: Syscall IDs (e.g. 101 for `ptrace`, 59 for `execve`) are hardcoded for x86_64. On AArch64 (ARM), these IDs are completely different (e.g. `ptrace` is 117, `execve` is 221). The agent will report incorrect syscalls or fail to detect critical events on ARM systems.
- **Severity**: High (Functional Reliability / Security)

### 6.2 `BaselineService` Fragile `ss` Parsing
- **Location**: `src/orchestrator/domain/analysis/baseline.ts`
- **Issue**: Parsing `ss -tuln` output by splitting whitespace and taking index 4 is fragile. Column alignment in `ss` can change based on the length of IP addresses or the presence of IPv6 brackets, leading to incorrect port/address extraction.
- **Severity**: Medium (Reliability)

### 6.3 `CovertChannelService` ICMP Payload Limits
- **Location**: `src/orchestrator/domain/orchestration/covert_service.ts`
- **Issue**: `broadcastViaICMP` sends data as hex via `ping -p`. Most versions of `ping` limit the pattern size to 16 bytes. Attempting to send longer mesh alerts or heartbeats will result in truncation or command failure.
- **Severity**: Low (Functional Limitation)

### 6.4 `RealDiscovery` Parallel Ping Flood
- **Location**: `src/orchestrator/domain/analysis/real_discovery.ts`
- **Issue**: `performIPv4Sweep` uses `Promise.allSettled` on batches of 32 pings with no delay between batches. On systems with many network interfaces or large subnets, this can trigger "Too many open files" errors or temporarily saturate the local network stack, leading to packet loss in legitimate traffic.
- **Severity**: Medium (Reliability / Performance)

### 6.5 `TacticalIntelIngestor` Duplicate Block Logic
- **Location**: `src/orchestrator/domain/analysis/tactical_intel_ingestor.ts`
- **Issue**: The system has both `CuratedIntelService` and `TacticalIntelIngestor` which both attempt to fetch from similar sources (e.g. Abuse.ch, EmergingThreats) and both call `firewall.blockIp`. This leads to redundant work, duplicate KV entries under different prefixes (`curated_threats` vs `threats`), and race conditions in firewall rule management.
- **Severity**: Medium (Architectural Debt)

### 6.6 `BaselineService` Inconsistent ss Output Mapping
- **Location**: `src/orchestrator/domain/analysis/baseline.ts`
- **Issue**: `captureSnapshot` maps `parts[4]` from `ss -tuln` to the local port. In modern versions of `ss`, or when IPv6 is enabled, the columns can shift or include additional data (like interface names or UID/ino), causing the port list to be populated with junk data like `*` or `users:(("deno",pid=123,fd=4))`.
- **Severity**: High (Broken Baseline Logic)

### 6.4 `LedgerService` Out-of-Order Sync
- **Location**: `src/orchestrator/domain/analysis/ledger_service.ts`
- **Issue**: `syncEntry` blindly pushes received entries to the local chain without verifying that `entry.prevHash` matches the current `lastHash`. This can result in a fragmented or corrupted audit chain if mesh nodes are out of sync or gossip is delayed.
- **Severity**: High (Data Integrity)

### 6.5 `PluginManager` Blocking Lifecycle
- **Location**: `src/orchestrator/domain/orchestration/plugin_manager.ts`
- **Issue**: `startAll` and `stopAll` iterate through plugins sequentially using `await`. If a single plugin hangs in its `start()` or `stop()` method, the entire orchestrator boot or shutdown sequence will stall indefinitely.
- **Severity**: Medium (Reliability)

### 6.6 `NetworkDiscoveryService` Overlapping Scans
- **Location**: `src/orchestrator/domain/analysis/network_discovery.ts`
- **Issue**: The 20-second `setInterval` for `scan()` does not check if a previous scan is still active. In high-latency environments (e.g. slow ARP responses or RealDiscovery timeouts), multiple scan tasks will overlap, potentially causing resource contention or duplicate device entries.
- **Severity**: Low (Performance)

### 7. Sidecar Specifics

### 7.1 `netcap` Zombie Capture Handle
- **Location**: `src/agents/netcap/src/main.rs`
- **Issue**: `StartCapture` rejects new requests if `capture_handle.is_some()`. It does not check if the internal task is still alive. If the capture thread panics or finishes, the handle remains "full," and subsequent captures are blocked until `StopCapture` is manually invoked.
- **Severity**: Medium (Reliability)

### 7.2 `decoy` Unbounded Connection Spawning
- **Location**: `src/agents/decoy/src/main.rs`
- **Issue**: `start_port_listener` spawns a new tokio task for every accepted TCP connection without any global or per-port concurrency limits. An attacker can easily perform a resource exhaustion DoS by flooding honeyports with connections.
- **Severity**: High (DoS)

### 8. Persistence & Config

### 8.1 `FirewallManager` Unbounded Rule Hydration
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/firewall.ts`
- **Issue**: `setKv` performs a full list operation on the `enforcement` prefix. If the system has accumulated thousands of manual or autonomous blocks over time, this will significantly delay orchestrator startup and consume excessive memory during hydration.
- **Severity**: Medium (Performance / Availability)

### 8.2 `ConfigSchema` Permissive Defaults
- **Location**: `src/orchestrator/core/config_schema.ts`
- **Issue**: `ALLOWED_ORIGINS` defaults to `*`. While convenient for development, it is highly dangerous for a security orchestrator in production, as it allows any website to attempt CSRF or WebSocket hijacking if other protections fail.
- **Severity**: Medium (Security Posture)

### 8.3 `TimelineRepository` Batch Size Inefficiency
- **Location**: `src/orchestrator/infrastructure/persistence/repositories/timeline_repository.ts`
- **Issue**: `deleteBefore` uses a fixed batch size of 10 for atomic mutations. For large retention purges (e.g. deleting 10,000 expired logs), this results in 1,000 separate KV commits, which is highly inefficient and creates significant I/O pressure on Deno KV.
- **Severity**: Low (Performance)

### 8.10 `AutonomousAutopilotService` Unbounded Capture Requests
- **Location**: `src/orchestrator/domain/analysis/autonomous_autopilot_service.ts`
- **Issue**: `executeContainment` sends a `StartCapture` command to the `netcap` agent for every confirmed breach. Since the `netcap` agent (Rust) rejects new capture requests if one is already active, subsequent breaches will fail to record forensic evidence if a previous capture hasn't timed out or been stopped.
- **Severity**: Medium (Forensic Gap)

### 8.11 `SidecarManager` Untracked Backoff Timers
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `handleSidecarExit` uses `setTimeout` for exponential backoff but does not store the timer IDs. During `shutdown()`, these pending restart tasks are not cancelled, leading to sidecars potentially being respawned *after* the orchestrator has supposedly stopped.
- **Severity**: Low (Reliability)

### 8.4 `AuditService` Leaking Intervals
- **Location**: `src/orchestrator/domain/analysis/audit.ts`
- **Issue**: `AuditService` initializes three background intervals for maintenance, verification, and mesh broadcasting, but lacks a `shutdown()` or `stop()` method to clear them. This causes resource leaks during tests and prevents clean orchestrator shutdowns.
- **Severity**: Medium (Reliability / Test Stability)

### 8.5 `TPMManager` Colliding Secret Indices
- **Location**: `src/orchestrator/infrastructure/system/protection/tpm/tpm_manager.ts`
- **Issue**: `sealSecret` and `unsealSecret` hardcode the NVRAM index to `0x1500001` regardless of the `secretName`. Storing multiple different secrets (e.g. `MESH_SECRET` and `PKI_SECRET`) will result in them overwriting each other in the TPM.
- **Severity**: High (Broken Functional Logic)

### 8.6 `LedgerService` Unverified Sync
- **Location**: `src/orchestrator/domain/analysis/ledger_service.ts`
- **Issue**: `syncEntry` blindly accepts and pushes ledger entries from the mesh without verifying their cryptographic signatures or recalculating the hash to ensure the data hasn't been tampered with during transit.
- **Severity**: High (Security / Integrity)

### 8.7 `UbuntuFirewallProvider` PID Injection
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/providers/ubuntu_firewall.ts`
- **Issue**: `killProcess` and `quarantineProcess` use `executor.execute("kill", ["-9", pid.toString()])`. While `pid` is a number in TypeScript, if the `executor` or underlying `Deno.Command` allows shell expansion (which it shouldn't if configured correctly, but `isPotentiallyDangerous` check is key), there's a risk. More importantly, there's no check that the `pid` isn't a critical system process (e.g. PID 1 or the orchestrator itself) before execution in this provider.
- **Severity**: Medium (Availability / Reliability)

### 8.8 `MacosFirewallProvider` / `WindowsFirewallProvider` Cross-Agent Dependency
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/providers/*.ts`
- **Issue**: Both providers attempt to send `KillProcess` and `QuarantineProcess` commands to the `enforcer` agent. However, `SovereignApp.startDaemons` only starts the platform-specific enforcer (e.g. `enforcer-win`). The standard `enforcer` daemon is only started on Linux. This will cause runtime errors on macOS and Windows when trying to remediate processes.
- **Severity**: High (Functional Regression)

### 8.9 `Layout.tsx` Missing Content Security Policy
- **Location**: `src/orchestrator/interface/web/components/Layout.tsx`
- **Issue**: The `Layout` component defines a `<meta name="csrf-token">` but does not include the `Content-Security-Policy` meta tag or apply the `nonce` to all script tags (some are hardcoded). While the `SecurityMiddleware` sets CSP headers, having mismatched or missing CSP in the meta tag can lead to inconsistent browser behavior.
- **Severity**: Low (Security Posture)

### 9. Infrastructure & Core Framework

### 9.1 `initializeApplication` Sequential Bottleneck
- **Location**: `src/orchestrator/core/application.ts`
- **Issue**: `bootstrap()`, `getPlatformInfo()`, and `pluginRegistry.startAll()` are executed sequentially. If any step is slow (e.g. slow DNS resolution during bootstrap or plugin timeouts), the orchestrator boot time increases linearly, delaying security enforcement.
- **Severity**: Medium (Availability)

### 9.2 `KvStore` Missing Close in Many Services
- **Location**: `src/orchestrator/infrastructure/persistence/kv_store.ts`
- **Issue**: While `KvStore` has a `close()` method, many domain services and controllers that use KV do not explicitly close their connections during shutdown or teardown, potentially leading to persistent handle leaks or database locks.
- **Severity**: Medium (Reliability)

### 9.3 `Application` Brittle Forensic Subscriber
- **Location**: `src/orchestrator/core/application.ts`
- **Issue**: The event subscriber for `CRITICAL` events starts a PCAP capture but does not track if a capture is already active or handle overlapping alerts. Multiple critical events in rapid succession will trigger multiple failed capture attempts and log spam.
- **Severity**: Low (Noise)

### 10. Service Lifecycle & Maintenance

### 10.1 `SovereignApp` Shadow Mode Leak
- **Location**: `src/orchestrator/app/sovereign_app.ts`
- **Issue**: `startShadowModeTimer` uses a `setTimeout` to disable shadow mode after 24 hours. The timer ID is not stored, meaning it cannot be cleared if the orchestrator is shut down or restarted, leading to a zombie timer in long-running processes (or tests).
- **Severity**: Low (Resource Leak)

### 10.2 `SidecarManager` Rotation Loop Leak
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `startRotationLoop` uses `setInterval` but does not provide a way to clear it. During graceful shutdown, this interval continues to run in the background until the process exits.
- **Severity**: Low (Reliability)

### 10.3 `EventMediator` Type Safety Gap
- **Location**: `src/orchestrator/domain/analysis/event_mediator.ts`
- **Issue**: `wireSidecars` accepts `commandPort: any`. This bypasses TypeScript's compile-time checks for the `CommandPort` interface, potentially leading to runtime errors if the interface changes but the mediator isn't updated.
- **Severity**: Low (Maintainability)

### 11. Plugins & Platform Extensibility

### 11.1 `UbuntuVpnProvider` Inconsistent Method Signature
- **Location**: `src/orchestrator/infrastructure/system/protection/vpn/providers/ubuntu_vpn.ts`
- **Issue**: `isConnected` defines a default `interfaceName = "wg0"`, but the `VpnProvider` interface (in `vpn.ts`) defines it with no parameters. Depending on how the provider is called (e.g. via the base interface), the `interfaceName` may be undefined, and the check `res.data?.active_interfaces?.includes(interfaceName)` will return false even if connected.
- **Severity**: Medium (Reliability)

### 11.2 `createPluginsForPlatform` Fallback Shadowing
- **Location**: `src/orchestrator/domain/orchestration/plugins/plugin_catalog.ts`
- **Issue**: If a tag is not found and its family is not recognized, it falls back to *all* plugins (`matches = pluginCatalog`). If some of these plugins have support tags that conflict with the unknown environment, they may crash or behave unpredictably rather than failing gracefully.
- **Severity**: Low (Stability)

### 11.3 `plugin_manager.ts` Silent Start Failures
- **Location**: `src/orchestrator/domain/orchestration/plugin_manager.ts`
- **Issue**: `startAll` catches errors and logs them, but it doesn't update the plugin's status or notify the health service. A plugin could fail its `start()` but still appear as `ACTIVE` in `listPlugins()` if its `status()` method isn't aware of the startup failure.
- **Severity**: Medium (Observability)

### 5.4 `Dashboard` Misaligned Stat Calculation
- **Location**: `src/orchestrator/interface/web/features/situational/dashboard/page.tsx`
- **Issue**: "Intervention Force" and "Strike State" use hardcoded math `(props.status.audit?.integrityScore || 100) * 0.8 + 10`. This is purely aesthetic and doesn't reflect any actual system capability or readiness state, potentially misleading operators.
- **Severity**: Low (UI Accuracy)

### 5.5 `SovereignApp` Unhandled Command Rejection
- **Location**: `src/orchestrator/app/sovereign_app.ts` (startDaemons)
- **Issue**: `daemons.forEach(s => sm.getPersistentSidecar(s).catch(() => {}))` and subsequent `sentinel` commands ignore all errors. If a sidecar fails to start or a critical config command (like `HIDE_PID`) fails, the orchestrator continues booting as if nothing is wrong, leading to a "ghost" operational state where security is compromised but the dashboard says active.
- **Severity**: Medium (Silent Failure)

### 5.6 `IncidentService` Unreliable Count
- **Location**: `src/orchestrator/domain/analysis/incident_service.ts`
- **Issue**: The service lacks a `count()` method, meaning the dashboard cannot easily show the total number of incidents without fetching the entire list, which is inefficient and not implemented.
- **Severity**: Low (UI Gap)

### 5.7 `ui.tsx` Missing Prop Propagation
- **Location**: `src/orchestrator/interface/web/routes/ui.tsx`
- **Issue**: Most routes (e.g. `/forensics`, `/compliance`) fetch `userRole` via `c.get("user")?.role`, but the `SecurityMiddleware.auth` sets the role using `c.set("role", ...)`. This mismatch causes `userRole` to be undefined in the props passed to the pages, breaking RBAC-based UI rendering.
- **Severity**: High (UI Feature Regression)
