# Sovereign Bug Report: Comprehensive Audit Findings

This report catalogs logic flaws, security risks, performance bottlenecks, and implementation errors discovered during the production-grade audit of the Counter-Terrorist (Sovereign) Security Orchestrator.

---

## 1. Critical Logic & Functional Bugs

### BUG-01: Sidecar Naming Inconsistency (`analyzer` vs `scanner`)
- **File:** `src/orchestrator/infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts`, `tests/protection_factory_test.ts`
- **Description:** The system internally refers to the malware analysis agent as `analyzer` (in `SIDECAR_REGISTRY` and IPC commands), but several domain services and integration tests refer to it as `scanner`.
- **Impact:** Integration tests fail, and some API endpoints may attempt to communicate with a non-existent sidecar name.
- **Recommended Fix:** Unify all references to `analyzer` (system name) and use `Scanner` only for UI display labels.

### BUG-02: Missing Background Timer Cleanup (Resource Leak)
- **Files:** `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`, `src/orchestrator/domain/protection/honeypot_service.ts`, `src/orchestrator/domain/analysis/metrics_service.ts`
- **Description:** Several services use `setInterval` or `setTimeout` for background tasks (e.g., sidecar rotation, honeypot morphing, metrics collection) but do not clear these timers in their `shutdown()` or `stop()` methods.
- **Impact:** Memory leaks and hanging processes during automated testing or graceful shutdowns.
- **Recommended Fix:** Implement `clearInterval` and `clearTimeout` in all service shutdown hooks.

### BUG-03: `EventMediator` Hardcoded Exfiltration Threshold
- **File:** `src/orchestrator/domain/analysis/event_mediator.ts`
- **Description:** The threshold for `EXFIL_ALERT` is hardcoded to 10MB (`1024 * 1024 * 10`).
- **Impact:** High-volume servers will trigger false positives constantly, while low-bandwidth IoT devices may be exfiltrated without alert.
- **Recommended Fix:** Move the threshold to a configurable environment variable `EXFIL_THRESHOLD_MB`.

### BUG-04: `HoneypotService` Port Conflict Race
- **File:** `src/orchestrator/domain/protection/honeypot_service.ts`
- **Description:** The `morph()` function selects a new port for decoys but only checks against a hardcoded list of orchestrator ports. It does not check if the port is currently used by other system services not managed by CTS.
- **Impact:** Potential service disruption if a honeypot decoy attempts to bind to a legitimate system service port (e.g., 22 for real SSH).
- **Recommended Fix:** Use `netstat` or `ss` via `SystemExecutor` to verify port availability before morphing.

---

## 2. Security Vulnerabilities (Minor/Moderate)

### BUG-05: Weak Hardware Integrity Fallback
- **File:** `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Description:** If the signed manifest is unavailable, the system falls back to environment-based integrity (`Deno.env.get("CTS_HASH_...")`).
- **Impact:** An attacker with local environment access can spoof agent hashes, bypassing binary integrity checks.
- **Recommended Fix:** Make the signed manifest mandatory for production environments and fail-closed if missing.

### BUG-06: `SystemExecutor` Broad Regex Policies
- **File:** `src/orchestrator/infrastructure/system/system_executor.ts`
- **Description:** Some regex patterns in `COMMAND_POLICIES` (e.g., `powershell`, `tpm2_nvwrite`) use overly broad matches like `/.*/` or missing anchors.
- **Impact:** Potential for argument injection or parameter smuggling in sensitive system commands.
- **Recommended Fix:** Replace `/.*/` with strict whitelists and ensure all patterns use `^` and `$` anchors.

### BUG-07: Mesh Quorum Connectivity Risk
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Description:** Regenerating the Root CA triggers a rotation of all node certificates. In a large mesh, if some nodes are offline or have network issues during this period, they will be "locked out" of the mesh as their certificates will no longer trust the new CA.
- **Impact:** Permanent mesh fragmentation.
- **Recommended Fix:** Implement a "dual-trust" transition period where nodes accept certificates signed by both the old and new Root CAs.

---

## 3. Performance & Scalability Issues

### BUG-08: Parallel Probe Flooding
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Description:** `discoverSubnet()` probes the entire /24 subnet in parallel batches of 50.
- **Impact:** Can trigger network-based IDS alerts or saturate the NAT table on small routers/firewalls.
- **Recommended Fix:** Reduce concurrency and add jitter between probes.

### BUG-09: Synchronous Event Bus Bottleneck
- **File:** `src/orchestrator/domain/analysis/events.ts`
- **Description:** The `EventBus` executes listeners synchronously.
- **Impact:** A single heavy listener (e.g., behavioral modeling) can block the entire orchestrator loop, delaying critical threat responses.
- **Recommended Fix:** Transition to an async event emitter pattern or use worker threads for heavy analysis.

---

## 4. Implementation Errors (Failing Tests)

### BUG-10: Type Mismatch in `antivirus_test.ts`
- **Error:** `Property 'message' does not exist on type 'Result<ScanResult>'`.
- **Cause:** The code expects `ScanResult` but `scanPath` returns a `Result` wrapper.
- **Recommended Fix:** Access `result.data.message` after checking `result.success`.

### BUG-11: Signature Mismatch in `bootstrapper_test.ts`
- **Error:** `Expected 2 arguments, but got 1`.
- **Cause:** `checkDependency` was refactored to require an `executor` instance, but tests were not updated.
- **Recommended Fix:** Update test mocks to provide a mock `SystemExecutor`.

### BUG-12: `RkhunterManager` Mock Failure
- **Error:** `AssertionError: Values are not equal. [- undefined, + "rkhunter scan passed"]`.
- **Cause:** The sidecar mock response for `RKH_SCAN` does not align with the expected domain format.
- **Recommended Fix:** Align `RkhunterManager` IPC parsing with the `analyzer` sidecar output schema.
