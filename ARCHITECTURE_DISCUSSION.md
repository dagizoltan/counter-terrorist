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

## 3. Communication Model

We have two primary options for Deno <-> Rust integration:

### Option A: Sidecar Binaries (Recommended for Isolation)
Deno executes platform-specific Rust binaries via `Deno.Command`.
- **Pros:** Process isolation; if a scanner crashes, the orchestrator stays up; easier to update individual components.
- **Cons:** Slight overhead in process spawning.

### Option B: Foreign Function Interface (FFI)
Deno calls Rust functions directly via `.so`/`.dylib`/`.dll` files.
- **Pros:** Extremely fast; high-performance data exchange.
- **Cons:** More complex memory management; less isolation.

## 4. Web-Based GUI Architecture

The GUI will be served directly by the Deno orchestrator:
- **Server:** Using a lightweight framework like **Hono** or **Fresh**.
- **Real-time Updates:** **WebSockets** or **Server-Sent Events (SSE)** to stream scan results and monitoring logs to the browser.
- **State Management:** A local SQLite database (via `Deno.openKv` or a SQLite library) to store history, baselines, and configurations.

## 5. Security Strategy

- **Deno Sandbox:** The orchestrator runs with restricted permissions (`--allow-net`, `--allow-read`, `--allow-run`) to maintain its own security posture.
- **Privilege Escalation:** Only the specific Rust agents or sub-processes that *require* sudo/Admin privileges will be granted them, following the principle of least privilege.
- **Monitoring vs. Prevention:** The system will transition from periodic auditing to continuous monitoring by observing file changes (using Deno's `watchFs`) and network connections.

## 6. Project Structure

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

## Discussion Points for the User

1.  **Deployment Preference:** Do you prefer the Rust components to be shipped as pre-compiled "sidecar" binaries, or should the system attempt to compile them from source during bootstrapping?
2.  **UI Complexity:** Do you envision a full-featured dashboard (React/Vue style) or a more minimal, utility-focused interface (HTMX)?
3.  **Integration level:** Should the "prevention" aspect involve active blocking (e.g., firewall rule injection) or strictly focus on alerting and remediation guidance?
