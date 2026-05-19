# Counter-Terrorist: Extensive Bug List & Security Audit (v5.2)

This document categorizes identified bugs, security vulnerabilities, and stability issues discovered during the reverse-engineering and audit of the Counter-Terrorist (v5.2-STABLE) codebase.

## 🔴 CRITICAL SEVERITY

### 1. Memory Safety: Sidecar Binary OOM
- **Domain**: Infrastructure (Sidecar Management)
- **Status**: ✅ **FIXED**
- **Description**: The `digestStream` implementation in `SidecarManager.ts` collected all binary chunks into a single `Uint8Array` before hashing. This would cause an Out-Of-Memory (OOM) crash when processing large agent binaries or updates.
- **Impact**: Denial of Service (DoS) during boot or rotation.

### 2. Integrity: Forensic Chain "Fail-Open"
- **Domain**: Domain (Audit/Analysis)
- **Status**: ✅ **FIXED**
- **Description**: If `AuditService.ts` detected ledger tampering during the boot sequence (`restoreChainHead`), it logged an error but allowed the system to continue booting in a potentially compromised state.
- **Impact**: Cryptographic integrity bypass; malicious state could persist.

### 3. Jailing: Path Extraction Logic Flaw
- **Domain**: Infrastructure (Security Jailing)
- **Status**: ✅ **FIXED**
- **Description**: `extractPathsFromJson` in `SystemExecutor.ts` utilized `Object.entries` on objects but failed to recurse into arrays. Malicious paths hidden inside JSON arrays (common in sidecar IPC) would bypass jail validation.
- **Impact**: Jailbreak via crafted IPC payloads.

---

## 🟠 HIGH SEVERITY

### 4. TOCTOU: Sidecar Deployment Race
- **Domain**: Infrastructure (Runtime)
- **Status**: ✅ **FIXED**
- **Description**: Sidecar binaries were verified at their source location *before* being moved to the secure `/var/lib/cts/bin/` directory. An attacker could replace the binary between verification and execution.
- **Impact**: Execution of unverified/malicious native code.

### 5. Deadlock: EventBus Middleware Hanging
- **Domain**: Domain (Analysis/Events)
- **Status**: ✅ **FIXED**
- **Description**: The `EventBus` middleware chain lacked execution timeouts. If a middleware failed to call `next()` or hung (e.g., due to a blocking I/O operation), the entire system event propagation would stop.
- **Impact**: System-wide hang; loss of real-time monitoring and defense.

### 6. Logic Gap: Ghost Implementations
- **Domain**: Architecture
- **Status**: ⚠️ **PENDING**
- **Description**: Several core features described in "Milestone 4" are partially or missing implementation:
    - `ProvisioningService`: Defined but never instantiated or started in `SovereignApp`.
    - `verifyFullChain`: Called by `MetricsService` but does not exist in `AuditService`.
- **Impact**: False sense of security; operational capabilities missing.

### 7. Security: TPM Index Collision
- **Domain**: Infrastructure (TPM)
- **Status**: ⚠️ **PENDING**
- **Description**: `TPMManager.getIndexForSecret` defaults to `0x1500001` for any unknown secret name. This index is specifically reserved for `MESH_SECRET`.
- **Impact**: Unintentional overwriting of critical hardware-sealed secrets.

---

## 🟡 MEDIUM SEVERITY

### 8. Resource Management: Missing Cleanup
- **Domain**: Domain (Lifecycle)
- **Status**: ✅ **FIXED** (Core Services) / ⚠️ **STUBS** (Tools)
- **Description**: Many background services (e.g., `IntegrityService`, `MorphingService`) lacked `shutdown()` methods to clear `setInterval` timers. In a test environment or during a hot-reload, these would leak resources.
- **Impact**: Memory/CPU leaks; unstable test suite.

### 9. Stability: NaN/Infinity in Metrics
- **Domain**: Domain (Analysis)
- **Status**: ✅ **FIXED**
- **Description**: `HealthService.ts` and `BehavioralAnalyzer.ts` performed division operations for CPU utilization and entropy without checking for zero-deltas or missing samples.
- **Impact**: Dashboard display corruption; incorrect behavioral verdicts.

### 10. Reliability: Jittery Gossip
- **Domain**: Domain (Mesh)
- **Status**: ✅ **FIXED**
- **Description**: Mesh gossip broadcasts (Blocks, Lockdowns) were "fire-and-forget". In a high-latency or jittery network, critical security signals could be lost.
- **Impact**: Inconsistent mesh-wide defensive state.

### 11. Persistence: Unbounded KV Growth
- **Domain**: Infrastructure (Persistence)
- **Status**: ⚠️ **PENDING**
- **Description**: `AuditDelta` objects and `NewsItem` signals are stored in Deno KV without a comprehensive purge strategy (unlike the main Audit Ledger).
- **Impact**: Disk exhaustion over long operational periods.

---

## 🔵 LOW SEVERITY / TECH DEBT

### 12. Cross-Platform: macOS/Windows Stubs
- **Domain**: Infrastructure (Platform)
- **Status**: ℹ️ **DOCUMENTED**
- **Description**: Many core security features (eBPF, AppArmor, Jailing) are Linux-specific. The macOS and Windows implementations use "Limited/Mock" stubs that do not provide equivalent security guarantees.

### 13. UI: Batching Overhead
- **Domain**: Interface (Web)
- **Status**: ℹ️ **OPTIMIZED**
- **Description**: `EventMediator.ts` batches syscalls, but the UI still receives individual `UI_BROADCAST` events for every audit log entry, causing high WebSocket traffic during scans.
