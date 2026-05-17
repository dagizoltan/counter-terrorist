# Sovereign Cybersecurity Platform: Full-Spectrum Production Audit Report

## 1. Architecture Analysis

### 1.1 Overall Architecture Diagram
```text
[ External Internet ]
         |
[ XDP Firewall (Sentinel) ] <----------------+
         |                                   |
[ Hono Web API / UI ] <----( mTLS/RBAC )----[ Mesh Peers ]
         |
[ Deno Orchestrator Core ] <---( Domain Logic )
         |
         +---[ Sidecar Manager ] <---( stdio JSON IPC )---> [ Rust Agents ]
         |           |                                          |
         |           +---[ TPM Manager ]                        +---[ analyzer (AV) ]
         |                                                      +---[ decoy (Honeypot) ]
         |                                                      +---[ netcap (Forensics) ]
         |                                                      +---[ watchfile (FIM) ]
[ Deno KV ] (State/PKI/Ledger)
```

### 1.2 Orchestration & Lifecycle
*   **Model**: Domain-Driven Design (DDD) with a central service container. The orchestrator acts as the "Brain" (Control Plane).
*   **Process Boundaries**: Orchestrator (User/Root) -> Sidecars (Root/Cap-Restricted).
*   **IPC**: Strictly non-networked stdin/stdout pipes using JSON-RPC-like messages.
*   **Trust Boundaries**:
    *   **External**: Untrusted.
    *   **Mesh Peer**: Peer-Trusted (mTLS validated).
    *   **Sidecar**: High-Trust (Binary verified, input validated).
*   **Update Flow**: Automated "Cyclic Rotation" every 6 hours. Binaries are re-verified against a signed manifest and healed from a "Golden Repository" if compromised.

### 1.3 Identified Weaknesses
*   **Orchestration Fragility**: The `MetricsService` is a high-coupling "God Object" that could cause system-wide stall if metrics collection for a single sidecar hangs (partially mitigated by 15s timeouts).
*   **Implicit Trust**: The orchestrator assumes `secure_spawn.sh` is immutable once installed, yet it resides in a directory (`/var/lib/cts/scripts/`) that could be targeted for persistence.

---

## 2. Security Audit

### 2.1 Critical Vulnerabilities & Risks

| ID | Finding | Severity | Exploitability | CVSS (est) | Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SOV-01 | **Broad Orchestrator Permissions** | CRITICAL | Low | 8.8 | Full Sandbox Escape |
| SOV-02 | **Indirect Command Injection in Whitelists** | HIGH | Medium | 7.5 | Privilege Escalation / RCE |
| SOV-03 | **TOCTOU in Sidecar Deployment** | MEDIUM | Medium | 6.5 | Binary Hijacking |
| SOV-04 | **IPv6 Firewall Blindspot** | MEDIUM | Low | 5.3 | Detection Evasion |
| SOV-05 | **Mesh Discovery DoS (UDP 5353)** | LOW | High | 4.3 | Service Interruption |

### 2.2 Attack Surface Maps
*   **Web Ingress**: Hono-based API. Risk: CSRF/XSS (Mitigated by CSP/CSRF tokens), Auth bypass.
*   **Mesh Network**: mTLS handshakes. Risk: Handshake DoS, Discovery spoofing.
*   **Local IPC**: JSON payloads to sidecars. Risk: Malformed JSON causing sidecar panics, Path traversal (Mitigated by Jailing).

---

## 3. Rust-Specific Audit

### 3.1 Memory Safety & Async
*   **Unsafe Blocks**: Used in `sentinel` for zero-copy parsing of `SyscallEvent`.
    *   **Risk**: Potential for UB if struct alignment differs across architectures (x86_64 vs ARM64).
*   **Tokio Misuse**: Sidecars correctly use `tokio` for async stdio and BPF event loops. `panic = "abort"` ensures no poisoned state survives.

### 3.2 Supply Chain
*   **Crate Review**: Dependencies are standard (`serde`, `tokio`, `sysinfo`, `aya`).
*   **Risk**: `aya` (eBPF) is a complex dependency; kernel-space bytecode must be audited separately.

---

## 4. Deno/TypeScript Audit

### 4.1 Permission Model
*   The use of `--allow-all` in the default `start` task is the most significant architectural weakness. It renders the Deno sandbox moot.

### 4.2 API Validation
*   Strong use of `Zod` and `validateRequest` schemas ensures that sidecars are not fed malformed data.
*   **Path Jailing**: Centralized in `validation.ts`, successfully prevents `..` and prefix bypasses.

---

## 5. Subsystem Analysis

### 5.1 Privacy & Anonymization
*   **Shadow Mode**: Provides a safety net for policy testing.
*   **Risk**: Traffic leaks during VPN transitions. The `AnonymizationService` relies on `wg-quick`. If the handshake fails, the system "fails open" unless the `Firewall` has a kill-switch rule.
*   **Mitigation**: Implement a "Kill-Switch" by default in the XDP firewall that blocks all non-VPN traffic when anonymization is active.

### 5.2 Reliability & Performance
*   **Backpressure**: The `SidecarManager` uses unbounded pipes. High event volume (e.g. syscall flooding) could lead to OOM in the Deno orchestrator.
*   **Scaling**: eBPF offloading is highly efficient. The 100MB file limit in `analyzer` prevents CPU exhaustion during scans.

---

## 6. Subsystem Analysis

*   **Firewall**: XDP-based blocking is state-of-the-art but needs IPv6 parity.
*   **Honeypot**: `decoy` is realism-focused but uses a static FIFO for sabotage, which could be fingerprinted by timing analysis.
*   **Scanner**: `analyzer` hash cache is effective. Memory scanning for RWX segments is a strong heuristic for fileless malware.

---

## 7. Threat Modeling

### 6.1 Attacker Profiles
1.  **Remote Adversary**: Target: Web API / Mesh. Goal: Ransomware / Exfiltration.
2.  **Malicious Local User**: Target: Sidecar binaries / `/tmp`. Goal: Local Privilege Escalation.
3.  **Compromised Peer**: Target: Mesh Gossip. Goal: Policy poisoning (e.g., Unblock malicious IP).

### 6.2 Crown Jewels
1.  **TPM-Sealed PKI_SECRET**: Root of mesh identity.
2.  **Forensic Ledger**: Proof of compromise/integrity.
3.  **Deno KV**: Operational state.

---

## 8. Deliverables & Roadmap

### 7.1 Remediation Roadmap
1.  **Immediate (24h)**: Fix Orchestrator permissions and tighten `SystemExecutor` regex.
2.  **Short-Term (1wk)**: Implement IPv6 support in `sentinel` XDP maps.
3.  **Mid-Term (1mo)**: Replace raw `unsafe` casts in Rust with `zerocopy`.

### 7.2 Quick Wins
*   Update `deno.json` to use `--allow-net`, `--allow-run`, etc.
*   Remove shell metacharacters from `ssh` and `powershell` whitelists.

---
*Audit performed by Jules, Principal Cybersecurity Architect.*
