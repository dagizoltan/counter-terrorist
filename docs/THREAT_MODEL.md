# Threat Model: Sovereign Security Orchestrator

## 1. Adversary Profiles
- **External Attacker**: Attempts to compromise the tactical console or exploit exposed network services.
- **Malicious Process**: Malware already resident on the host trying to disable the orchestrator or exfiltrate data.
- **Rogue Mesh Node**: A compromised peer attempting to inject false threat intelligence or force system-wide lockdowns.

## 2. Attack Vectors & Mitigations

### 2.1 Command Injection (IPC)
- **Threat**: An attacker compromises the Deno orchestrator and attempts to execute arbitrary shell commands via the `SystemExecutor`.
- **Impact**: Privilege escalation to `root` or full host compromise.
- **Mitigation**: `SystemExecutor` uses shell-less `Deno.Command` and enforces a strict whitelist. All arguments are checked against a regex whitelist and `isPotentiallyDangerous` blocks shell metacharacters (`;`, `&`, `|`).

### 2.2 Path Traversal / Information Leakage
- **Threat**: Forcing the `analyzer` to read sensitive files (e.g., `/etc/shadow`) by smuggling paths in IPC JSON payloads.
- **Impact**: Exposure of secrets and system credentials.
- **Mitigation**: `validatePath` performs multi-level URL decoding and null-byte rejection. Commands like `openssl` are subject to "Mandatory Jailing," restricted to `./volume/` and `/var/lib/cts/`.

### 2.3 SSRF & DNS Rebinding (Notifications)
- **Threat**: Attacker provides a webhook URL that resolves to a local service or cloud metadata endpoint.
- **Impact**: Internal network scanning or cloud credential theft.
- **Mitigation**: `validateWebhookUrlAsync` performs asynchronous DNS resolution and blocks private/reserved IP ranges. `safeFetch` pins the connection to the validated IP.

### 2.4 Mesh Spoofing & Gossip Injection
- **Threat**: A compromised node or LAN attacker injects false `GOSSIP_BLOCK` messages to cause a DoS of legitimate services.
- **Impact**: Disruption of network connectivity for critical systems.
- **Mitigation**: Mandatory mTLS for all peer connections. Gossip payloads require a valid HMAC signature using the `MESH_SECRET` and are rejected if they exceed a 5-minute freshness window.

### 2.5 Sidecar Binary TOCTOU
- **Threat**: Attacker replaces a sidecar binary after it has been verified but before it is executed.
- **Impact**: Execution of malicious code with high-level capabilities.
- **Mitigation**: `SidecarManager` moves binaries to root-owned `/var/lib/cts/bin` before verification and spawning. Cyclic rotation (every 6 hours) refreshes binaries from a "Golden Baseline."

### 2.6 Forensic Ledger Tampering
- **Threat**: Attacker compromises the system and attempts to delete or modify audit logs to hide their tracks.
- **Impact**: Loss of accountability and forensic evidence.
- **Mitigation**: Append-only SHA-256 chain. Each event is signed by the TPM. Chain discontinuity or signature mismatch triggers "Forensic Restricted Mode" (read-only enforcement).

## 3. Residual Risks
- **Zero-Day eBPF Bypass**: Advanced kernel-level rootkits may bypass eBPF hooks.
- **Physical Access**: An attacker with physical access to the machine may tamper with the TPM or PCR states (mitigated by PCR sealing).
- **Resource Exhaustion**: Extremely high-frequency kernel events could potentially overwhelm the Deno event loop (mitigated by staggered metrics and async event processing).
