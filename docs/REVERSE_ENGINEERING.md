# Sovereign Security Orchestrator: Reverse Engineering Report

## System Architecture

The Sovereign/Counter-Terrorist system is a multi-tier security orchestrator designed for high-integrity environments (Ubuntu Linux primary, with experimental macOS/Windows support).

### 1. The Orchestrator (Deno Brain)
- **Runtime**: Deno with Unstable KV for persistence.
- **Web Interface**: Hono-based API and React/JSX frontend.
- **Role**: Serves as the "Brain," managing mesh discovery, policy enforcement, and sidecar lifecycle.
- **Security**: Implements a zero-trust model where all system interactions are mediated through the `SystemExecutor` and whitelisted IPC.

### 2. Sidecars (Rust Enforcement)
High-performance agents written in Rust for low-level system operations:
- **Sentinel**: eBPF/XDP kernel-level observability and firewalling.
- **Enforcer**: Process-level remediation (Kill, SIGSTOP, Forensic Dump).
- **Analyzer**: Multi-vector threat scanning (Malware, Rootkits, Shellcode).
- **Trustroot**: Hardware-rooted identity and secret management via TPM 2.0.
- **Decoy**: Distributed honeypots and deception traps.

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
