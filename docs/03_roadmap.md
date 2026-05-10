# Roadmap

## Current System State
The current codebase provides a functional orchestrator shell with working API endpoints and sidecar management. The remaining work is focused on completing integration, fixing existing security and UX gaps, and expanding the system with stable new features.

### Current status snapshot
- **Orchestrator core:** implemented and bootstrapped by `orchestrator/main.ts`.
- **Authentication:** present in code, but frontend token delivery must be validated.
- **Sidecar lifecycle:** persistent sidecar support exists; `ebpf` startup is attempted automatically.
- **Protection endpoints:** firewall, VPN, AV, and rkhunter APIs are available.
- **Dashboard routing:** login and root pages exist, but the UI wiring is incomplete.

## Fix roadmap: close current gaps
- **Fix 1:** Ensure `/login` is reachable and does not get blocked by auth middleware.
- **Fix 2:** Update frontend to send `Authorization: Bearer <token>` and WebSocket token query parameters.
- **Fix 3:** Harden antivirus path validation to reject prefix bypass and normalize paths.
- **Fix 4:** Add scanner daemon cache cleanup or eviction to prevent memory drift.
- **Fix 5:** Add better sidecar binary resolution and fallback paths for production packaging.
- **Fix 6:** Confirm that status endpoints report actual runtime state and reflect the current agent health.

## Feature roadmap: deliver working capabilities
- **Feature 1:** Wire the dashboard to real backend data for status, protection controls, and event streams.
- **Feature 2:** Add an auto-block engine that consumes honeypot alerts and creates firewall rules.
- **Feature 3:** Expose persistent audit and baseline drift history through secure API endpoints.
- **Feature 4:** Package the system with `systemd` service files and TLS-ready reverse proxy templates.
- **Feature 5:** Add configurable webhook alerts and remote notification support.

## Phase 1: Security Foundations & Cross-Platform Core
- Enforce API bearer authentication on all `/api/*` routes. (COMPLETED)
- Implement strict sidecar allowlisting in `SystemExecutor`. (COMPLETED)
- Add IP validation to the blocker agent and path sanitization in antivirus scans. (COMPLETED)
- Harden the orchestrator to run with minimal privileges. (COMPLETED)
- Implement Move-before-Verify pattern for sidecar integrity. (COMPLETED)
- **Cross-Platform Bridge**: Initial support for macOS SEP and Windows NCrypt. (COMPLETED)

## Phase 2: Persistence & Daemon Model
- Transition the scanner to a persistent Rust daemon.
- Update the orchestrator to maintain persistent sidecar references and handle streaming JSON.
- Persist baselines and audit history in Deno KV.
- Implement hash-and-path drift detection.

## Phase 3: Network Protection & Ring 0 Enforcement
- Implement `ufw` firewall controls and default deny policies.
- Add WireGuard management and kill-switch support.
- Ensure VPN health monitoring and firewall integration.
- **Multi-OS Agents**: Deep integration with macOS ESF and Windows WFP for kernel-level enforcement.

## Phase 4: UI Integration & Deployment
- Replace mock UI data with real backend API wiring.
- Wire WebSocket events to dashboard components.
- Add production service definitions for `systemd` and TLS-ready Nginx templates.

## Phase 5: Scanning & Detection
- Integrate ClamAV scheduled scanning and optional quarantine.
- Add rootkit detection support (e.g. `rkhunter`).
- Continue refining honeypot telemetry and behavioral detection.

## Phase 6: Alerting & Reporting
- Expose secure audit history and report exports.
- Implement webhook and notification dispatching.
- Enable alerting for high-priority events and anomalous drift.

## 72-Hour Sting Plan
- Day 1: Deploy honeypot traps and capture attacker interaction.
- Day 2: Wire auto-blocking and notification flows.
- Day 3: Harden deployment with `systemd` and clean-state baselining.

## Evaluation Path
- Validate frontend auth and WebSocket integration.
- Fix any persistent agent memory leaks or state-bloat issues.
- Confirm TLS, service persistence, and secure deployment before pilot testing.

## Previous
Back to `02_system_design.md` for architecture and component flow.

## Next
Continue to `04_security_strategy.md` for threat and validation guidance.
