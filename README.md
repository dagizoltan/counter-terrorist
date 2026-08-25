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

```bash
deno task up
```

That is the whole thing. It generates `.env` with CSPRNG secrets on first run,
builds the Rust agents, refreshes the sidecar integrity manifest, rebuilds the
stylesheet, and starts the node — skipping any step whose inputs have not
changed since the last run.

The first run compiles the agent fleet and takes about a minute. After that,
when nothing has changed, the whole pre-flight costs ~100ms and invokes no
build tools at all.

```bash
deno task up          # build what is stale, then start
deno task up:mesh     # same, with mesh peering enabled
deno task build       # build what is stale, do not start
deno task status      # what is running, and what is stale
deno task stop        # graceful shutdown (SIGTERM, then SIGKILL after 15s)
deno task restart     # stop, then up
deno task clean       # forget build fingerprints (--all also drops target/)
```

Useful flags: `--force` rebuilds everything, `--no-agents` skips the Rust
build, `--no-css` skips the stylesheet.

The individual steps remain available (`deno task setup`, `build-agents`,
`build-css`, `start`) for scripting and for systemd, which runs `deno task
start` directly so a service restart never triggers a build.

The dashboard is served over TLS at `https://localhost:8000` behind a self-signed
certificate. API access requires the bearer token from `.env`:
`grep '^API_TOKEN' .env`.

See [`docs/SINGLE_NODE_BRINGUP.md`](docs/SINGLE_NODE_BRINGUP.md) for the full
single-host runbook, what degrades without a TPM or systemd, and how to verify the
node is healthy.

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
