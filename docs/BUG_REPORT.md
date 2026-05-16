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

---

## 5. Advanced Logic & Sidecar Issues

### BUG-13: Concurrent Stdout Corruption (Sentinel Sidecar)
- **File:** `src/agents/sentinel/src/main.rs`
- **Description:** The `emit_event` function, which handles high-frequency eBPF perf events, does not use the `STDOUT_LOCK`.
- **Impact:** When multiple eBPF events occur simultaneously with a command response or a log message, the output to stdout becomes interleaved and corrupts the JSON stream. This causes the Deno `SidecarManager` to fail parsing, leading to dropped security events.
- **Recommended Fix:** Wrap `println!` in `emit_event` with the same `Lazy<Arc<Mutex<()>>>` used by other output functions.

### BUG-14: Excessive Disk I/O (PCAP Sidecar)
- **File:** `src/agents/netcap/src/main.rs`
- **Description:** The `PcapngWriter` calls `self.writer.flush()?` after every single packet write.
- **Impact:** On a high-traffic network, this will cause massive CPU overhead due to frequent system calls and potentially premature SSD wear. It significantly limits the scalability of the forensic capture system.
- **Recommended Fix:** Remove the per-packet flush and rely on the `BufWriter` default behavior or implement a time-based flush (e.g., every 1 second).

### BUG-15: Silent Failure in Forensic Capture Task
- **File:** `src/agents/netcap/src/main.rs`
- **Description:** The `tokio::spawn` task for `StartCapture` uses `.ok()` when creating the `PcapngWriter`. If file creation fails (e.g., due to permissions in `./volume/storage/captures`), the task continues to run a dummy loop without notifying the orchestrator of the failure.
- **Impact:** The UI shows "Recording Active" while no data is actually being saved, creating a false sense of forensic security.
- **Recommended Fix:** Check the result of `PcapngWriter::new` and emit a `SidecarResponse` with `success: false` if it fails.

### BUG-16: Brittle Authorized Process Detection in FIM
- **File:** `src/agents/watchfile/src/main.rs`
- **Description:** The Fanotify guard uses simple string comparison on `comm` names (`comm != "fim" && comm != "deno" && comm != "systemd"`) to permit modifications to `/bin` and `/etc/shadow`.
- **Impact:** A malicious process named `deno` or `fim` could bypass these critical file protections. Conversely, if the orchestrator is run with a different binary name, it will be blocked from its own legitimate operations.
- **Recommended Fix:** Use PID-based verification or, ideally, verify the binary hash of the calling process via `/proc/[pid]/exe` before allowing modification.

### BUG-17: Race Condition in `AutopilotService` Shutdown
- **File:** `src/orchestrator/domain/orchestration/autopilot_service.ts`
- **Description:** The `shutdown()` method kills the `lureProcess` but does not handle the case where a new lure process might be in the middle of spawning or if the reference is stale.
- **Impact:** Potential for "zombie" lure processes to remain active after the orchestrator has supposedly stopped, leading to port conflicts on restart.
- **Recommended Fix:** Ensure `spawnLureProcess` checks the `isStarted` flag and implement a more robust process tracking for all spawned child tasks.

---

## 6. eBPF & Kernel Boundary Issues

### BUG-18: XDP Default-Deny Policy Risk
- **File:** `src/agents/sentinel/sentinel-kernel/src/main.rs`
- **Description:** The `try_xdp_ingress` function returns `Ok(XDP_DROP)` at the end of the chain.
- **Impact:** This implements a strict default-deny firewall at the XDP level. If the `ALLOWED_PORTS` map is not correctly populated (e.g., during a race condition at boot or if a management port is forgotten), the host will lose all network connectivity, including SSH and the CTS orchestrator's own mesh management traffic.
- **Recommended Fix:** Ensure a "fail-open" or "fail-to-legacy-firewall" transition period during boot, or hardcode essential management ports (like 22 and 8000) in the kernel code as a safety fallback.

### BUG-19: eBPF Session Table Exhaustion
- **File:** `src/agents/sentinel/sentinel-kernel/src/main.rs`
- **Description:** The `ACTIVE_SESSIONS` map has a max capacity of 4096 entries and no kernel-side eviction logic for stale sessions.
- **Impact:** A simple port-scanning attack or high-concurrency legitimate traffic can fill this table. Once full, new stateful connections (required for the XDP stateful check bypass) will fail to be recorded, resulting in all new traffic being dropped by the default-deny policy (BUG-18).
- **Recommended Fix:** Implement a LRU eviction policy in the eBPF program or have the userspace agent periodically sweep and prune the map.

### BUG-20: Unsafe Pointer Dereference (Sentinel Userspace)
- **File:** `src/agents/sentinel/src/main.rs`
- **Description:** The code uses `unsafe { &mut *bpf_ptr }` and `Box::into_raw` to manage the `Bpf` instance across threads.
- **Impact:** While intended to allow sharing the BPF handle, it bypasses Rust's safety guarantees. If the `Bpf` instance is dropped or the pointer becomes invalid during a command execution, it will cause a segmentation fault (Sidecar Crash).
- **Recommended Fix:** Use `Arc<Mutex<Bpf>>` or `Arc<RwLock<Bpf>>` to safely share the BPF handle across async tasks.

### BUG-21: Logic Error in `kprobe_ptrace` Comm Retrieval
- **File:** `src/agents/sentinel/sentinel-kernel/src/main.rs`
- **Description:** The `kprobe_ptrace` function calls `bpf_get_current_comm()` twice but uses the second call for the event payload without checking for success, and then uses the first result only for the trust check.
- **Impact:** Minor performance overhead and potential for inconsistent `comm` reporting if the process name changes between calls.
- **Recommended Fix:** Call `bpf_get_current_comm()` once and reuse the resulting byte array.

