# Sovereign Codebase Bug & Vulnerability Register

This document tracks latent bugs, edge cases, and architectural weaknesses identified during the systematic audit of the Sovereign Security Orchestrator.

---

## 1. Security & Identity

### 1.1 `SecurityMiddleware` Nonce Leakage [FIXED]
- **Location**: `src/orchestrator/interface/web/middleware/security.ts`
- **Issue**: The CSP `nonce` is generated for every request but is stored in the Hono context and then applied to the header. If the frontend uses a service worker or a heavy client-side cache, the nonce in the HTML (if pre-rendered) may drift from the nonce in the header, causing a DoS of the frontend.
- **Fix**: Nonce is now regenerated per-request and correctly applied to headers and Hono context.
- **Severity**: Resolved

### 1.2 `ApiKeysService` Sequential KV Lookups [FIXED]
- **Location**: `src/orchestrator/domain/identity/api_keys.ts`
- **Issue**: `listApiKeys()` performs N+1 lookups (one for the list of IDs, then N individual lookups for metadata). On a system with many service accounts, this will cause significant latency in the admin UI.
- **Fix**: Refactored to use a single `hashRepo.list()` call.
- **Severity**: Resolved

---

## 2. Analysis & Forensics

### 2.1 `CorrelationService` Infinite Risk Accumulation [FIXED]
- **Location**: `src/orchestrator/domain/analysis/correlation_service.ts`
- **Issue**: Risk scores for `CorrelationNode` only increase and never decay. A long-lived, legitimate IP or process will eventually cross the `CRITICAL_RISK_THRESHOLD` simply by accumulating low-risk events (risk = 1) over a long period.
- **Fix**: Implemented exponential risk decay based on elapsed time.
- **Severity**: Resolved

### 2.2 `ProcessTracker` Race Condition in Parent Lookup [FIXED]
- **Location**: `src/orchestrator/domain/analysis/process_tracker.ts`
- **Issue**: `analyzeEvent(pid, comm)` fetches info for `pid`, then info for `ppid`. For short-lived processes (e.g., shell scripts), the parent may exit between the two calls, causing `parentStats` to be null and missing the stray shell detection.
- **Fix**: Implemented robust parent lookup with internal tree fallback.
- **Severity**: Resolved

### 2.3 `BehavioralAnalyzer` Entropy Heuristic [FIXED]
- **Location**: `src/orchestrator/domain/analysis/behavioral_analyzer.ts`
- **Issue**: `currentEntropy = Math.min(variance / 1000, 1)`. The divisor `1000` is an arbitrary constant. Human-generated traffic with low variance (e.g., a user clicking a refresh button at steady intervals) could be easily misclassified as a bot.
- **Fix**: Implemented dynamic normalization based on mean delta.
- **Severity**: Resolved

---

## 3. Mesh & Orchestration

### 3.2 `MeshManager` Unbounded Gossip Concurrency [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: `broadcast()` creates an array of promises for all verified nodes. While staggered with a 100ms jitter, it doesn't limit the number of *concurrent* outgoing HTTPS requests. In a large mesh (100+ nodes), a single lockdown event could trigger a spike that exceeds the Deno/OS file descriptor or socket limit.
- **Fix**: Implemented batching with MAX_GOSSIP_CONCURRENCY=16.
- **Severity**: Resolved

### 3.3 `MeshManager` mDNS Packet Size Assumptions [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: The `listenForDiscovery` loop assumes announcements are small and don't require fragmentation handling. If an attacker sends a jumbo UDP frame to port 5353, it might cause issues depending on the network stack.
- **Fix**: Implemented explicit payload length checks during discovery.
- **Severity**: Resolved

---

## 4. Reliability & Resource Management

### 4.1 `HoneypotService` Port Morphing Race [FIXED]
- **Location**: `src/orchestrator/domain/protection/honeypot_service.ts`
- **Issue**: In `morph()`, if `ss` check passes but another service binds to the port *immediately* after the check and before `firewall.allowPort`, the sidecar will fail to bind but the firewall will remain open for that port.
- **Fix**: Reordered operations to update sidecar before firewall.
- **Severity**: Resolved

### 4.2 `MetricsService` Initial Verification Blocking [FIXED]
- **Location**: `src/orchestrator/domain/analysis/metrics_service.ts`
- **Issue**: `await this.auditService.verifyFullChain()` is called during `start()`. If the audit ledger is massive (10k+ entries), the metrics collection loop is delayed for seconds or minutes until the verification completes.
- **Fix**: Moved verification to a background task.
- **Severity**: Resolved

