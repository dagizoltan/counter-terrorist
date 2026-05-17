# API Specification: Sovereign Security Orchestrator

## 1. Authentication
Most endpoints require authentication.
- **Header**: `Authorization: Bearer <token>` or `X-Api-Key: <key>`
- **Cookie**: `session_token=<uuid>` (Requires `X-CT-Token` header for mutation requests).

## 2. REST API

### 2.1 Environmental Discovery
- **GET** `/api/network/discovery`
  - Returns ambient signals (WiFi, BT) and verified mesh topology.
- **GET** `/api/network/logs`
  - Returns recent network traffic logs (INBOUND/OUTBOUND).

### 2.2 Mesh Operations
- **GET** `/api/mesh/nodes`
  - List all registered mesh peers and their status.
- **POST** `/api/mesh/sync`
  - **Internal**: Node-to-node state synchronization. Requires valid HMAC signature.
- **POST** `/api/mesh/resync`
  - Broadcasts a cryptographic re-verification request to all peers.

### 2.3 Agent Management
- **POST** `/api/agents/:name/restart`
  - Forces a sidecar rotation and binary re-verification.
- **POST** `/api/agents/:name/command`
  - Send a raw JSON command to a sidecar (e.g., `sentinel`).
- **GET** `/api/agent/status`
  - Summary of active daemons and their OS-level capabilities.

### 2.4 Forensics & Defense
- **GET** `/api/forensics/export`
  - Export a signed evidence bundle. Query param `limit` controls size.
- **POST** `/api/defense/isolate`
  - Manually isolate an IP or PID. IP isolation supports optional `ttl`.
- **POST** `/api/defense/purge`
  - Force-kill a malicious process (admin only).

### 2.5 Audit & Governance
- **GET** `/api/audit/logs`
  - Stream events from the forensic ledger.
- **GET** `/api/governance/policy`
  - View current Sovereign remediation policy.
- **POST** `/api/governance/policy`
  - Update policy manifest. Requires Ed25519 signature in strict mode.

## 3. WebSocket API

### 3.1 Connection
- **Endpoint**: `/api/ws/events`
- **Auth**: Query param `token` or session cookie.

### 3.2 Outbound Events (Server to Client)
The server streams various event types:
- `METRICS_UPDATE`: Periodic system health stats.
- `AUDIT_EVENT`: Real-time entries added to the ledger.
- `EBPF_CRITICAL`: Kernel-level security alerts.
- `FIM_ALERT`: Unauthorized file modification events.
- `EXFIL_ALERT`: High-volume data transfer detection.

### 3.3 Inbound Commands (Client to Server)
- `PING`: Keep-alive, responds with `PONG`.
