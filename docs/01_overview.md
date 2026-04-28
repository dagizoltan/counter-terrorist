# Overview

## Problem Statement
The system must protect Ubuntu endpoints against targeted threats while remaining lightweight, auditable, and easy to deploy. The key challenge is providing detection, containment, and monitoring without introducing excessive complexity or expanding the attack surface.

## Solution Summary
Counter-Terrorist is a purpose-built Ubuntu security orchestrator. It combines:
- a secure Deno orchestrator for API, dashboard, and coordination,
- native Rust sidecars for privileged actions such as scanning, firewall control, VPN management, and honeypot trapping,
- a web-based dashboard for real-time visibility and alerting.

## Goals
- Protect Ubuntu 24.04 / 26.04 endpoints.
- Keep the orchestrator footprint minimal and performance-friendly.
- Isolate privileged actions into audited Rust sidecars.
- Detect attacker behavior quickly through honeypots and behavioral monitoring.
- Contain threats automatically with firewall and VPN controls.
- Maintain a clear, linear roadmap from secure foundation to production readiness.

## Success Criteria
- API and UI are fully authenticated and secure.
- Sidecar execution is allowlisted and audited.
- Scanner and honeypot telemetry are available in real time.
- Firewall and VPN actions execute reliably on Ubuntu.
- Deployment includes service persistence (`systemd`) and TLS-ready architecture.

## Current Implementation State
The system is partially implemented in working code, but there is a gap between backend capabilities and dashboard integration. The orchestrator, sidecar manager, and protection APIs exist, while the remaining work is around secure UI access, state reporting, and reliability hardening.

### What is implemented now
- **Deno orchestrator:** Hono server, login route, auth middleware, static asset handling.
- **Sidecar lifecycle:** `CommandManager` supports allowlisted sidecars, persistent daemon startup, and JSON event streaming.
- **Protection APIs:** status, firewall block/unblock, VPN status, antivirus status, and rkhunter scan endpoints are defined.
- **Real-time model:** backend event broadcast hooks are wired into sidecar stdout readers.

### What still needs to be fixed
- **UI/API token wiring:** frontend must be updated to send bearer tokens and WebSocket auth values.
- **Login flow:** the auth middleware may prevent `/login` access.
- **Path validation:** antivirus path checks need exact boundary validation.
- **Scanner resource cleanup:** persistent scanning caches need eviction logic.
- **Dashboard wiring:** UI components are not fully connected to live backend state.

## How to use this document set
Read the numbered summaries in order: `01_overview.md`, `02_system_design.md`, `03_roadmap.md`, `04_security_strategy.md`, `05_handover.md`. Then use the detailed docs in the matching numbered folders for reference.

## Next
Continue to `02_system_design.md` for the architecture and component responsibilities.

## Next
Continue to `02_system_design.md` for the architecture and component responsibilities.
