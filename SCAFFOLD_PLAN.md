# Scaffold Plan: Counter-Terrorist

This plan outlines the phase-by-phase implementation of the Counter-Terrorist orchestrator, following the prioritized milestones.

## Phase 1: Security Hardening (Blocking)
Before any functional features are expanded, the core security posture must be established.

1.  **API Authentication:**
    - Integrate middleware in Hono to check for `Authorization: Bearer <token>` on all `/api/*` routes.
2.  **Sidecar Security:**
    - Update `CommandManager` with a `const ALLOWED_SIDECARS = ["scanner", "blocker"]` check.
    - Implement IP validation in `agents/blocker/main.rs` using `std::net::IpAddr`.
3.  **Path Sanitization:**
    - Implement a utility function to validate and sanitize paths in `orchestrator/protection/antivirus.ts` to prevent directory traversal or unauthorized access during scans.

## Phase 2: Persistence & Daemon Transition
Moving from volatile state and one-shot processes to a persistent, efficient model.

1.  **Deno KV Migration:**
    - Initialize Deno KV and migrate the baseline service to use it.
    - Implement the audit history service backed by Deno KV.
2.  **Scanner Daemon Architecture:**
    - Refactor the Rust scanner to use a `loop { ... }` that reads from `stdin` and writes to `stdout`.
    - Update `CommandManager` to maintain a persistent child process and handle I/O streams for the scanner.
3.  **Enhanced Drift Detection:**
    - Update the baseline logic to calculate and store SHA-256 hashes of process binaries.
    - Compare both the path and the hash during drift detection cycles.

## Phase 3: Network Protection (Ubuntu)
Implementation of the core firewall and VPN pillars.

1.  **UFW Integration:**
    - Implement a wrapper for `ufw` commands.
    - Set the default policy to `deny` for inbound traffic.
2.  **WireGuard & Kill-switch:**
    - Implement `wg-quick` controls.
    - Implement the "kill-switch" by ensuring `ufw` only allows traffic through the `wg0` interface when the VPN is active.

## Phase 4: UI Integration & Deployment
Connecting the frontend to the hardened backend and preparing for OS-level deployment.

1.  **Dashboard Data Wiring:**
    - Replace all `setTimeout` stubs and mock data with real fetch calls to the authenticated API.
    - Connect Web Component "islands" to the WebSocket event stream.
2.  **Systemd Services:**
    - Author `counter-terrorist.service` for system-wide server deployment.
    - Author `counter-terrorist-user.service` for desktop user-session deployment.
3.  **Production Readiness:**
    - Setup Nginx configuration templates for TLS.
    - Implement the "Add to Startup" logic in the bootstrapper for desktop users.

## Phase 5: Advanced Scanning (AV & Rootkits)
Integrating external security tools into the orchestration flow.

1.  **ClamAV Integration:**
    - Implement scheduled scan triggers.
    - Scoped scanning for high-risk directories (`/tmp`, etc.).
2.  **Rootkit Detection:**
    - Integrate `rkhunter` output parsing into the scanner daemon's reporting flow.

## Phase 6: Reporting & Alerts
Finalizing the observability of the system.

1.  **Alerting System:**
    - Implement a webhook dispatcher for critical security events.
2.  **Audit Logs:**
    - Expose the Deno KV audit history through a secure API endpoint.
    - Implement a basic report generator.