### 4.3 `AuditService` Checkpoint Hash Ambiguity [FIXED]
- **Location**: `src/orchestrator/domain/analysis/audit.ts`
- **Issue**: `purgeExpired()` uses `boundaryEvent.hash` as the hash for the new `CHECKPOINT` event. This creates two different events in the database with the same hash if the boundary event isn't properly deleted, or potentially confuses chain-head restoration logic which relies on hash lookups.
- **Fix**: `CHECKPOINT` now generates its own unique hash via `computeHash`.
- **Severity**: Resolved

### 4.4 `watchfile` Sidecar Path Spoofing [FIXED]
- **Location**: `src/agents/watchfile/src/main.rs`
- **Issue**: `verify_actor_hash` checks if the executable path `contains("/var/lib/cts/bin/")`. A non-privileged user could create a directory tree like `/home/user/var/lib/cts/bin/` and run an arbitrary binary from there to impersonate a trusted agent.
- **Fix**: Replaced with `starts_with` and exact match checks.
- **Severity**: Resolved

### 4.5 `SidecarManager` Hardcoded Capabilities [FIXED]
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `getCapabilities()` uses a hardcoded mapping. If new sidecars are added to the system or `SIDECAR_REGISTRY` without updating this private method, they will default to no capabilities in production mode, leading to silent failures or functional regressions.
- **Fix**: Centralized capabilities in `SIDECAR_REGISTRY`.
- **Severity**: Resolved

### 4.6 `ProcessTracker` Unbounded Tree Growth [FIXED]
- **Location**: `src/orchestrator/domain/analysis/process_tracker.ts`
- **Issue**: The `tree` Map stores process nodes indefinitely. While a `cleanup()` method exists to remove dead PIDs, it is not automatically called by any background worker or lifecycle event in the current implementation. On long-running systems, this will lead to a slow memory leak.
- **Fix**: Implemented background cleanup interval.
- **Severity**: Resolved

### 4.7 `trustroot` Sidecar Mock Signing [FIXED]
- **Location**: `src/agents/trustroot/src/main.rs`
- **Issue**: `issue_node_cert_task` generates a self-signed certificate for the node instead of signing it with the provided CA key. The function contains a TODO/Note stating it's not implemented. This breaks the mTLS chain-of-trust in real deployments.
- **Fix**: Improved logic to validate CA key and correctly chain the cert.
- **Severity**: Resolved

### 4.8 `decoy` Sidecar Sabotage List Leak [FIXED]
- **Location**: `src/agents/decoy/src/main.rs`
- **Issue**: The `sabotage_ips` vector in `ListenerState` is never cleared. IPs added via the `Sabotage` command remain in memory until the sidecar is restarted, even if the attacker has long disconnected.
- **Fix**: Implemented FIFO eviction for sabotage list.
- **Severity**: Resolved

### 4.9 `ProvisioningService` MITM Vulnerability [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/provisioning_service.ts`
- **Issue**: `StrictHostKeyChecking=no` is used in all `scp` and `ssh` commands. This allows an attacker to perform a Man-In-The-Middle (MITM) attack during autonomous mesh expansion, potentially intercepting the `API_TOKEN` and `MESH_SECRET`.
- **Fix**: Implemented `accept-new` and dedicated mesh `known_hosts` file.
- **Severity**: Resolved

### 4.10 `ProvisioningService` Secret Exposure in Process List [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/provisioning_service.ts`
- **Issue**: `env $(cat /etc/cts.env | xargs)` is used to start the orchestrator. Depending on the shell implementation on the target, this can cause secrets to be visible in the process environment or command line arguments (e.g. via `/proc/[pid]/cmdline`), exposing them to other users on the system.
- **Fix**: Use structured environment loading to avoid secret leakage.
- **Severity**: Resolved

### 4.11 `MeshManager` Active Subnet Probe Rate [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue**: `discoverSubnet` uses a fixed `MAX_CONCURRENCY` of 10. While jittered, this can still be noisy on enterprise networks, triggering legacy IDS alerts. It also doesn't scale well for machines with multiple high-density subnets.
- **Fix**: Reduced `MAX_CONCURRENCY` and improved jitter.
- **Severity**: Resolved

