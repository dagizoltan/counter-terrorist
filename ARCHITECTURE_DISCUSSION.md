# Architecture Discussion: Cross-Platform Deno Security Orchestrator

This document outlines the proposed architecture for a unified endpoint security auditing and monitoring system. The goal is to provide a consistent, browser-manageable interface that leverages Deno's security and Rust's system-level capabilities.

## 1. System Overview

The system consists of three primary layers:
1.  **Deno Orchestrator (The "Brain"):** A backend server that manages the web-based GUI, handles configuration, and schedules/triggers security audits.
2.  **Rust Agents (The "Senses"):** Platform-specific binaries or libraries (compiled from Rust) that perform high-privilege system checks.
3.  **Browser GUI (The "Eyes"):** A reactive web interface for real-time monitoring, report generation, and system configuration.

## 2. Cross-Platform Bootstrapping

To handle the "first-start" requirement, we propose a `bootstrap.ts` module:

- **Dependency Check:** On startup, the Deno orchestrator checks for required platform-specific tools (e.g., `systemctl` on Linux, `system_profiler` on macOS, PowerShell modules on Windows).
- **Toolchain Management:** If Rust is required for compilation or specific plugins, the system can attempt to fetch pre-compiled binaries for the host architecture (aiding "simple" installation) or prompt for toolchain setup.
- **Auto-Configuration:** Initial runs will establish a baseline of the system's "clean" state.

## 3. Communication Model: Sidecar Binaries

The system will use **Option A: Sidecar Binaries**. Deno executes platform-specific Rust binaries via `Deno.Command`.

- **Pros:** Process isolation; if a scanner or blocking agent crashes, the orchestrator stays up; easier to update individual components; avoids complex FFI memory management.
- **Cons:** Slight overhead in process spawning.

## 4. Web-Based GUI Architecture

The GUI will be served directly by the Deno orchestrator:
- **Server:** **Hono** with **hono/jsx** for server-side rendering.
- **Interactivity:** **Native Web Components** will be used for "islands" of interactivity (e.g., real-time graphs, status indicators).
- **Real-time Updates:** **WebSockets** or **Server-Sent Events (SSE)** to stream scan results and monitoring logs to the browser.
- **State Management:** A local SQLite database (via `Deno.openKv` or a SQLite library) to store history, baselines, and configurations.

## 5. Security & Prevention Strategy

- **Deno Sandbox:** The orchestrator runs with restricted permissions (`--allow-net`, `--allow-read`, `--allow-run`) to maintain its own security posture.
- **Active Blocking & Inbound Defense:** The system will implement **Active Blocking** capabilities. This includes:
    - **Inbound Filtering:** Blocking unexpected incoming requests at the network level.
    - **Process Termination:** Killing suspicious processes identified by the Rust agents.
    - **Dynamic Firewalling:** Injecting temporary rules to block malicious IPs/domains.
    - **Real-time Quarantine:** Moving malicious files to isolated storage.
- **Privilege Escalation:** Only the specific Rust agents or sub-processes that *require* sudo/Admin privileges for blocking or deep system access will be granted them.

## 6. Hardening & Protection Pillars

To provide a complete security solution, the system includes:

### 6.1 Firewall Management
- **Automated Configuration:** The bootstrapper will ensure the host firewall (e.g., `ufw` on Linux, `PacketFilter` on macOS, Windows Firewall) is active and follows a "deny by default" inbound policy.
- **Service Whitelisting:** Automatic detection and management of rules for known safe services.

### 6.2 VPN & Secure Tunneling
- **Deployment:** The system can manage the lifecycle of a secure VPN client (e.g., WireGuard or OpenVPN).
- **Kill-Switch:** Implementing a software-based kill-switch to prevent data leakage if the VPN connection drops.

### 6.3 Antivirus & EDR Integration
- **Agent Orchestration:** Monitoring the status and health of the system's AV (e.g., Windows Defender, ClamAV) or installing/configuring open-source EDR agents.
- **Signature & Behavioral Analysis:** Combining traditional AV signatures with the system's own behavioral heuristics (via the Rust sidecars).

## 7. Project Structure

```text
security-system/
├── orchestrator/          # Deno Backend (Hono/Fresh)
│   ├── web/               # Frontend (HTML/JS/CSS)
│   ├── api/               # REST/WebSocket endpoints
│   └── bootstrapper.ts    # First-run & dependency logic
├── agents/                # Rust Source Code
│   ├── common/            # Shared Rust logic
│   ├── windows/           # Windows-specific sensors
│   ├── macos/             # macOS-specific sensors
│   └── linux/             # Linux-specific sensors
├── shared/                # Shared schemas (JSON/Protobuf)
└── config/                # System & Rule definitions
```

---

## Finalized Decisions

- **Architecture:** 3-tier (Deno Orchestrator, Rust Sidecars, Browser GUI).
- **Stack:** Deno, Hono/JSX, Native Web Components, Rust.
- **Core Feature:** Active Blocking & Real-time Monitoring.
- **Setup:** Automated bootstrapping for dependencies on first run.
