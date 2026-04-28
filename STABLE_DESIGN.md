# Counter-Terrorist: Honeypot & Orchestrator System Design

This document outlines the stabilized system architecture and development roadmap for the Counter-Terrorist orchestrator. The objective is to define a concrete, unchanging system design so that future development efforts are strictly focused on *implementation* rather than architectural redesigns.

---

## 1. System Architecture (Stable Design)

The system is built on a hybrid architecture combining the safety of a V8 JS sandbox with the performance of native systems programming.

### 1.1 Core Components

*   **Deno Orchestrator (`orchestrator/`)**: The central brain. It runs with least-privilege (where possible) and handles HTTP APIs, WebSockets, state persistence (via Deno KV), and plugin management.
*   **Rust Sidecars (`agents/`)**: High-performance, low-level agents that interface directly with the OS.
    *   *Scanner*: A persistent daemon that continuously monitors running processes, calculates binary hashes, and reports system state.
    *   *Blocker*: A one-shot binary used for immediate, high-privilege remediation (e.g., modifying `ufw` rules or killing PIDs).
*   **Plugin Manager (`orchestrator/plugins/`)**: A modular subsystem specifically designed for extending the orchestrator with active deception modules (Honeypots). It provides a standard lifecycle (`start()`, `stop()`, `status()`) for all lures.
*   **Web Dashboard (`orchestrator/views/`, `public/`)**: A Server-Side Rendered (SSR) Hono + JSX application providing real-time visibility via WebSockets and REST APIs.

### 1.2 Data Flow & Communication

1.  **UI to Orchestrator**: REST API calls authenticated via strict, `httpOnly` secure session cookies. Real-time events are streamed via WebSockets.
2.  **Orchestrator to Sidecars**: Communication happens exclusively over `stdin`/`stdout` using line-buffered JSON. This eliminates the need for internal network sockets and isolates the sidecars from network-based attacks.
3.  **Honeypot to Orchestrator**: Plugins run within the Deno context (or spawn external processes) and utilize the central `broadcast()` event bus to trigger `CRITICAL` intrusion alerts when interacted with.
4.  **Telemetry to External System (Target Design)**: All significant events (drift, honeypot hits, audit logs) must be pushed off-device via Remote Syslog (RFC 5424) or secure webhooks to ensure immutability.

---

## 2. Development Roadmap to Deployment

This roadmap defines the phases required to take the system from a development project to a production-ready sensor.

### Phase 1: Architecture Stabilization (Complete)
*Objective: Establish the core framework, fix critical bugs, and implement the plugin system.*
*   [x] Transition from insecure token injection to strict Session Cookies.
*   [x] Fix Antivirus path traversal and Rust scanner memory leaks.
*   [x] Implement the `PluginManager` architecture.
*   [x] Deploy the initial `HttpHoneypot` lure.

### Phase 2: The "Ready for Connection" Milestone (Implementation Focus)
*Objective: Implement the necessary telemetry and capture mechanisms required to securely expose the device to a hostile network.*
*   **Requirement 1: Immutable Telemetry (Syslog Forwarding).** Implement a service that streams all Deno logs and KV audit events to a remote server. If the honeypot is compromised and wiped, the data must survive.
*   **Requirement 2: Full Packet Capture (PCAP).** Implement a sidecar or service that hooks into `tcpdump` or Suricata to record the raw network traffic (the "How") leading up to a honeypot hit or baseline drift (the "What").
*   **Requirement 3: Expanded Lure Portfolio.** Implement `ssh_honeypot` and `redis_honeypot` plugins to attract automated scanners.
*   **Go/No-Go Decision:** Once Requirements 1 and 2 are implemented, the device is considered **"Ready for Connection"** and can be deployed in a segmented DMZ for live pilot trials.

### Phase 3: Advanced Analysis & Hardening (Post-Connection)
*Objective: Increase the sophistication of the system based on data gathered during pilot trials.*
*   **Behavioral Monitoring**: Enhance the Rust scanner to track behavioral baselines (CPU/Mem/IO over time) to detect fileless malware.
*   **eBPF Integration**: Transition process monitoring from polling `/proc` (sysinfo) to event-driven eBPF hooks for perfect visibility into syscalls.
*   **Automated Containment**: Allow the orchestrator to automatically trigger the Blocker sidecar (killing PIDs or dropping IPs) when specific behavioral thresholds are breached.

### Phase 4: Enterprise Scale
*Objective: Prepare the orchestrator for multi-node deployments.*
*   **Centralized Fleet Management**: Shift state from local Deno KV to a central database.
*   **RBAC**: Implement granular Role-Based Access Control for dashboard users.

---

## 3. Implementation Directives

For all future development on Phases 2-4:
1.  **Do not alter the Core Architecture (Section 1.1) unless absolutely necessary.**
2.  **All new deception capabilities must be implemented as Plugins.**
3.  **All new OS-level monitoring must be implemented in Rust Sidecars.**
