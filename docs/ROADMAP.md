# Sovereign Security Orchestrator: Future Roadmap

This document outlines the strategic direction for the Sovereign project, focusing on system robustness (Bug Cleaning), architectural integrity (Logic Healing), and high-impact security features.

## 1. Phase 3: Infrastructure Type-Safety (COMPLETE)

All core orchestrator services and infrastructure providers have been refactored for strict type safety.
- **Domain Hardening**: `MeshManager`, `GovernanceService`, and `AutopilotService` now use precise interfaces.
- **Infrastructure Mediation**: Replaced direct `Deno.env` access with `ConfigurationPort` and implemented `ServiceRegistry` for ordered lifecycle management.
- **Zero-Any Goal**: Reduced technical debt by eliminating over 150 `any` instances.

## 2. Phase 4: Native Platform Parity (IN PROGRESS)

Current focus is on achieving functional parity for non-Linux platforms while maintaining the same security posture.

### 2.1 Windows Protection (WFP)
- **Task**: Implement `WindowsFirewallProvider` using the native Windows Filtering Platform (WFP) FFI.
- **Task**: Standardize the `telemetry-win` agent to provide syscall-equivalent events (ETW).

### 2.2 macOS Protection (ESF)
- **Task**: Transition `sentinel-darwin` from a mock to a functional Endpoint Security Framework (ESF) consumer.
- **Task**: Implement `MacOSFirewallProvider` using `pf` or Network Extensions.

### 2.3 Forensic Visualization
- **Task**: Complete the "Temporal Replay Island" UI to visualize causal process/network graphs.
- **Task**: Implement streaming PCAP-to-UI serialization for real-time traffic analysis.

## 3. Phase 5: High-Impact Features

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