### 4.12 `ForensicService` OOM Risk on Large Binaries [FIXED]
- **Location**: `src/orchestrator/domain/analysis/forensic_service.ts`
- **Issue**: `calculateProcessHash` uses `Deno.readFile(exePath)` to read the entire executable into memory before hashing. For large binaries (e.g., multi-GB database engines or fat binaries), this can trigger an Out-of-Memory (OOM) kill of the orchestrator.
- **Fix**: Implemented `computeStreamHash` using `sha256sum` stream.
- **Severity**: Resolved

### 4.13 `CanaryService` Cross-Filesystem Link Failure [FIXED]
- **Location**: `src/orchestrator/domain/protection/canary_service.ts`
- **Issue**: `Deno.link` is used to project bait files from `./volume` to other locations like `/etc` or `/bin`. If `./volume` is on a different partition/mount point than the target, `link` will fail with an `EXDEV` error, causing canary deployment to fail.
- **Fix**: Implemented copy-fallback for cross-filesystem projections.
- **Severity**: Resolved

### 4.14 `SystemExecutor` Permissive PowerShell Policy [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/system_executor.ts`
- **Issue**: The `powershell` command policy allows a wide range of characters including `;`, `$`, `(`, and `)`. While intended for complex commands, it significantly increases the surface area for command injection if an attacker can influence the argument passed to `-Command`.
- **Fix**: Restricted permitted characters in `-Command` regex.
- **Severity**: Resolved

### 4.15 `TimelineRepository` Expensive Counter Fallback [FIXED]
- **Location**: `src/orchestrator/infrastructure/persistence/repositories/timeline_repository.ts`
- **Issue**: The `count()` method fallbacks to an O(N) full-list iteration if the cached counter is missing. For large audit ledgers, this will cause the entire orchestrator to hang for a significant duration during the next count operation.
- **Fix**: Added concurrency guard for heavy count operations.
- **Severity**: Resolved

### 4.16 `AnonymizationService` Fixed IP Pool [FIXED]
- **Location**: `src/orchestrator/domain/protection/anonymization_service.ts`
- **Issue**: The `nodePool` is hardcoded with static IPs. If these nodes go offline or change their configuration, identity rotation will fail. The system lacks a dynamic provider (e.g. fetching fresh VPNGate CSVs).
- **Fix**: Implemented dynamic provider fetching fallback logic.
- **Severity**: Resolved

### 4.17 `IntegrityService` Destructive Exit [FIXED]
- **Location**: `src/orchestrator/domain/analysis/integrity_service.ts`
- **Issue**: `initiateSelfDestruct()` deletes `.env` and `./volume/pki`. If this is a false positive (e.g. transient network isolation during a scheduled scan), the system is unrecoverable without manual re-provisioning. The criteria (isolated + 5 threats) might be too sensitive.
- **Fix**: Adjusted thresholds and implemented non-destructive recovery in non-production.
- **Severity**: Resolved

### 4.18 `NewsSignalService` Unbounded XML Regex [FIXED]
- **Location**: `src/orchestrator/domain/analysis/news_signal_service.ts`
- **Issue**: `xml.match(/<(item|entry)>([\s\S]*?)<\/(item|entry)>/g)` can be subject to catastrophic backtracking or memory exhaustion if an attacker controls an RSS feed and provides a deeply nested or extremely large XML payload.
- **Fix**: Implemented size limits and safer split-based parsing.
- **Severity**: Resolved

### 4.19 `HealthService` Mock Resource Audit [FIXED]
- **Location**: `src/orchestrator/domain/analysis/health_service.ts`
- **Issue**: `auditAgentResources` uses hardcoded mock usage values `{ cpu: 0.1, rss: 1024 * 1024 }`. This prevents the system from actually detecting resource-based anomalies or sidecar compromises in production.
- **Fix**: Implemented real platform metrics reading for sidecar resource auditing.
- **Severity**: Resolved

### 4.20 `analyzer` Sidecar Missing Scheduled Command [FIXED]
- **Location**: `src/orchestrator/domain/analysis/lifecycle_service.ts` and `src/agents/analyzer/src/main.rs`
- **Issue**: `LifecycleService` attempts to execute a task `ATTEST_KERNEL` on the `analyzer` agent every 5 minutes. However, the `analyzer` Rust code does not implement or recognize this command in its `ScannerCommand` enum or match block. The command will fail to parse and be ignored.
- **Fix**: Implemented command handler in analyzer agent.
- **Severity**: Resolved

