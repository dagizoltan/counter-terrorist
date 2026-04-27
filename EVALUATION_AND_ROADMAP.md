# Evaluation and Roadmap: Counter-Terrorist Security Orchestrator

## 1. Executive Summary

This document provides a comprehensive evaluation of the "Counter-Terrorist" security orchestrator. After reverse-engineering the current codebase, we have identified several critical blockers that must be resolved before the solution is ready for first production-ready pilot trials. While the foundation is solid, there are significant discrepancies between the intended architecture and the current implementation, particularly regarding agent persistence and data integrity.

## 2. Reverse Engineering Findings

### 2.1 Orchestrator (Deno + Hono)
- **Status:** Functional but incomplete integration.
- **Authentication:** Bearer token authentication is implemented for `/api/*` routes. WebSocket authentication via query parameters is also present as per requirements.
- **Sidecar Management:** The `CommandManager` includes logic for both one-shot and persistent sidecars, but the integration with the `Scanner` agent currently treats it as a one-shot process.
- **Baseline Service:** The service is designed to detect drift using process paths and hashes, but it currently receives neither from the scanner agent, rendering drift detection ineffective.

### 2.2 Scanner Agent (Rust)
- **Status:** **PHASE 1 COMPLETE.**
- **Implementation:** The scanner is now a **persistent daemon** integrated with the Orchestrator. This eliminates `sysinfo` overhead and allows for efficient, real-time monitoring.
- **Data Enrichment:** The agent provides `exe_path` and SHA-256 `hash` for all processes.
- **Security:** The hash cache uses file modification time (mtime) invalidation to detect unauthorized binary changes.

### 2.3 Blocker Agent (Rust)
- **Status:** Functional.
- **Implementation:** Correctly implements one-shot execution for `KillProcess` and `BlockIp` (via `ufw`). It includes necessary IP validation.

### 2.4 Protection Pillars
- **Firewall:** Integrated with `ufw`.
- **VPN:** Logic for `wg-quick` exists but lacks comprehensive error handling and status verification.
- **Antivirus:** `clamscan` integration is implemented but path validation is restricted to a few directories.

## 3. Critical Blockers for Production

| Blocker ID | Priority | Description | Impact | Status |
| :--- | :--- | :--- | :--- | :--- |
| **B-01** | **Highest** | Scanner is not a persistent daemon. | High CPU/IO overhead on every scan interval. | **RESOLVED** |
| **B-02** | **High** | Missing Process Hashing. | Baseline drift detection cannot identify if a binary has been replaced. | **RESOLVED** |
| **B-03** | **High** | Missing Executable Paths. | Orchestrator cannot verify the origin of running processes. | **RESOLVED** |
| **B-04** | **Medium** | Hardcoded/Default Secrets. | "development-token" is used as a fallback, which is unsafe for production. | **RESOLVED** |
| **B-05** | **Medium** | Limited Error Resilience. | Orchestrator does not gracefully handle sidecar crashes or restarts. | **RESOLVED** |

## 4. Security Audit Findings
- **Positive:** Input validation for IPs and Paths is present in the orchestrator.
- **Risk:** The use of `Deno.Command` with `piped` stdin/stdout requires careful handling of the communication protocol to prevent injection if the scanner were to ever process untrusted external input (currently it only processes internal commands).
- **Risk:** TLS termination is deferred to Nginx, but internal communication between Deno and Sidecars is unencrypted (though local to the machine).

## 5. Roadmap to Pilot Trials

### Phase 1: Core Hardening (Immediate)
- **Scanner Refactoring:** Convert the Rust scanner into a persistent daemon that communicates via JSON over stdin/stdout.
- **Data Enrichment:** Update the scanner to include `exe_path` and a SHA-256 `hash` for every process.
- **Baseline Alignment:** Update the Deno `BaselineService` to utilize the enriched data for drift detection.

### Phase 2: Reliability & Visibility (Short-term)
- **Health Checks:** Implement automated sidecar health monitoring and auto-restart logic in the Orchestrator.
- **Extended Auditing:** Add support for monitoring listening ports drift (currently partially implemented).
- **UI Enhancements:** Provide a detailed view of detected drift in the dashboard.

### Phase 3: Production Readiness (Pre-Pilot) - IN PROGRESS
- **Configuration Management:** Hardened `API_TOKEN` enforcement implemented. Template for `orchestrator.env` provided.
- **Deployment Scripting:** `systemd` unit files finalized in `deployment/systemd/`.
- **Automated Packaging:** `scripts/package.ts` added to automate artifact collection.
- **Distribution:** `.deb` package structure drafted in `deployment/debian/`.
- **Protection Pillars Hardening:** `vpn.ts` and `antivirus.ts` enhanced with production-grade error handling.

## 6. Conclusion
The "Counter-Terrorist" project has a strong architectural vision. By resolving the identified blockers—specifically the scanner persistence and data enrichment—the system will provide a robust security layer suitable for the first production pilots.
