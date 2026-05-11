# Counter-Terrorist: Advanced Threat Capabilities Matrix

This document provides a detailed senior architect's assessment of the system's ability to detect, capture, and block advanced persistent threats (APTs) and sophisticated exploitation techniques.

## 1. Tactical Capability Overview

| Threat Category | Specific Technique | Capture | Block | Resilience Level |
| :--- | :--- | :---: | :---: | :--- |
| **Endpoint / Runtime** | Process Hollowing / Replacement | ✅ | ✅ | **High**: eBPF `execve` + `mmap` hooks detect mismatch. |
| | Shellcode Injection (Fileless) | ✅ | ✅ | **High**: Scanner detects RWX + Anonymous Exec memory. |
| | Privilege Escalation (LPE) | ✅ | ⚠️ | **Medium**: Captured via `ptrace`/`openat` hooks; blocking requires LSM policy. |
| | Living off the Land (LotL) | ✅ | ✅ | **High**: `SystemExecutor` whitelist + Regex policies. |
| **Network / Transport** | Tor Exit-Node Interactions | ✅ | ✅ | **Critical**: Automated via `AutoBlockService` + News Signals. |
| | C2 Beaconing (Beaconing) | ✅ | ✅ | **High**: eBPF `connect` hooks + Behavioral Analysis. |
| | Lateral Movement (RDP/SSH) | ✅ | ✅ | **High**: Captured by Honeypot decoys + XDP blocking. |
| | DNS Tunneling | ✅ | ❌ | **Low**: Captured in PCAP, but no active deep packet blocking yet. |
| **Persistence** | Malicious Kernel Modules | ✅ | ❌ | **Medium**: Detected via `RKH_SCAN`, but no kernel write-protection. |
| | Crontab / Systemd Hijacking | ✅ | ✅ | **High**: `FIM` + `BaselineService` drift detection. |
| | Hidden Directories (`/dev/shm`) | ✅ | ✅ | **High**: Specialized `RKH_SCAN` in Rust agent. |
| **Data Exfiltration** | Mass File Read | ✅ | ⚠️ | **Medium**: Captured via LSM `file_open`, blocking requires manual rule. |
| | Encrypted Exfiltration | ⚠️ | ❌ | **Low**: Metadata captured (IP/Port), payload is a blind spot. |

---

## 2. Advanced Defenses (The "Capture" Depth)

### 2.1. Fileless Malware (Shellcode)
The **Scanner Agent** performs deep process memory auditing. It specifically identifies:
*   **RWX Segments**: Simultaneous Read-Write-Execute permissions, a hallmark of shellcode stagers.
*   **Anonymous Executables**: Executable memory regions that are not backed by any file on disk, identifying injected code.

### 2.2. Zero-Day Exploitation Attempts
The **eBPF Sidecar** implements Ring 0 observability. By hooking `sys_execve` and `sys_connect`, the system can identify "Stray Shells"—unexpected shells spawned by non-interactive services (e.g., a shell spawned by `www-data` or a database process).

---

## 3. Known Technical Blind Spots (The "Cannot" List)

The following advanced threats are currently outside the system's active enforcement or detection reach:

1.  **Ring -1 / Hardware Rootkits**: System Management Mode (SMM) rootkits or compromised UEFI firmware. The system assumes a trusted BIOS/UEFI state (partially mitigated by TPM attestation).
2.  **Encrypted Payload Analysis**: While we capture metadata and IP/Port of all connections, we do not perform TLS Interception (MITM) to inspect encrypted exfiltration or C2 traffic.
3.  **Kernel-Space Exploits**: Exploits that target the Linux kernel itself (e.g., `dirtycow` variants) before the eBPF hooks can trigger. A compromised kernel can disable the eBPF probes.
4.  **Sophisticated Side-Channel Attacks**: Detection of cache-timing or power-analysis attacks is not implemented.
5.  **Insider Threat / Physical Access**: Physical access to the machine or a user with valid root credentials can bypass many software-based controls (though their actions will be captured in the immutable Audit Ledger).

## 4. Architect's Conclusion
Counter-Terrorist is highly effective against **Automated Exploitation**, **LotL**, and **Common APT Persistence** methods. Its primary strength lies in the synergy between the **eBPF observer** and the **Autonomous AutoBlocker**. The identified blind spots are consistent with the "Security Orchestrator" model and would require integration with dedicated Hardware Security Modules (HSMs) or Network Intrusion Prevention Systems (NIPS) to resolve.