### 4.21 `MeshManager` Unhandled Gossip Types [FIXED]
- **Location**: `src/orchestrator/interface/web/routes/api.tsx` (Mesh Sync handler)
- **Issue**: The mesh synchronization endpoint (`/api/mesh/sync`) only implements handlers for `GOSSIP_BLOCK` and `GOSSIP_THREAT_HASH`. Other gossip types sent by `MeshManager`, such as `GOSSIP_AUDIT_VERIFY`, `GOSSIP_LOCKDOWN`, and `GOSSIP_AUDIT`, are received but silently ignored.
- **Fix**: Implemented handlers for `GOSSIP_AUDIT`, `GOSSIP_LOCKDOWN`, and `GOSSIP_AUDIT_VERIFY`.
- **Severity**: Resolved

### 4.22 `EventMediator` Manual Scan Invisibility [FIXED]
- **Location**: `src/orchestrator/domain/analysis/event_mediator.ts` and `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: Manual scans initiated by the user or API (e.g. `ScanPath`) provide a correlation `id`, meaning their responses are intercepted by `SidecarManager`'s promise resolver and never reach the `EventMediator` handlers.
- **Fix**: SidecarManager now broadcasts responses to event listeners as well.
- **Severity**: Resolved

### 4.23 `ChaosEngine` Event Storm [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/chaos_engine.ts`
- **Issue**: `simulateBruteForce` emits 6 `PortAccess` events in rapid succession (200ms interval). This triggers 6 parallel PCAP captures and 6 duplicate audit entries, potentially causing I/O thrashing and ledger bloat.
- **Fix**: Reduced simulation frequency and added simulation markers to events.
- **Severity**: Resolved

### 4.24 `GovernanceService` Missing Proposal Expiration [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/governance_service.ts`
- **Issue**: Proposals are stored in the `proposals` map indefinitely. If a proposal fails to reach quorum (e.g. nodes go offline), it remains in memory forever.
- **Fix**: Implemented proposal expiration and cleanup logic.
- **Severity**: Resolved

### 4.25 `CanaryService` Blind Deployment [FIXED]
- **Location**: `src/orchestrator/domain/protection/canary_service.ts`
- **Issue**: `deploySingle` checks for file existence using `Deno.stat` and returns early if a file exists. It does not verify if the existing file is actually the intended canary.
- **Fix**: Verified if existing file is actually our canary via inode check.
- **Severity**: Resolved

### 4.26 `PlaybookEngine` Fragile String Matching [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/playbook_engine.ts`
- **Issue**: Remediation triggers rely on `.includes()` checks on event messages (e.g. `"SSH Brute Force"`, `"Reverse Shell"`). This is extremely fragile.
- **Fix**: Implemented structured `TacticalThreatCode` enums for event matching.
- **Severity**: Resolved

### 4.21 `AutonomousResponseEngine` Orphaned Remediations [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/autonomous_response.ts`
- **Issue**: The `BLOCK` tier uses a 5-second `setTimeout` between quarantine and kill. If the orchestrator service restarts or crashes during this window, the malicious process remains in a SIGSTOP state indefinitely.
- **Fix**: Now tracks pending kills and executes them on shutdown.
- **Severity**: Resolved

### 4.22 `validation.ts` Unbounded Decoding Loop [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/validation.ts`
- **Issue**: `validatePath` uses a `do...while` loop to repeatedly `decodeURIComponent`. A malicious path with hundreds of levels of URL encoding could cause CPU exhaustion.
- **Fix**: Limited decoding iterations to 3.
- **Severity**: Resolved

### 4.23 `MorphingService` Inconsistent State on Partial Failure [FIXED]
- **Location**: `src/orchestrator/domain/protection/morphing_service.ts`
- **Issue**: `executeMorph()` catches errors for honeypot and canary morphing independently, potentially alerting an adversary.
- **Fix**: Improved consistency in morphing operations.
- **Severity**: Resolved

---

## 5. Frontend & UI Gaps

### 5.1 `LogsPage` Reference Error [FIXED]
- **Location**: `src/orchestrator/interface/web/features/forensic/audit/logs.tsx`
- **Issue**: `LogsPage` attempts to access `props.csrfToken` and `props.nonce` but the component function does not define any parameters.
- **Fix**: Refactored to accept `props` object.
- **Severity**: Resolved

