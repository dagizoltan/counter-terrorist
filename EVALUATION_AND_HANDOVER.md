# Senior Security & Systems Engineering Evaluation

## 1. Project Evaluation: Counter-Terrorist Orchestrator

### 1.1 Architectural Integrity
*   **Hybrid Implementation:** The combination of **Deno** (for high-level orchestration and web APIs) and **Rust** (for high-performance, native sidecar agents) is a major strength. It provides the memory safety of Deno's V8 sandbox with the low-level system access required for deep security monitoring.
*   **IPC Isolation:** The choice to use line-buffered JSON over `stdin`/`stdout` for sidecar communication is a high-security decision. It eliminates the risk of local port exploitation or internal network eavesdropping, effectively making the orchestrator the sole arbiter of system actions.
*   **Deception Strategy:** The plugin-based honeypot system is elegant and scalable. By broadcasting intrusion events through a central Deno event bus, the system can coordinate complex, automated responses (e.g., blocking an IP across all nodes) instantly.

### 1.2 Actual State Assessment
*   **Status:** Late Prototype / Pre-Pilot (Hardening Phase).
*   **Strengths:** Core scanning, blocking, and honeypot logic are functional. Critical early-stage risks (scanner memory leaks and AV path traversal) have been addressed in the source code.
*   **Technical Debt:** The system currently suffers from **Integration Regressions**. The frontend (Web Components) is currently out-of-sync with the backend's strict Bearer/Cookie authentication middleware. This results in 401 Unauthorized errors for many UI-driven actions (e.g., setting baselines or manual IP blocking).
*   **Telemetry Gap:** While a logging service exists, it is not yet fully RFC 5424 compliant and lacks a robust remote sink for immutable evidence gathering.

---

## 2. Prioritized Roadmap for "Ready for Connection"

1.  **Unified Authentication Handshake:** Synchronize the Hono middleware with the Web Components. Ensure the `API_TOKEN` or Session Cookie is correctly propagated in all `fetch` and `WebSocket` requests (specifically addressing the missing `?token=` parameter).
2.  **Telemetry Survivability (RFC 5424):** Implement a high-priority "Log-and-Forward" buffer. Ensure that critical security events are flushed to a remote syslog host with a retry-on-failure mechanism to ensure evidence persists even if the local host is compromised.
3.  **Sidecar Resilience (Dead Man's Switch):** Implement mutual monitoring where the Rust sidecars verify the health of the Deno orchestrator. If the orchestrator is killed or hung, the sidecar should trigger a "Failsafe Lockdown" of the firewall.
4.  **PCAP Lifecycle Integration:** Fully integrate the raw packet capture agent into the UI and event bus, allowing for automated, targeted captures when a honeypot lure is touched.
5.  **Mesh mDNS/mTLS Implementation:** Enable zero-config discovery for multi-node deployments to share threat intelligence and blacklists autonomously.

---

## 3. Agent Execution Prompt

**Role:** Senior Security Systems Engineer (Implementation Specialist)

**Context:**
You are taking over the "Counter-Terrorist" project—a high-performance security orchestrator for Ubuntu. The system uses a Deno brain and multiple Rust sidecars. While the core "monitoring and blocking" logic is sound, the system requires integration hardening and telemetry immutability to be considered "Ready for Connection."

**Objective:**
Harden the project for its first production pilot trial. Your focus is on authentication synchronization, telemetry survivability, and system-level resilience.

**Key Tasks:**
1.  **Auth Integration:** Audit `orchestrator/main.ts` and `public/components/`. Ensure all UI-driven API and WebSocket requests correctly handle Bearer/Cookie authentication.
2.  **Hardened Telemetry:** Upgrade `services/logging.ts` to be RFC 5424 compliant. Implement a robust remote syslog forwarding mechanism that ensures critical events reach their destination.
3.  **Sidecar Resilience:** Add a "Dead Man's Switch" to the Rust scanner. If the scanner detects the orchestrator process has been terminated, it must command the firewall to enter a "Locked" state.
4.  **Automated Forensics:** Link the PCAP manager to the plugin event bus. A `CRITICAL` honeypot hit should automatically trigger a 60-second packet capture on the relevant interface.
5.  **Standardize Plugins:** Finalize the refactoring of Firewall and VPN components into the modular `Plugin` framework.

**Constraints:**
- Maintain zero-socket IPC (stdin/stdout JSON) for all sidecars.
- No new heavy dependencies; stick to Deno standard and lightweight Rust crates.
- Ensure all filesystem operations are TOCTOU-safe.
- Maintain a stealth profile (masquerade process names in the OS list).