---

## 7. Performance & State Machine Faults

### BUG-22: Unbounded Loop in `scanForGhosts`
- **File:** `src/orchestrator/domain/analysis/process_tracker.ts`
- **Description:** The `scanForGhosts` function loops from 1 to 20,000 (partially optimized from 65,535) and performs async `getProcessInfo` and `isAlive` checks for every PID.
- **Impact:** On a system with many PIDs or slow `/proc` access, this function will block the domain service loop for seconds, causing high CPU usage and delaying event processing. Since it's called periodically (every 60s) and also on demand after critical syscalls, it can lead to "collection pile-up".
- **Recommended Fix:** Use `this.processProvider.listProcesses()` to get only active PIDs and check them against the known `tree`. Only probe "unknown" PIDs rather than the entire 16-bit range.

### BUG-23: Memory Leak in `BehavioralAnalyzer` Traces
- **File:** `src/orchestrator/domain/analysis/behavioral_analyzer.ts`
- **Description:** While `traces` are capped at 50 entries, the `traces` map itself is never pruned of stale IPs.
- **Impact:** On a long-running public-facing server, the `traces` map will grow indefinitely as unique IPs connect, eventually leading to OOM (Out of Memory).
- **Recommended Fix:** Implement a TTL-based eviction for the `traces` map, removing entries that haven't been updated for several hours.

### BUG-24: Ineffective Intent Modeling (Signature Matching)
- **File:** `src/orchestrator/domain/analysis/behavioral_analyzer.ts`
- **Description:** `getIntentVerdict` uses `sequence.includes(s)` for every element in the signature.
- **Impact:** Since it doesn't check the *order* or *proximity* of the syscalls, it will trigger a `SHELLCODE_INJECT` verdict if a process calls `mmap`, `mprotect`, and `ptrace` at any point in its last 5 calls, even if they are unrelated. This leads to extremely high false positive rates for complex legitimate binaries.
- **Recommended Fix:** Use an ordered sequence matcher or a hidden Markov model (HMM) to verify the actual transition path between syscalls.

### BUG-25: Redundant mTLS Handshakes
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Description:** `validateAndRegisterNode` performs a full mTLS fetch even if the node is already verified (it only updates `lastSeen` *after* the check).
- **Impact:** Unnecessary network traffic and CPU overhead on both nodes every discovery cycle.
- **Recommended Fix:** Move the `existing?.verified` check to the top of the function to return early.

---

## 8. Domain & State Logic Errors

### BUG-26: IPC Naming Schema Mismatch in `ChaosEngine`
- **File:** `src/orchestrator/domain/orchestration/chaos_engine.ts`
- **Description:** `simulateCanaryTrigger` sends events to the `fim` sidecar, and `simulateMalwareExecution` sends events to `ebpf`. However, the `SIDECAR_REGISTRY` and `SidecarManager` use `watchfile` and `sentinel` respectively.
- **Impact:** Chaos simulation will fail silently as `emitEvent` will target non-existent sidecar names.
- **Recommended Fix:** Update `ChaosEngine` to use canonical names: `watchfile` (for FIM) and `sentinel` (for eBPF).

### BUG-27: Broken Logic in `AuditService` Chronological Sync
- **File:** `src/orchestrator/domain/analysis/audit.ts`
- **Description:** `syncEvents` sorts events chronologically and then computes the `expectedHash` including `prevHash`. However, if the local `lastHash` doesn't match the `prevHash` of the first incoming event, the entire chain will remain valid but disconnected from the local history.
- **Impact:** The audit ledger could have multiple "floating" chains, breaking the immutable property of a single continuous ledger.
- **Recommended Fix:** Validate that the first event in a sync batch either connects to a known local hash or is a hardware-signed `CHECKPOINT`.

### BUG-28: Race Condition in `AuditService` logQueue
- **File:** `src/orchestrator/domain/analysis/audit.ts`
- **Description:** `logEvent` uses `this.logQueue = this.logQueue.then(logAction)`. If `logAction` (which is async) throws or hangs, all subsequent audit logging across the entire system is permanently blocked.
- **Impact:** Total loss of observability and auditability during a failure.
- **Recommended Fix:** Use a `.catch()` block within the chain to ensure the queue continues even if a single write fails.

### BUG-29: Missing Same-Origin Check for WebSockets
- **File:** `src/orchestrator/interface/web/web_adapter.tsx`
- **Description:** The `/api/ws/events` endpoint upgrades to WebSocket after validating the token/cookie but does not check the `Origin` header.
- **Impact:** Cross-Site WebSocket Hijacking (CSWSH). A malicious site could initiate a WebSocket connection to the orchestrator using the user's authenticated session cookie, potentially leaking real-time security events.
- **Recommended Fix:** Implement a strict `Origin` header check in the `upgradeWebSocket` handler.

### BUG-30: Potential Deadlock in `MetricsService` Collection
- **File:** `src/orchestrator/domain/analysis/metrics_service.ts`
- **Description:** `collectAndBroadcast` uses `if (this.isCollecting) return;` followed by `await Promise.all([...])`.
- **Impact:** If one of the parallel promises (e.g., `this.firewall.getStatus()`) hangs indefinitely due to a sidecar issue, `isCollecting` will remain `true` forever, permanently stopping metrics updates for the UI.
- **Recommended Fix:** Wrap the collection phase in a `Promise.race` with a timeout.