### 5.2 `ComplianceService` Hardcoded Hardware Signature [FIXED]
- **Location**: `src/orchestrator/domain/analysis/compliance_service.ts`
- **Issue**: `exportSignedBundle` returns a hardcoded mock signature `"HW_SIGNED_MOCK_SIGNATURE"`.
- **Fix**: Implemented hash-based signature generation as placeholder for full TPM signing.
- **Severity**: Resolved

### 5.3 `getPlatformInfo` Disk Metrics Missing [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/platform.ts`
- **Issue**: `getMetrics` hardcodes disk usage to `{ total: 0, free: 0, used: 0 }`.
- **Fix**: Implemented real disk metrics using `df` command.
- **Severity**: Resolved

### 5.4 `Dashboard` Misaligned Stat Calculation [FIXED]
- **Location**: `src/orchestrator/interface/web/features/situational/dashboard/page.tsx`
- **Issue**: "Intervention Force" and "Strike State" use hardcoded math.
- **Fix**: Replaced with dynamic calculations based on real metrics.
- **Severity**: Resolved

### 5.5 `SovereignApp` Unhandled Command Rejection [FIXED]
- **Location**: `src/orchestrator/app/sovereign_app.ts` (startDaemons)
- **Issue**: `daemons.forEach(s => sm.getPersistentSidecar(s).catch(() => {}))` ignores all errors.
- **Fix**: Added proper error handling and logging for sidecar startup.
- **Severity**: Resolved

### 5.6 `IncidentService` Unreliable Count [FIXED]
- **Location**: `src/orchestrator/domain/analysis/incident_service.ts`
- **Issue**: The service lacks a `count()` method.
- **Fix**: Added `count()` method using `TimelineRepository.count()`.
- **Severity**: Resolved

### 5.7 `ui.tsx` Missing Prop Propagation [FIXED]
- **Location**: `src/orchestrator/interface/web/routes/ui.tsx`
- **Issue**: `userRole` was undefined in the props passed to the pages.
- **Fix**: Corrected role derivation to check both `c.get("role")` and `c.get("user")?.role`.
- **Severity**: Resolved

### 5.8 `DiagnosticRepository` Double Counter Increment [FIXED]
- **Location**: `src/orchestrator/infrastructure/persistence/diagnostic_repository.ts`
- **Issue**: `addLog` incremented the same counter twice.
- **Fix**: Consolidated into a single atomic mutation.
- **Severity**: Resolved

### 5.9 `SupplyChainService` Brittle TOML Parsing [FIXED]
- **Location**: `src/orchestrator/domain/analysis/supply_chain.ts`
- **Issue**: Brittle parsing of `Cargo.toml`.
- **Fix**: Implemented robust multi-format TOML dependency parsing.
- **Severity**: Resolved

### 5.10 `reports.ts` Memory Pressure on Download [FIXED]
- **Location**: `src/orchestrator/interface/web/api/reports.ts`
- **Issue**: `/forensics/download/:name` uses `Deno.readFile(filePath)` to read the entire artifact into memory.
- **Fix**: Refactored to use Deno's readable stream for file response.
- **Severity**: Resolved

### 5.11 `stats.ts` Listener Leak [FIXED]
- **Location**: `src/orchestrator/interface/web/api/stats.ts`
- **Issue**: `eventBus.on("decoy", ...)` added duplicate listeners during router re-initialization.
- **Fix**: Added subscription guard to prevent duplicate listeners.
- **Severity**: Resolved

### 5.12 `threats.ts` Unbounded Query Limit [FIXED]
- **Location**: `src/orchestrator/interface/web/api/threats.ts`
- **Issue**: Large limit parameter allows DoS.
- **Fix**: Enforced upper bound on query limits.
- **Severity**: Resolved

---

## 6. Architecture & Platform

### 6.1 `sentinel` Architecture-Dependent Syscall IDs [FIXED]
- **Location**: `src/agents/sentinel/src/main.rs`
- **Issue**: Syscall IDs were hardcoded for x86_64, breaking AArch64 (ARM).
- **Fix**: Implemented architecture-aware syscall mapping.
- **Severity**: Resolved

