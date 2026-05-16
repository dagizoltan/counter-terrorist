# Sovereign Bug Report: Comprehensive Audit Findings

This report catalogs logic flaws, security risks, performance bottlenecks, and implementation errors discovered during the production-grade audit of the Counter-Terrorist (Sovereign) Security Orchestrator.

---

## 1. Remaining Critical Risks

### BUG-19: eBPF Session Table Exhaustion
- **File:** `src/agents/sentinel/sentinel-kernel/src/main.rs`
- **Description:** The `ACTIVE_SESSIONS` map has a max capacity of 4096 entries and no kernel-side eviction logic for stale sessions.
- **Impact:** A simple port-scanning attack or high-concurrency legitimate traffic can fill this table. Once full, new stateful connections will fail to be recorded, resulting in all new traffic being dropped by the default-deny policy.
- **Recommended Fix:** Implement a LRU eviction policy in the eBPF program or a periodic sweep by the userspace agent.

### BUG-24: Ineffective Intent Modeling (Signature Matching)
- **File:** `src/orchestrator/domain/analysis/behavioral_analyzer.ts`
- **Description:** `getIntentVerdict` uses `sequence.includes(s)` for every element in the signature, ignoring the actual execution order and proximity.
- **Impact:** High false positive rate for complex legitimate binaries that eventually call the required syscalls in any order.
- **Recommended Fix:** Use an ordered sequence matcher or a hidden Markov model (HMM).

---

## 2. Security & Compliance Gaps

### BUG-05: Weak Hardware Integrity Fallback
- **File:** `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Description:** If the signed manifest is unavailable, the system falls back to environment-based integrity (`Deno.env.get("CTS_HASH_...")`).
- **Impact:** An attacker with local environment access can spoof agent hashes, bypassing binary integrity checks.
- **Recommended Fix:** Make the signed manifest mandatory for production environments and fail-closed if missing.

### BUG-06: `SystemExecutor` Broad Regex Policies
- **File:** `src/orchestrator/infrastructure/system/system_executor.ts`
- **Description:** Some regex patterns in `COMMAND_POLICIES` (e.g., `powershell`, `tpm2_nvwrite`) use broad matches like `/.*/`.
- **Impact:** Potential for argument injection or parameter smuggling in sensitive commands.
- **Recommended Fix:** Replace `/.*/` with strict whitelists and strict anchors.

### BUG-27: Broken Logic in `AuditService` Chronological Sync
- **File:** `src/orchestrator/domain/analysis/audit.ts`
- **Description:** `syncEvents` allows "floating" chains if the first event in a sync batch doesn't connect to the local history.
- **Impact:** The audit ledger could have multiple disconnected chains, breaking immutability.
- **Recommended Fix:** Validate hash continuity during sync or require hardware-signed checkpoints.

---

## 3. Distributed Mesh Issues

### BUG-07: Mesh Quorum Connectivity Risk
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Description:** Regenerating the Root CA triggers an immediate rotation of all node certificates. Offline nodes will be locked out of the mesh.
- **Impact:** Mesh fragmentation during maintenance cycles.
- **Recommended Fix:** Implement a "dual-trust" transition period for Root CAs.

### BUG-08: Parallel Probe Flooding
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Description:** `discoverSubnet()` probes the entire /24 subnet in parallel batches of 50.
- **Impact:** Can trigger network IDS alerts or saturate small NAT tables.
- **Recommended Fix:** Reduce concurrency and add jitter.

---

## 4. Performance Bottlenecks

### BUG-09: Synchronous Event Bus Bottleneck
- **File:** `src/orchestrator/domain/analysis/events.ts`
- **Description:** The `EventBus` executes listeners synchronously on the main thread.
- **Impact:** Heavy computational listeners can block critical threat responses.
- **Recommended Fix:** Transition to an async event emitter or worker thread pattern.

---

## 5. Deployment Conflicts

### BUG-04: `HoneypotService` Port Conflict Race
- **File:** `src/orchestrator/domain/protection/honeypot_service.ts`
- **Description:** The `morph()` function selects ports without checking if they are used by external system services (e.g., real SSH).
- **Impact:** Potential service disruption for legitimate system applications.
- **Recommended Fix:** Verify port availability via `ss` or `netstat` before binding decoys.
