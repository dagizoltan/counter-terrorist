# Honeypot Plugin Design: Counter-Terrorist Security Orchestrator

## 1. Overview
The Honeypot Plugin is designed to detect and respond to unauthorized internal and external lateral movement by deploying deceptive assets throughout the system and network. It fully integrates with the Counter-Terrorist security orchestrator to provide automated blocking and high-fidelity alerting.

## 2. Architecture

### 2.1 Component Model
The honeypot follows the existing three-tier architecture:
1.  **Honeypot Manager (Deno):** Orchestrates the deployment of honey-assets, manages their lifecycle, and processes events.
2.  **Honeypot Sidecar (Rust):** A high-performance agent responsible for monitoring honey-files and listening on honey-ports.
3.  **Dashboard Integration:** UI for configuring honeypot parameters and viewing interaction logs.

### 2.2 Integration Points
- **CommandManager:** Used to spawn and communicate with the Honeypot Sidecar.
- **FirewallManager:** Automatically triggers `blockIp` when a honeypot asset is interacted with.
- **NotificationService:** Broadcasts `CRITICAL` alerts to Slack/Discord/Webhooks.
- **LoggingService:** Forwards detailed interaction forensics to remote syslogs.

## 3. Honey-Assets

### 3.1 Honey-Files (FIM)
- **Concept:** Fake sensitive files placed in common locations (e.g., `/root/.ssh/config_backup`, `/home/usr/.aws/credentials_old`).
- **Detection:** The Rust sidecar uses `inotify` (Linux) to monitor these files for `OPEN`, `READ`, or `MODIFY` events.
- **Relevance:** Directly addresses the "Kaxxt" folder and dismantled Security Enclave data mentioned in the report.

### 3.2 Honey-Ports (Port Listener)
- **Concept:** Lightweight listeners on high-risk ports that are not in use (e.g., 21, 23, 445, 3389).
- **Detection:** Any connection attempt (SYN) triggers an immediate alert and optional IP block.
- **Relevance:** Detects automated scanning tools often used by intruders to find lateral movement opportunities.

### 3.3 Honey-Credentials
- **Concept:** Fake credentials (API keys, session tokens) placed in environment files or application configs.
- **Detection:** Requires integration with cloud/service providers (e.g., AWS Canary Tokens) or local monitoring of access to the files containing them.

## 4. Security & Safety

- **Isolation:** The honeypot assets are "low-interaction," meaning they do not provide a real shell or service to the attacker, minimizing the risk of the honeypot itself being used as an exploit vector.
- **Resource Limiting:** The Rust sidecar will have strict CPU/RAM limits to ensure it does not impact system performance.
- **False Positive Mitigation:**
    - Trusted IP allowlist (e.g., localhost, local admin workstation).
    - Integration with `ufw` to ensure honey-ports don't conflict with legitimate services.

## 5. Proposed Implementation Workflow

1.  **Phase 1:** Implement the Rust "Honey-Daemon" using `tokio` for async port listening and `inotify` for file monitoring.
2.  **Phase 2:** Extend `orchestrator/protection/` with `honeypot.ts` to manage the daemon.
3.  **Phase 3:** Integrate `honeypot.ts` with `FirewallManager` for "Auto-Block" capability.
4.  **Phase 4:** Add a "Honeypot" tab to the Hono Dashboard to visualize triggered events.

## 6. Response to Reported Intrusion
This honeypot specifically targets the behaviors reported:
- **Tailscale/Subnet Router Hijacking:** Honey-ports would detect the subnet router's attempt to scan the local network.
- **System.md Modification:** Placing a honey-version of `system.md` (or monitoring the real one with honey-attributes) would flag unauthorized Claude-related tampering.
- **Dismantled Data:** Honey-files in the same directories would alert when the attacker browses for more data.
