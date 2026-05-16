# Sovereign Security Orchestrator: Future Roadmap

This document outlines the strategic direction for the Sovereign project, focusing on system robustness (Bug Cleaning), architectural integrity (Logic Healing), and high-impact security features.

## 1. Bug Cleaning & Stability

### 1.1 Sidecar Lifecycle Robustness
- **Issue**: Sidecar crashes are currently handled by simple restarts. Persistent failures can lead to "orphan" events or lost telemetry.
- **Task**: Implement a circuit-breaker pattern for failing sidecars to prevent resource exhaustion during crash loops.
- **Task**: Improve IPC error propagation; ensure the orchestrator gracefully handles malformed or incomplete JSON from sidecar stdout.

### 1.2 Resource Leak Audit
- **Issue**: The `EventBus` and `WSBroadcaster` maintain many long-lived listener sets.
- **Task**: Perform a memory leak audit in Deno using `Deno.memoryUsage()` during heavy load simulations.
- **Task**: Implement explicit `unsubscribe` and `cleanup` methods for all domain services.

### 1.3 KV Transactional Integrity
- **Issue**: High-frequency logging to Deno KV may encounter contention.
- **Task**: Refactor `AuditService` and `LoggingService` to use batched KV transactions for improved performance and atomicity.

## 2. Logic Healing & Architectural Hardening

### 2.1 Structured Command Validation
- **Issue**: `SystemExecutor` relies on complex regex patterns which can be brittle or bypassed.
- **Task**: Transition from regex-based argument validation to a structured schema-based validation (e.g., Zod) for all system commands.
- **Task**: Implement "Mandatory Jailing" by default for all file-system-touching commands, removing the need for manual jail prefix checks in the executor logic.

### 2.2 Formal Policy Enforcement
- **Issue**: `AutopilotService` logic is currently distributed across multiple event listeners.
- **Task**: Centralize autonomous response logic into a formal "Policy Engine" that uses a DSL (Domain Specific Language) to define threats and remediations.
- **Task**: Decouple the `AutonomousResponseEngine` from specific sidecar implementations to support generic "Remediation Providers."

### 2.3 Sidecar Integrity (TPM 2.0)
- **Issue**: Hardware integrity is currently bypassed in dev mode.
- **Task**: Implement a "TPM Simulator" mode for the `trustroot` agent to allow testing of PCR sealing/unsealing logic without physical hardware.
- **Task**: Harden the `secure_spawn.sh` script to use `dm-verity` or similar for immutable binary partitions.

## 3. High-Impact Features

### 3.1 Advanced Deception (Project Chameleon)
- **Feature**: Dynamic Honeypots. Sidecars that can masquerade as common enterprise services (e.g., PostgreSQL, Redis) with high-fidelity interaction.
- **Feature**: "Breadcrumb Injection." Automatically placing fake credentials and configuration files in common attacker-targeted locations (`~/.aws/credentials`, `~/.ssh/config`).

### 3.2 Kernel-Level Sandboxing
- **Feature**: Landlock Integration. Use Linux Landlock (via Rust) to jail the `analyzer` and `decoy` agents even more strictly at the syscall level.
- **Feature**: eBPF-based "Quiet Mode." Implement in-kernel event suppression for trusted processes to reduce orchestrator overhead.

### 3.3 Mesh Forensic Replay
- **Feature**: "Temporal Replay Island." A UI component that allows an operator to replay a system's state leading up to a security event, visualizing the causal graph of processes and network connections.
- **Feature**: Mesh-wide Quarantining. Synchronized isolation of a malicious actor across all nodes in the mesh simultaneously.

### 3.4 Automated Compliance Mapping
- **Feature**: Real-time mapping of system state and audit logs to compliance frameworks (NIST, SOC2, GDPR).
- **Feature**: Automated "Evidence Vault" generation for auditors, signed with hardware-rooted keys.
