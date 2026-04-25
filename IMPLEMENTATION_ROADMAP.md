# Exact Implementation Roadmap: Security Orchestrator

This roadmap provides the granular steps for developing the Deno-based security system.

## Milestone 1: Core Orchestrator & Bootstrapping
**Goal:** Establish the process foundation and environment verification.

- [ ] **Task 1.1:** Initialize the project structure.
  - `mkdir orchestrator agents shared config`
- [ ] **Task 1.2:** Implement `orchestrator/bootstrapper.ts`.
  - [ ] OS detection logic.
  - [ ] Binary existence checks (`cargo`, `ufw`, `powershell`).
  - [ ] Permission check logic (check for sudo/admin).
- [ ] **Task 1.3:** Implement `orchestrator/command_manager.ts`.
  - [ ] A wrapper for `Deno.Command` to execute sidecars with consistent JSON I/O.

## Milestone 2: Hono Web Console (SSR + JSX)
**Goal:** Provide the management interface.

- [ ] **Task 2.1:** Setup `orchestrator/main.ts` with Hono.
  - [ ] Root route rendering `orchestrator/views/Dashboard.tsx`.
- [ ] **Task 2.2:** Create `orchestrator/views/Layout.tsx`.
  - [ ] Base HTML with Tailwind CSS (CDN for simplicity) and Web Component definitions.
- [ ] **Task 2.3:** Implement `orchestrator/api/ws.ts`.
  - [ ] WebSocket handler for real-time log streaming.

## Milestone 3: Rust Sidecar Agents (The Sensors)
**Goal:** Native system access.

- [ ] **Task 3.1:** Setup `agents/Cargo.toml` as a workspace.
- [ ] **Task 3.2:** Implement `agents/scanner/main.rs`.
  - [ ] Basic process and port scanning.
  - [ ] Output formatted as JSON to stdout.
- [ ] **Task 3.3:** Implement `agents/blocker/main.rs`.
  - [ ] High-privilege binary for process termination and firewall rule injection.

## Milestone 4: Active Blocking & Hardening Pillars
**Goal:** Real-time protection.

- [ ] **Task 4.1:** Implement `orchestrator/protection/firewall.ts`.
  - [ ] Abstraction layer for `ufw` (Linux) and `netsh` (Windows).
- [ ] **Task 4.2:** Implement `orchestrator/protection/vpn.ts`.
  - [ ] Integration with `wg-quick` for WireGuard management.
- [ ] **Task 4.3:** Implement `orchestrator/protection/antivirus.ts`.
  - [ ] Health monitoring for Windows Defender/ClamAV.

## Milestone 5: Frontend Islands (Web Components)
**Goal:** Reactive UI without a heavy framework.

- [ ] **Task 5.1:** Create `orchestrator/web/components/StatusIndicator.js`.
  - [ ] Native Web Component to show real-time agent health.
- [ ] **Task 5.2:** Create `orchestrator/web/components/BlockingLog.js`.
  - [ ] Reactive list of recently blocked requests/processes.

## Milestone 6: Deployment & Baseline
**Goal:** Final integration.

- [ ] **Task 6.1:** Implement baseline drift detection in `orchestrator/services/baseline.ts`.
- [ ] **Task 6.2:** Create a `deno.json` with tasks:
  - `deno task start`: Runs the orchestrator.
  - `deno task build-agents`: Compiles Rust binaries.
