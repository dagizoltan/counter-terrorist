# Stealth & Resilience: Protecting the Orchestrator

## 1. The Threat: Attacker-Awareness
Since the attacker is already inside and likely possesses high technical skill, we must assume they will look for the orchestrator itself.

## 2. Process & Binary Stealth

### 2.1 Masquerading
- **Dynamic Naming:** The Rust sidecars and Deno process should not be named `counter-terrorist`. We will use common, innocuous system names (e.g., `systemd-monitoring-helper` or `kworker/u1:2-security`).
- **Binary Obfuscation:** Use `strip` on Rust binaries and potentially a packer like `UPX` to make reverse engineering more difficult.

### 2.2 Parent-Process Cloaking
- The sidecars will be spawned in a way that they appear as children of standard system processes or as independent background daemons, making the process tree look legitimate.

## 3. Anti-Tampering & Persistence

### 3.1 Mutual Monitoring ("The Dead Man's Switch")
- **The Orchestrator watches the Sidecars:** If a sidecar is killed, the orchestrator immediately restarts it and triggers a `CRITICAL` alert.
- **The Sidecars watch the Orchestrator:** If the Deno process is killed, the Rust sidecar (running as a persistent daemon) can be programmed to trigger an emergency firewall "Lockdown" (blocking all traffic except for a recovery IP).

### 3.2 Immutable Persistence
- Use `chattr +i` (Immutable attribute) on the orchestrator's binaries and critical configuration files. Even `root` cannot delete them until the attribute is removed—a step the attacker might not immediately think of or be able to do without being detected by our FIM (File Integrity Monitoring).

## 4. Network Stealth

### 4.1 Encrypted "Black-Pipe" Communication
- All communication between the UI, the Orchestrator, and the Mesh nodes will occur over non-standard ports using mTLS. To a network scanner, this will look like high-entropy encrypted traffic, similar to legitimate system updates or telemetry.

### 4.2 Out-of-Band Alerts
- Notifications (Slack/Discord) should be sent via a separate network interface (e.g., a 4G/5G dongle) if available, or through a hardened VPN tunnel to ensure the attacker cannot intercept or block the alerts on the local network.

## 5. Deployment "Sting" Strategy
- **Silent Boot:** When first deployed, the system will run in "Observation Only" mode for 2 hours. It will establish a baseline and identify the attacker's presence without taking any action, allowing us to gather more forensics before the "Sting" (Auto-Blocking) is activated.

## 6. Implementation Checklist
1.  **Phase 1:** Add process name masquerading to the Rust `main.rs`.
2.  **Phase 2:** Implement the "Dead Man's Switch" logic in the sidecar.
3.  **Phase 3:** Integrate `chattr` commands into the deployment script.

## 7. Conclusion
These stealth and resilience measures ensure that even if the attacker is aware of a new security layer, they will find it difficult to identify, kill, or bypass, giving the "Sting Plan" the highest chance of success.
