# Implementation Roadmap: Counter-Terrorist

This document defines the 6 milestones for the Counter-Terrorist security orchestrator.

## Milestone 1: Security Foundations (BLOCKING)
**Goal:** Implement critical security requirements before any other features.

- [ ] **Task 1.1:** Implement bearer authentication on all `/api/*` routes.
  - Touches: `orchestrator/main.ts`, `orchestrator/api/`
- [ ] **Task 1.2:** Add IP address validation to Rust blocker.
  - Touches: `agents/blocker/main.rs`
- [ ] **Task 1.3:** Add path validation to antivirus `scanPath` logic.
  - Touches: `orchestrator/protection/antivirus.ts`
- [ ] **Task 1.4:** Implement strict sidecar allowlist in `CommandManager`.
  - Touches: `orchestrator/command_manager.ts`

## Milestone 2: Scanner Daemon + Persistence
**Goal:** Transition to high-performance daemon model and persistent state.

- [ ] **Task 2.1:** Refactor scanner from one-shot to persistent daemon.
  - Touches: `agents/scanner/main.rs`
- [ ] **Task 2.2:** Refactor `CommandManager` to hold long-running process reference.
  - Touches: `orchestrator/command_manager.ts`
- [ ] **Task 2.3:** Migrate baseline service and audit history to Deno KV.
  - Touches: `orchestrator/services/baseline.ts`, `orchestrator/services/kv.ts`
- [ ] **Task 2.4:** Implement hash/path-based drift detection.
  - Touches: `orchestrator/services/baseline.ts`

## Milestone 3: Firewall + VPN Hardening
**Goal:** Complete network protection layer for Ubuntu.

- [ ] **Task 3.1:** Complete `ufw` integration (status, block, unblock).
  - Touches: `orchestrator/protection/firewall.ts`
- [ ] **Task 3.2:** Implement WireGuard connection management via `wg-quick`.
  - Touches: `orchestrator/protection/vpn.ts`
- [ ] **Task 3.3:** Implement VPN kill-switch via `ufw` rules.
  - Touches: `orchestrator/protection/vpn.ts`, `orchestrator/protection/firewall.ts`
- [ ] **Task 3.4:** Implement VPN health monitoring loop.
  - Touches: `orchestrator/protection/vpn.ts`

## Milestone 4: Dashboard Wiring + Deployment
**Goal:** Transition from stubs to real data and prepare for production.

- [ ] **Task 4.1:** Connect Hono dashboard and Web Components to real API data.
  - Touches: `orchestrator/views/`, `orchestrator/web/components/`
- [ ] **Task 4.2:** Create systemd service files (server and desktop user service).
  - Touches: `config/systemd/`
- [ ] **Task 4.3:** Create Nginx configuration template for TLS termination.
  - Touches: `config/nginx/`
- [ ] **Task 4.4:** Implement desktop shortcut generation in `bootstrapper.ts`.
  - Touches: `orchestrator/bootstrapper.ts`

## Milestone 5: AV + rkhunter
**Goal:** Integrate filesystem and rootkit scanning.

- [ ] **Task 5.1:** Implement ClamAV scheduled scan integration.
  - Touches: `orchestrator/protection/antivirus.ts`
- [ ] **Task 5.2:** Document custom signature sets and `freshclam` configuration.
  - Touches: `docs/AV_GUIDE.md`
- [ ] **Task 5.3:** Integrate `rkhunter` as a scanner plugin.
  - Touches: `agents/scanner/`, `orchestrator/protection/rkhunter.ts`
- [ ] **Task 5.4:** Implement quarantine directory logic for flagged files.
  - Touches: `orchestrator/protection/antivirus.ts`

## Milestone 6: Audit + Alerting
**Goal:** Historical tracking and notifications.

- [ ] **Task 6.1:** Implement persistent audit history in Deno KV.
  - Touches: `orchestrator/services/audit.ts`
- [ ] **Task 6.2:** Implement remote syslog forwarding.
  - Touches: `orchestrator/services/logging.ts`
- [ ] **Task 6.3:** Implement configurable webhook alerts.
  - Touches: `orchestrator/services/alerts.ts`
- [ ] **Task 6.4:** Implement exportable scan reports (JSON/PDF).
  - Touches: `orchestrator/api/reports.ts`
