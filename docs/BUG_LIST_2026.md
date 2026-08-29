# Counter-Terrorist: Comprehensive Bug List & Security Audit (v7.1-PRODUCTION)

This document categorizes identified bugs, security vulnerabilities, stability fixes, and remaining platform technical debt in the Counter-Terrorist codebase.

---

## 🔴 CRITICAL SEVERITY (RESOLVED)

### 1. Memory Safety: Sidecar Binary OOM
- **Domain**: Infrastructure (Sidecar Management)
- **Status**: ✅ **FIXED**
- **Description**: The `digestStream` implementation in `SidecarManager.ts` collected all binary chunks into a single memory buffer before hashing. This caused Out-Of-Memory (OOM) crashes on large binary streams.
- **Remediation**: Implemented streaming SHA-256 chunk digesting.

### 2. Integrity: Forensic Chain Fail-Open
- **Domain**: Domain (Audit/Analysis)
- **Status**: ✅ **FIXED**
- **Description**: Ledger tampering detected during boot (`restoreChainHead`) logged an error but permitted startup in a compromised state.
- **Remediation**: System auto-heals dev boundary or locks system into `FORENSIC_RESTRICTED` mode.

### 3. Jailing: Path Extraction Logic Flaw
- **Domain**: Infrastructure (Security Jailing)
- **Status**: ✅ **FIXED**
- **Description**: `extractPathsFromJson` in `SystemExecutor.ts` failed to recurse into JSON arrays, allowing malicious paths inside arrays to bypass jail checks.
- **Remediation**: Added deep recursive array traversal to path extraction logic.

---

## 🟠 HIGH SEVERITY (RESOLVED)

### 4. TOCTOU: Sidecar Deployment Race
- **Domain**: Infrastructure (Runtime)
- **Status**: ✅ **FIXED**
- **Description**: Sidecar binaries were verified at source *before* being copied to execution locations.
- **Remediation**: Binaries are written into sealed anonymous memory (`SYS_memfd_create` with `F_SEAL_WRITE`) prior to execution.

### 5. Stream Locking Race: Concurrent Sidecar StdIn Writers
- **Domain**: Infrastructure (Sidecar IPC)
- **Status**: ✅ **FIXED**
- **Description**: Concurrent commands dispatched to `SidecarManager.rawSendCommand` threw `TypeError: The stream is already locked` when acquiring `child.stdin.getWriter()`.
- **Remediation**: Implemented per-sidecar `stdinLocks` mutex queue serializing `stdin` stream access.

### 6. Native Security: Atomic Pointer Alignment & Memfd FD Leaks (SEC-R01..SEC-R04)
- **Domain**: Native Rust Core (`cts_ipc` & `cts_sec`)
- **Status**: ✅ **FIXED**
- **Description**: Raw slice allocator metadata corruption and memfd file descriptor leaks under high-concurrency C-ABI calls.
- **Remediation**: Enforced `AtomicU32` pointer alignment checks in `cts_ipc` and eliminated memfd leaks using `OwnedFd`.

---

## 🟡 MEDIUM SEVERITY (RESOLVED)

### 7. Performance: UI Telemetry Batching Overhead
- **Domain**: Domain (Analysis / EventMediator)
- **Status**: ✅ **FIXED**
- **Description**: High-frequency eBPF syscalls overwhelmed WebSocket broadcast queues and UI rendering threads.
- **Remediation**: `EventMediator.ts` buffers telemetry in `syscallBatch` and `networkBatch` queues up to `MAX_QUEUE_DEPTH = 5000` with 100ms periodic flushes.

### 8. Reliability: Self-Referential Audit Log Suppression
- **Domain**: Infrastructure (Logging)
- **Status**: ✅ **FIXED**
- **Description**: Audit event persistence triggered secondary audit log events, resulting in unbounded log recursion.
- **Remediation**: Added `orchestrator:domain:analysis:audit` to `ignoredSources` in `LoggingService`.

### 9. Stability: NaN/Infinity in Autonomous Threat Scoring
- **Domain**: Domain (Autonomous Response)
- **Status**: ✅ **FIXED**
- **Description**: Non-integer or negative severity inputs polluted threat evaluation scores with `NaN`.
- **Remediation**: Validated severity inputs using `Math.floor` and capped score decay algorithms.

---

## 🔵 LOW SEVERITY / PLATFORM TECHNICAL DEBT

### 10. Platform Parity: macOS & Windows Non-Linux Stubs
- **Domain**: Infrastructure (Platform Parity)
- **Status**: ℹ️ **PARTIALLY RESOLVED / DOCUMENTED**
- **Description**: Deep Linux kernel introspection features (eBPF LSM, `fanotify`, `AppArmor`) rely on Linux kernel APIs. Windows uses native WFP filtering (`enforcer-win`), while macOS uses Apple Endpoint Security Framework (`sentinel-darwin`) with fallback proxy stubs.

### 11. Process Stealth: Unprivileged PID Cloaking
- **Domain**: Native Kernel Introspection
- **Status**: ℹ️ **DOCUMENTED**
- **Description**: `HIDE_CONFIG` eBPF map hides PIDs from kernel directory enumeration (`/proc`), but requires `CAP_BPF` / `CAP_SYS_ADMIN` privileges at boot.
