# System Design

## Architecture Summary
Counter-Terrorist uses a three-tier architecture:

1. **Deno Orchestrator**
   - Core process that hosts the web dashboard, API, and service coordination.
   - Manages persistence in Deno KV and authorizes requests using bearer tokens.
   - Maintains long-running sidecar processes for scanner, eBPF, and honeypot components.

2. **Rust Sidecars**
   - Native binaries for privileged tasks such as scanning, firewall management, VPN control, and honeypot interactions.
   - Designed to run with minimal, narrow privileges and only execute approved commands.
   - Includes both persistent daemons and one-shot enforcement processes.

3. **Browser UI**
   - Server-side rendered Hono dashboard with Web Components and real-time event streaming.
   - Uses authenticated APIs and WebSockets for live status and alerts.

## Component Breakdown

### Orchestrator
- Hono-based web server for API and UI routes.
- Command manager for sidecar lifecycle and allowlisted execution.
- Services for baseline tracking, notifications, audit logs, VPN health, and firewall operations.

### Scanner Agent
- Persistent Rust daemon that avoids repeated startup overhead.
- Monitors process/state drift and supports scheduled scanning.

### Blocker Agent
- One-shot enforcement binary used for active containment.
- Validates IPs and applies firewall rules via `ufw`.

### Honeypot Sidecar
- Low-interaction traps for suspicious activity on common service ports and filesystem access.
- Emits structured JSON events consumed by the orchestrator.

## Security Design Principles
- **Defense in Depth:** Multiple layers of protection from API auth to OS-level blockers.
- **Least Privilege:** Only approved sidecars and commands may execute privileged actions.
- **Isolation:** Deno orchestrator is kept separate from privileged system agents.
- **Validation:** Input validation for tokens, IPs, filesystem paths, and sidecar commands.

## Deployment Model
- Orchestrator runs as a local service bound to `localhost`.
- Production deployment is expected behind an Nginx reverse proxy for TLS termination.
- Systemd units are used for service persistence and restart behavior.

## Data Flow
- UI events and status queries flow through authenticated API endpoints.
- Sidecar events are forwarded to the orchestrator and broadcast over WebSockets.
- Baselines and audit records are persisted in Deno KV.
- Active containment decisions are made by the orchestrator based on sidecar telemetry and policy logic.

## Previous
Back to `01_overview.md` for goals and success criteria.

## Next
Continue to `03_roadmap.md` for the implementation phases and timing.
