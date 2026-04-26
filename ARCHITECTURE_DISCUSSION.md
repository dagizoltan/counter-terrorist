# Architecture Discussion: Counter-Terrorist Security Orchestrator

This document outlines the finalized architecture for "Counter-Terrorist," a security auditing and monitoring system designed for Ubuntu LTS.

## 1. System Overview

Counter-Terrorist is a three-tier security orchestrator:
1.  **Deno Orchestrator (Primary Process):** Manages the web-based GUI, persistence, and coordinates with sidecar agents.
2.  **Rust Sidecars (System Agents):** Platform-native binaries that perform high-privilege system checks and enforcement.
3.  **Browser GUI (Management Interface):** A server-side rendered (SSR) dashboard with reactive frontend islands.

## 2. Platform Target

The system is exclusively targeted at **Ubuntu 24.04 / 26.04 LTS**.
Cross-platform support (macOS/Windows) is explicitly deferred to future architectural phases and is not part of the initial implementation milestone.

## 3. Runtime & Stack

- **Backend:** [Deno](https://deno.com/) runtime for the orchestrator.
- **Web Framework:** [Hono](https://hono.dev/) with `hono/jsx` for SSR.
- **Frontend:** Native Web Components for interactive elements (no heavy frameworks).
- **Sidecars:** Rust binaries executed via `Deno.Command`.
- **Persistence:** **Deno KV** for all state, including baselines and audit history.
- **Real-time:** WebSockets for event streaming, with Server-Sent Events (SSE) as a fallback.

## 4. Agent Models

### 4.1 Scanner Agent (Persistent Daemon)
Unlike traditional one-shot scanners, the Rust scanner runs as a **persistent daemon**.
- It maintains a long-running process to eliminate `System::new_all()` overhead and CPU spikes associated with frequent restarts.
- It communicates via JSON over stdin (commands) and stdout (results) in a continuous loop.
- The `CommandManager` in Deno holds a persistent reference to this process.
- **Scan Interval:** Default is 60 seconds for desktop environments (configurable for servers).

### 4.2 Blocker Agent (One-shot)
The blocker remains a **one-shot, short-lived process**.
- It is intentionally stateless.
- It is spawned only when an active block is triggered.
- It runs with elevated privileges only for the duration of the enforcement action.

## 5. Security Requirements

The following security measures are mandatory for the implementation:

1.  **Bearer Authentication:** All `/api/*` routes must require a bearer token provided via environment variables.
2.  **IP Validation:** The Rust blocker must validate IP addresses (using `ip.parse::<std::net::IpAddr>().is_ok()`) before executing any firewall commands.
3.  **Path Validation:** Strict path validation is required before any filesystem operations (e.g., antivirus `scanPath`).
4.  **Sidecar Allowlist:** The `CommandManager` must implement a strict allowlist; only "scanner" and "blocker" binaries are permitted.
5.  **Localhost Binding:** The Hono server must bind to `localhost` only. Nginx is used for TLS termination and external access.
6.  **TLS Encryption:** Self-signed TLS is required even for local development (Milestone 2).
7.  **WebSocket Security:** The WebSocket endpoint requires the auth token as a query parameter upon connection.

## 6. Protection Pillars (Ubuntu Only)

### 6.1 Firewall (ufw)
- Management of `ufw` (Uncomplicated Firewall).
- Default-deny inbound policy.
- Support for active blocking and unblocking of IPs.

### 6.2 VPN (WireGuard)
- Management via `wg-quick`.
- Implementation of a kill-switch using `ufw` (default-deny, allow via `wg0` only).
- Continuous VPN health monitoring loop.

### 6.3 Antivirus (ClamAV)
- **Scheduled Scans:** Desktop deployment uses scheduled scans only. `clamonacc` (on-access) is avoided to preserve performance.
- **On-Access:** Optional for server deployments, disabled by default.
- **Scope:** Scans are scoped to high-risk directories: `/tmp`, `/var/tmp`, and `~/Downloads`.
- **Detection Rate:** It must be noted that ClamAV has a limited detection rate (approx. 60% on general malware). This system is not a replacement for enterprise EDR.

### 6.4 Baseline Service
- System state baselines are persisted to Deno KV.
- **Drift Detection:** Compares both process hashes and paths, not just process names.
- Baselines are resilient to orchestrator restarts.

## 7. Performance Profile

- **Orchestrator Idle RAM:** 30-50MB.
- **Scanner Daemon Idle RAM:** 8-15MB.
- **Total Sustained Footprint:** ~40-65MB.
- **CPU Usage:** Near-zero between scan intervals (60s cadence).
- **WebSocket Efficiency:** Broadcasts must wrap `client.send()` in try/catch and prune dead clients from the `Set<WSContext>`.

## 8. Deployment

### 8.1 Server
- Deployed as a `systemd` service.
- Binds to `localhost`.
- Requires Nginx reverse proxy for TLS termination.

### 8.2 Desktop
- Deployed as a `systemd` user service.
- Configured to auto-start on login.
- Includes a desktop shortcut that opens the default browser to the dashboard. No system tray is required for v1.

## 9. Future Phases

- Support for other Linux distributions.
- Potential cross-platform support for macOS (PacketFilter/launchd) and Windows (Windows Firewall/Services).
- Integration with remote logging and alerting providers.