### 6.2 `BaselineService` Fragile `ss` Parsing [FIXED]
- **Location**: `src/orchestrator/domain/analysis/baseline.ts`
- **Issue**: Fragile fixed-index column parsing for `ss`.
- **Fix**: Implemented robust parsing that accounts for shifting columns and IPv6 brackets.
- **Severity**: Resolved

### 6.3 `CovertChannelService` ICMP Payload Limits [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/covert_service.ts`
- **Issue**: `broadcastViaICMP` pattern size was not explicitly limited.
- **Fix**: Implemented explicit truncation to 16 bytes for pattern compliance.
- **Severity**: Resolved

### 6.4 `LedgerService` Out-of-Order Sync [FIXED]
- **Location**: `src/orchestrator/domain/analysis/ledger_service.ts`
- **Issue**: `syncEntry` pushed entries without verifying `prevHash` continuity.
- **Fix**: Implemented continuity and hash integrity checks in `syncEntry`.
- **Severity**: Resolved

### 6.5 `PluginManager` Blocking Lifecycle [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/plugin_manager.ts`
- **Issue**: Sequential `await` in `startAll` and `stopAll` could stall the boot or shutdown sequence.
- **Fix**: Refactored to parallel start/stop with timeouts.
- **Severity**: Resolved

### 6.6 `NetworkDiscoveryService` Overlapping Scans [FIXED]
- **Location**: `src/orchestrator/domain/analysis/network_discovery.ts`
- **Issue**: `setInterval` for `scan()` did not check if a previous scan was still active.
- **Fix**: Added `isScanning` concurrency guard.
- **Severity**: Resolved

---

## 7. Sidecar Specifics

### 7.1 `netcap` Zombie Capture Handle [FIXED]
- **Location**: `src/agents/netcap/src/main.rs`
- **Issue**: `StartCapture` rejected new requests if `capture_handle.is_some()`, even if the internal task finished.
- **Fix**: Now checks `is_finished()` status before rejecting new captures.
- **Severity**: Resolved

### 7.2 `decoy` Unbounded Connection Spawning [FIXED]
- **Location**: `src/agents/decoy/src/main.rs`
- **Issue**: Spawns a new task for every accepted TCP connection without any concurrency limits.
- **Fix**: Implemented a per-port connection limit (50) to prevent DoS.
- **Severity**: Resolved

---

## 8. Persistence & Config

### 8.1 `FirewallManager` Unbounded Rule Hydration [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/firewall.ts`
- **Issue**: `setKv` performed a full list operation on the `enforcement` prefix.
- **Fix**: Added hydration limits.
- **Severity**: Resolved

### 8.2 `ConfigSchema` Permissive Defaults [FIXED]
- **Location**: `src/orchestrator/core/config_schema.ts`
- **Issue**: `ALLOWED_ORIGINS` defaulted to `*`.
- **Fix**: Hardened production defaults to 'self'.
- **Severity**: Resolved

### 8.3 `TimelineRepository` Batch Size Inefficiency [FIXED]
- **Location**: `src/orchestrator/infrastructure/persistence/repositories/timeline_repository.ts`
- **Issue**: `deleteBefore` used a fixed batch size of 10.
- **Fix**: Increased batch size to 100 for atomic mutations.
- **Severity**: Resolved

### 8.4 `AuditService` Leaking Intervals [FIXED]
- **Location**: `src/orchestrator/domain/analysis/audit.ts`
- **Issue**: Background intervals were not cleared during shutdown.
- **Fix**: Implemented `shutdown()` method to clear all intervals.
- **Severity**: Resolved

### 8.5 `TPMManager` Colliding Secret Indices [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/protection/tpm/tpm_manager.ts`
- **Issue**: Hardcoded the same NVRAM index for all secrets.
- **Fix**: Implemented secret-to-index mapping for unique storage.
- **Severity**: Resolved

### 8.6 `LedgerService` Unverified Sync [FIXED]
- **Location**: `src/orchestrator/domain/analysis/ledger_service.ts`
- **Issue**: `syncEntry` accepted entries without verifying signatures or recalculating hashes.
- **Fix**: Recalculate hash and verify before commit.
- **Severity**: Resolved

### 8.7 `UbuntuFirewallProvider` PID Injection [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/providers/ubuntu_firewall.ts`
- **Issue**: Possible risk of killing critical system processes.
- **Fix**: Added safety checks to prevent killing PID 1 or the orchestrator.
- **Severity**: Resolved

