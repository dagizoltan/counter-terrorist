# Security Model: Sovereign Security Orchestrator

## 1. Core Principles
- **Least Privilege**: The orchestrator runs in the Deno sandbox with restricted permissions. Sidecars only have the capabilities necessary for their specific domain (e.g., `cap_net_admin`).
- **Defense in Depth**: Security is enforced at the Web layer (RBAC/CSRF), the Application layer (DDD/Validation), and the Kernel layer (eBPF/LSM).
- **Hardware Root of Trust**: System identity and audit integrity are anchored to the TPM 2.0.

## 2. Authentication & Authorization

### 2.1 Web/API Access
Access to the tactical console is governed by tiered roles:
- **Admin**: Full control over all system policies and agents.
- **Operator**: Can trigger scans, view forensics, and perform manual remediations (e.g., block IP).
- **Viewer**: Read-only access to metrics and non-sensitive audit logs.
- **Mesh Peer**: Internal role for node-to-node synchronization.

Authentication methods:
- **Session Cookie**: For dashboard UI (Session-bound CSRF token required).
- **Bearer Token**: Master token for CI/CD and CLI integrations.
- **API Key**: Scoped keys for external monitoring tools.

### 2.2 Sidecar Privilege Model
Sidecars are deployed to `/var/lib/cts/bin`, owned by `root`, and executed via `secure_spawn.sh`.
- **Capability Pinning**: Sidecars are granted specific Linux capabilities rather than full `root` access where possible.
- **IPC Isolation**: Agents communicate with Deno only via non-networked stdin/stdout pipes.

## 3. Data Integrity & Privacy

### 3.1 Forensic Ledger
All security-critical events are logged to an append-only, cryptographically linked chain.
- **Hashing**: SHA-256 links each event to its predecessor.
- **Signing**: TPM-rooted signatures ensure that the ledger cannot be tampered with even if the OS is compromised.

### 3.2 Key Management
- **PKI_SECRET**: Used to encrypt node private keys at rest (AES-256-GCM).
- **MESH_SECRET**: Used for HMAC signing of inter-node gossip.
- **Sealing**: In production, these secrets are sealed to the TPM to prevent exfiltration.

## 4. Input Validation Strategy

### 4.1 Path Jailing
All filesystem-touching commands are restricted to a set of mandatory jails:
- `./volume/` (Persistent data)
- `/var/lib/cts/` (System scripts and binaries)
- `/tmp/` (Ephemeral dumps)

### 4.2 Network Validation
- **SSRF Protection**: Webhook URLs are resolved and checked against RFC1918 private ranges and cloud metadata IPs.
- **DNS Rebinding**: `safeFetch` pins requests to pre-validated IP addresses.

## 5. Trust Boundaries

| Boundary | Level | Enforcement Mechanism |
| :--- | :--- | :--- |
| **External Internet** | UNTRUSTED | Firewall (XDP) + Web Auth |
| **Local Web Client** | PARTIALLY TRUSTED | RBAC + CSRF + CSP |
| **Mesh Network** | PEER TRUSTED | mTLS (X.509) + Gossip HMAC |
| **Deno Orchestrator** | TRUSTED (SANDBOXED) | Deno Runtime Permissions |
| **Sidecar Agents** | HIGHLY TRUSTED | Mandatory IPC Validation + Binary Integrity |
| **Kernel** | AUTHORITATIVE | eBPF / LSM |
