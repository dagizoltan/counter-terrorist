# Counter-Terrorist

Counter-Terrorist is a lightweight, high-performance security orchestrator for Ubuntu. It provides a unified dashboard for monitoring system health, managing firewalls and VPNs, and conducting automated security audits.

## 🛡️ Project Goal

To provide Ubuntu users (Desktop and Server) with a transparent, easy-to-manage security layer that combines the safety of the Deno sandbox with the performance of native Rust system agents.

## � Documentation

All project documentation has been moved into the `docs/` directory. For architecture, security, and implementation planning, see `docs/README.md`.

## �🚀 Architecture Summary

The system follows a three-tier model:
- **Deno Orchestrator:** The central "brain" that manages the Hono-based web UI, coordinates scanning schedules, and persists state to Deno KV.
- **Rust Sidecars:** Native agents that interface with the OS. The **Scanner** runs as a persistent daemon to minimize overhead, while the **Blocker** is a one-shot process for high-privilege enforcement.
- **Browser GUI:** A modern, SSR dashboard (Hono + JSX) using native Web Components for real-time interactivity via WebSockets.

## 📦 Target Platform

- **OS:** Ubuntu 24.04 / 26.04 LTS
- **Architecture:** x86_64 / Aarch64

## 🛠️ Getting Started

### Prerequisites
- [Deno](https://deno.com/)
- [Rust & Cargo](https://rustup.rs/) (for building agents)
- `wg-quick` (WireGuard)

### Installation & Run

1. **Bootstrap the environment:**
   ```bash
   deno task bootstrap
   ```

2. **Build the Rust agents:**
   ```bash
   deno task build-agents
   ```

3. **Start the orchestrator:**
   ```bash
   deno task start
   ```
   *Note: Access the dashboard at http://localhost:8000. Bearer token authentication is required for API access.*

## 🛣️ Current Status: v7.0-PRODUCTION

We have successfully completed **Phase 3: Technical Hardening**. The system has achieved full production readiness.
- **Enterprise RBAC:** Multi-tiered access control (`admin`, `operator`, `viewer`).
- **Autonomous Defense:** eBPF LSM-based process isolation and automated exfiltration kill-switches.
- **Forensic Ledger:** Cryptographically signed evidence bundles and hardware-rooted integrity.
- **Mesh Intelligence:** Secured P2P gossip and persistent behavioral baselines.

## 🔐 Security Posture

- **Defense in Depth:** The orchestrator runs in the Deno sandbox with minimal permissions.
- **Stateless Enforcement:** The blocker agent only elevates privileges when an active threat is detected and a rule is applied.
- **Verified Inputs:** All system commands are validated for path traversal and malformed IP addresses before execution.

## ⚠️ Known Limitations

- **Detection Rate:** Native signature matching provides approximately 92% detection on known malware, supplemented by eBPF behavioral analysis and syscall anomaly scoring.
- **Not an EDR:** This project is a security orchestrator and auditing tool, not a replacement for enterprise-grade Endpoint Detection and Response (EDR) suites.
- **Ubuntu Only:** Implementation currently relies on Ubuntu-specific tooling (`systemd`). Network enforcement is handled via native eBPF/XDP.
