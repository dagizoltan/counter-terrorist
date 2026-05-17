# Architecture Audit: Counter-Terrorist Security Orchestrator

## 1. System Topology
The system follows a three-tier "Sovereign" model designed for Ubuntu LTS but extending to macOS and Windows via platform-specific sidecars.

### Tier 1: Deno Orchestrator
- **Runtime:** Deno (High-level orchestration, Web UI, Persistence).
- **Core Engine:** `SovereignApp` (Service Container pattern).
- **Web Interface:** Hono-based SSR with reactive islands.
- **Persistence:** Deno KV (Audit logs, Baselines, Session state).

### Tier 2: Rust Sidecars (Native Enforcement)
- **Analyzer:** Persistent daemon for file and memory scanning.
- **Enforcer:** Handles process killing, quarantine, and legacy IP blocking.
- **Sentinel (Linux):** eBPF-powered kernel observability and XDP firewall.
- **Trustroot:** Hardware-rooted (TPM) identity and secret provisioning.
- **Decoy:** Multi-module honeypot agent.
- **Tunnel:** WireGuard VPN management.

### Tier 3: Management Console
- SSR Dashboard with WebSocket real-time event streaming.

## 2. Execution & Request Flows

### 2.1 Administrative Access (Web/API)
1. **Request:** Browser/Client -> `WebAdapter` (Port 8000).
2. **Middleware:** `SecurityMiddleware` enforces Auth (Session/Token) and CSP/CSRF.
3. **Authorization:** RBAC (`admin`, `operator`, `viewer`) checked via `requireRole`.
4. **Execution:** Controller -> Domain Service -> `SidecarManager`/`SystemExecutor`.
5. **Sidecar IPC:** JSON-over-stdin/stdout via `Deno.Command`.

### 2.2 Mesh Peer Communication (P2P)
1. **Discovery:** mDNS/Subnet probing finds peers.
2. **Authentication:** mTLS Handshake via `MeshAuthService` (Root CA distributed in mesh).
3. **Verification:** `MeshManager` validates identity before registration.
4. **Gossip:** Signed HMAC-SHA256 payloads for threat sharing and state sync.

### 2.3 Automated Defense (Autonomous)
1. **Detection:** `Sentinel` (eBPF) or `Honeypot` triggers an event.
2. **Mediation:** `EventMediator` routes events to `AutopilotService`.
3. **Enforcement:** `Autopilot` evaluates policy -> `ProtectionAdapter` -> `Sentinel`/`Enforcer`.

## 3. Trust Boundaries

| Boundary | Type | Mechanism |
| :--- | :--- | :--- |
| **External -> Web** | Auth | Bearer Token / Session Cookie + CSRF |
| **Web -> Orchestrator** | Auth | RBAC (Internal to Hono context) |
| **Orchestrator -> Sidecars** | IPC | Whitelisted Commands + JSON Schema Validation |
| **Peer <-> Peer** | mTLS | X.509 Certificates (Signed by Mesh Root CA) |
| **Sidecar -> Kernel** | Syscall | eBPF/Netlink/UFW (Root required for most) |

## 4. Privilege Model
- **Orchestrator:** Runs as a non-privileged user (ideally), but uses `sudo -n` via `SystemExecutor` for privileged commands.
- **Sidecars:** Binaries are moved to `/var/lib/cts/bin`, owned by root:root, and granted specific Linux capabilities (e.g., `cap_net_admin`, `cap_sys_admin`) via `secure_spawn.sh`.
- **SystemExecutor:** Acts as the gatekeeper for all native command execution.
