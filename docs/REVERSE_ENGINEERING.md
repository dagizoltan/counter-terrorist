# Sovereign Security Orchestrator: Reverse Engineering Report

## System Architecture

The Sovereign / Counter-Terrorist system is a multi-tier security orchestrator designed for high-integrity environments (Ubuntu Linux primary, with full platform parity across macOS and Windows).

### 1. The Orchestrator (Deno Brain)
- **Runtime**: Deno with Unstable KV for persistence and cryptographic state isolation.
- **Web Interface**: Hono-based API and React/JSX Web Components frontend with WebSocket multiplexing.
- **7-Phase Boot Sequence**: Strictly ordered lifecycle:
  1. `initCore`: Storage & KV verification.
  2. `Hardening`: Cryptographic secret entropy & TPM unsealing.
  3. `TPM/System`: System lifecycle & hardware attestation.
  4. `Infrastructure`: mTLS Mesh & peer gossip.
  5. `AppManager/Registry`: Sidecar spawner & daemon management.
  6. `ServiceOrchestrator`: Domain DDD dependency injection & command bus routing.
  7. `Finalization`: Web adapter server initialization & TLS listener.
- **Security**: Implements a zero-trust model where all OS executions are strictly gated through `SystemExecutor` path jails and whitelisted IPC protocols.

### 2. Sidecars (Rust Agent Fleet)
High-performance native system agents written in Rust for kernel-level monitoring and OS-native enforcement:
- **Sentinel (`sentinel`)**: eBPF/LSM kernel telemetry, kprobe hooks (`execve`, `ptrace`, `connect`, `openat`), and PID quiet mode (`AgentCommand::TrustPid`).
- **Sentinel Darwin (`sentinel-darwin`)**: Native C FFI bindings to Apple Endpoint Security Framework (`es_message_t`, `es_client_t`).
- **Enforcer (`enforcer`)**: Linux process remediation (SIGKILL, SIGSTOP, cgroups isolation, memory dumping).
- **Enforcer Win (`enforcer-win`)**: Windows Filtering Platform (WFP) driver integration (`FwpmEngineOpen0`, `FwpmFilterAdd0`) for native kernel packet blocking.
- **Telemetry Win (`telemetry-win`)**: ETW (Event Tracing for Windows) syscall and process telemetry ingestion.
- **Analyzer (`analyzer`)**: Multi-vector malware, rootkit (`rkhunter`), and signature analysis engine (`clamscan`).
- **Trustroot (`trustroot`)**: Hardware TPM 2.0 PCR attestation, sealed secret unsealing via TCG TSS2 C FFI bindings.
- **Decoy (`decoy`)**: Deception traps (SSH, Redis, HTTP honeypots) with automated threat scoring.
- **Watchfile (`watchfile`)**: `inotify` kernel filesystem integrity monitoring (FIM).
- **Netcap (`netcap`)**: Raw socket PCAP network inspection and flow tracking.
- **Tunnel (`tunnel`)**: WireGuard VPN tunnel lifecycle manager.

## Identified Security Risks & Mitigations

During the security evaluation, several boundary vulnerabilities were identified and resolved:

### 1. Path Traversal & Prefix Bypass (B-09)
- **Risk**: Attackers could bypass path jails using `../` traversal or prefix manipulation (e.g., `./volume-sensitive/`).
- **Mitigation**: Hardened `validatePath` with URL-decoding, null-byte rejection, and strict boundary normalization.

### 2. Command Jailing (Information Leakage)
- **Risk**: Whitelisted system commands like `openssl` could be coerced into reading sensitive system files (e.g., `/etc/shadow`).
- **Mitigation**: Implemented mandatory jailing in `SystemExecutor`. Commands identified as "path-sensitive" are now restricted to `./volume/` and `/var/lib/cts/` regardless of the input format.

### 3. IPC JSON Injection
- **Risk**: Malicious payloads could be "smuggled" through IPC JSON strings to access unauthorized paths during forensic dumps.
- **Mitigation**: `SystemExecutor` now performs deep inspection of JSON arguments, parsing and validating multiple path-sensitive fields (e.g., `path`, `exe_path`, `log_path`, `source`, `destination`) within the payload against the system jail before execution.

### 4. SSRF & DNS Rebinding in Webhooks
- **Risk**: Attackers could use webhook configurations to scan internal networks or exfiltrate data from local services.
- **Mitigation**: Implemented `validateWebhookUrlAsync` which resolves hostnames to IPs and ensures they do not belong to private or restricted ranges. Added `safeFetch` to enforce usage of the validated IP while preserving the original Host header, mitigating DNS rebinding attacks.

### 5. Resource Management & Integrity Performance
- **Risk**: Large binary integrity checks could cause memory exhaustion, and background services could leak resources.
- **Mitigation**: Transitioned `calculateHash` to a streaming architecture using `Deno.open`. Hardened `shutdown` methods across domain services (`EventMediator`, `AutopilotService`, `BehavioralAnalyzer`) to ensure explicit cleanup of timers and background tasks.

## Local Development Environment

The environment is now fully provisioned:
- **Tooling**: Deno 2.x and Cargo (Rust) are required.
- **Bootstrap**: `.env` is configured with `CTS_DEV_MODE=true` to bypass hardware integrity checks during development.
- **Verification**: A comprehensive security audit suite (`tests/security_audit.ts`) is included to prevent regressions in security boundary logic.

## Advanced High-Performance Mechanisms

### 1. Zero-Copy Lock-Free Ring Buffer (`cts_ipc`)
To handle high-frequency telemetry (thousands of syscall events per second) without blocking the orchestrator or sidecars, the system implements a custom ring buffer in Rust.
- **Shared Memory**: Telemetry is written to `/dev/shm` segments.
- **Concurrency**: Uses atomic head/tail pointers (`AtomicU32`) to allow single-producer (sidecar), single-consumer (orchestrator) access without mutexes.
- **Contiguous Messages**: Implements a skip-marker (`0xFFFFFFFF`) at the end of the buffer to ensure all messages remain contiguous in memory, simplifying Deno FFI ingestion.
- **Signing**: Prepend 64-byte Ed25519 signatures to telemetry packets, verified in the orchestrator via native FFI.

### 2. Binary Sovereignty (Execution from Memory)
To mitigate TOCTOU (Time-of-Check Time-of-Use) attacks where a sidecar binary could be swapped after validation but before execution, Sovereign implements memory-only execution.
- **Sealed Memfd**: The orchestrator reads the validated binary into memory, creates an anonymous file via `memfd_create`, and immediately applies seals (`F_SEAL_WRITE`, `F_SEAL_SHRINK`, etc.) to prevent any modifications.
- **FD Execution**: The sidecar is spawned via `/proc/self/fd/N` rather than a disk path.
- **Namespace Isolation**: Spawning is further hardened via `systemd-run` with `ProtectProc=invisible` and `ProcSubset=pid`.

## Summary
The system's security posture has been significantly improved by transitioning from regex-only validation to a multi-layered verification strategy combining regex, path normalization, and deep payload inspection, underpinned by native high-performance IPC and hardware-rooted integrity.
