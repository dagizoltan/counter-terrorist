# Advanced Security Roadmap: Hardening & Attack Identification

## 1. Hardening "Clean" Systems (Proactive Defense)

### 1.1 Kernel-Level Hardening
- **`Sysctl` Optimizer Plugin:** Automatically applies a hardened `sysctl.conf` targeting network stack protection (e.g., disabling IP forwarding, enabling BPF JIT hardening, and protecting against SYN floods).
- **Module Lockdown:** Optional plugin to disable the loading of new kernel modules after boot to prevent runtime rootkit insertion.

### 1.2 Resource Isolation
- **USBGuard Integration:** Manage an allowlist for USB devices to prevent "Rubber Ducky" or malicious peripheral attacks.
- **AppArmor Profile Manager:** A GUI-driven tool to generate and enforce strict AppArmor profiles for high-risk applications (Browsers, Mail Clients, Claude/Deno itself).

### 1.3 Immutable Configuration
- **Config-Watchdog:** Monitors critical system files (`/etc/passwd`, `/etc/shadow`, `/etc/sudoers`) and automatically reverts unauthorized changes using a "Golden State" backup stored in Deno KV.

## 2. Attack Identification in "Poisoned" Systems (Reactive/Forensic)

### 2.1 eBPF-Based Behavioral Forensics
- **Syscall Auditing:** Instead of just monitoring file paths, use eBPF to track `execve` calls. This detects "Living off the Land" attacks where legitimate binaries (like `sh` or `curl`) are used for malicious purposes.
- **Process Tree Visualization:** Identify "Orphaned" or "Reparented" processes (e.g., a shell process whose parent is no longer the terminal but a hidden background daemon).

### 2.2 Network Exfiltration Detection
- **C2 Beaconing Detector:** Analyzes network logs for periodic, low-volume "heartbeat" connections to unknown IPs—a hallmark of Command & Control (C2) agents like Tailscale-based routers or custom malware.
- **DNS Tunneling Probe:** Monitors for high volumes of DNS queries or unusually long subdomains, which are often used to bypass firewalls and exfiltrate data.

### 2.3 Identity & Session Integrity
- **Shadow User Detection:** Specifically scans for the "usr/false" or "usr/root" anomalies mentioned in the report. It audits `/etc/passwd` and Apple ID session files for non-standard UID/GID mappings.
- **Session Key Export Monitor:** Watches for access to browser profile directories and `.ssh` folders where session keys are stored, flagging any "mass read" operations.

## 3. Integrated "Poison Pill" Plugins

### 3.1 Canary Directories
- Places directories that *look* like browser profiles or crypto-wallets but are actually monitored by the Honeypot Sidecar. Interaction triggers an immediate "Lockdown Mode."

### 3.2 Automated Quarantine (The "Air-Gap" Simulator)
- **Plugin:** `NetworkKillSwitch`
- **Logic:** If a "Critical Compromise" is detected (e.g., drift in system binaries + honeypot trigger), the orchestrator can immediately drop all network interfaces except for the management tunnel to prevent further data exfiltration.

## 4. Addressing the Reported Scenario

| Reported Issue | Proposed Integrated Feature/Plugin |
| :--- | :--- |
| **Tailscale Hijack** | **VPN Audit Plugin:** Periodically lists all active TUN/TAP interfaces and validates them against an authorized VPN list. |
| **iCloud Redirection** | **Mount Integrity Monitor:** Checks if `~/Documents` or `~/Desktop` are symlinked or bind-mounted to suspicious remote locations. |
| **"Kaxxt" Folder** | **Recursive File Classifier:** Uses the Scanner Daemon to identify dismantled Security Enclave data patterns in non-standard directories. |
| **Microphone/Speaker Issues** | **Audio Stream Monitor:** Detects when the microphone or speaker is being accessed by a process not currently in the foreground. |

## 5. Execution Roadmap (Milestone 7+)
1.  **M7.1:** Implement eBPF sidecar for syscall monitoring.
2.  **M7.2:** Integrate USBGuard and AppArmor management.
3.  **M7.3:** Develop the "Forensic Analyzer" dashboard for process tree and network beaconing visualization.