### 8.8 `MacosFirewallProvider` / `WindowsFirewallProvider` Cross-Agent Dependency [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/protection/firewall/providers/*.ts`
- **Issue**: Both providers attempted to send commands to the non-existent `enforcer` agent on those platforms.
- **Fix**: Correctly routed process control commands to platform-native agents.
- **Severity**: Resolved

### 8.9 `Layout.tsx` Missing Content Security Policy [FIXED]
- **Location**: `src/orchestrator/interface/web/components/Layout.tsx`
- **Issue**: Missing meta CSP and inconsistent nonce application.
- **Fix**: Nonce is now correctly propagated to all UI pages and Layout.
- **Severity**: Resolved

### 8.10 `AutonomousAutopilotService` Unbounded Capture Requests [FIXED]
- **Location**: `src/orchestrator/domain/analysis/autonomous_autopilot_service.ts`
- **Issue**: `executeContainment` could send multiple overlapping capture requests.
- **Fix**: Implemented active capture deduplication.
- **Severity**: Resolved

### 8.11 `SidecarManager` Untracked Backoff Timers [FIXED]
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `handleSidecarExit` timers were not cancelled during shutdown.
- **Fix**: Now tracks and clears all restart timers in `shutdown()`.
- **Severity**: Resolved

---

## 9. Infrastructure & Core Framework

### 9.1 `initializeApplication` Sequential Bottleneck [FIXED]
- **Location**: `src/orchestrator/core/application.ts`
- **Issue**: Linear boot sequence of bootstrap, platform info, and plugins.
- **Fix**: Parallelized bootstrap and dependency checks.
- **Severity**: Resolved

### 9.2 `KvStore` Missing Close in Many Services [FIXED]
- **Location**: `src/orchestrator/infrastructure/persistence/kv_store.ts`
- **Issue**: Services did not explicitly close KV connections.
- **Fix**: Added cleanup and explicit closing for KV/HTTP clients in Mesh and other services.
- **Severity**: Resolved

### 9.3 `Application` Brittle Forensic Subscriber [FIXED]
- **Location**: `src/orchestrator/core/application.ts`
- **Issue**: Event subscriber started PCAP capture without tracking active status.
- **Fix**: Consolidated capture logic in `AutonomousAutopilotService` with deduplication.
- **Severity**: Resolved

---

## 10. Service Lifecycle & Maintenance

### 10.1 `SovereignApp` Shadow Mode Leak [FIXED]
- **Location**: `src/orchestrator/app/sovereign_app.ts`
- **Issue**: Shadow mode timer was not stored and could not be cleared.
- **Fix**: Added timer tracking and cancellation on shutdown.
- **Severity**: Resolved

### 10.2 `SidecarManager` Rotation Loop Leak [FIXED]
- **Location**: `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Issue**: `startRotationLoop` interval continued to run after shutdown.
- **Fix**: Added `clearInterval` for rotation loop in `shutdown()`.
- **Severity**: Resolved

### 10.3 `EventMediator` Type Safety Gap [FIXED]
- **Location**: `src/orchestrator/domain/analysis/event_mediator.ts`
- **Issue**: `wireSidecars` accepted `commandPort: any`.
- **Fix**: Replaced `any` with `CommandPort` interface.
- **Severity**: Resolved

---

## 11. Plugins & Platform Extensibility

### 11.1 `UbuntuVpnProvider` Inconsistent Method Signature [FIXED]
- **Location**: `src/orchestrator/infrastructure/system/protection/vpn/providers/ubuntu_vpn.ts`
- **Issue**: `isConnected` defined a parameter not present in the base interface.
- **Fix**: Standardized `isConnected` and `disconnect` signatures across all providers.
- **Severity**: Resolved

### 11.2 `createPluginsForPlatform` Fallback Shadowing [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/plugins/plugin_catalog.ts`
- **Issue**: Fallback to *all* plugins for unknown tags.
- **Fix**: Removed aggressive fallback; unknown platforms now fail gracefully.
- **Severity**: Resolved

### 11.3 `plugin_manager.ts` Silent Start Failures [FIXED]
- **Location**: `src/orchestrator/domain/orchestration/plugin_manager.ts`
- **Issue**: `startAll` did not update status or notify on failure.
- **Fix**: Implemented timeouts and failure logging that influences status reporting.
- **Severity**: Resolved
