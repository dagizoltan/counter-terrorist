# Orchestrator Enhancements: Plugin Framework & Mesh Architecture

## 1. Vision: A Unified Security Mesh
The goal is to transition Counter-Terrorist from a single-node monitor to a distributed security mesh where devices operate autonomously but share threat intelligence and state through a centralized control plane.

## 2. Plugin Extensibility Framework

### 2.1 Standardized Plugin Interface
To allow rapid addition of new tools, we propose a "Plugin Manifest" system:
- **Registry:** `orchestrator/plugins/` directory where each plugin provides a `mod.ts`.
- **Hooks:** Plugins can subscribe to system-wide events (e.g., `onNetworkJoin`, `onDriftDetected`, `onInterventionRequired`).
- **Capability-Based Security:** Plugins must declare which managers they need access to (e.g., "needs:firewall", "needs:kv").

### 2.2 Proposed Plugin Additions
- **`DiscoveryPlugin`:** Uses mDNS/ARP scanning to identify new devices on the local network. (Directly addresses the "Mom's new phone" and "Tv" device identification).
- **`BehavioralPlugin` (eBPF):** Uses Rust + eBPF to monitor socket calls and file descriptors in real-time with zero performance hit.
- **`CloudSyncPlugin`:** Securely backups critical logs and baselines to a user-controlled encrypted bucket.

## 3. Mesh-Like Centralized Monitoring

### 3.1 Distributed Node Model
- **Edge Orchestrator:** Runs on individual devices (Mac Mini, Alienware, etc.). Maintains local autonomy (can block/alert even if offline).
- **Control Plane:** A central instance (could be the Mac Mini) that provides a unified "Fleet View."
- **Communication Layer:**
    - **mTLS Encrypted Tunnels:** Nodes communicate over HTTPS with mutual TLS.
    - **Gossip Protocol:** Shared "Blacklist" of IPs. If the Alienware blocks an IP, the Mac Mini automatically receives that update and blocks it too.

### 3.2 Global Asset Baseline
- Devices share their "Known Device List." If a device appears on the network that is not in the global baseline, every edge node receives a "NEW_DEVICE_ALERT".

## 4. Enhanced Default Tools

### 4.1 Network Watchdog
- Detects MAC address spoofing and ARP poisoning.
- Monitors for "Unexpected Linkage" (like the TV/Monitor behavior mentioned) by tracking HDMI-CEC and Bluetooth proximity signals via sidecars.

### 4.2 Application Sandbox Monitoring
- Deep integration with `firejail` or `bubblewrap` to provide "one-click" sandboxing for suspicious apps identified during the audit.

## 5. Unified Response Orchestration (Playbooks)
Implement a simple rule engine:
```json
{
  "name": "Lateral Movement Prevention",
  "trigger": "honeypot.interaction",
  "actions": [
    "firewall.block_source",
    "mesh.broadcast_block",
    "notifications.send_urgent"
  ]
}
```

## 6. Implementation Strategy
1.  **Phase 1:** Define the Deno Plugin API and refactor `Firewall` and `VPN` as the first "Internal Plugins."
2.  **Phase 2:** Implement the Mesh Communication layer using Deno's `Deno.serve` with client certificate validation.
3.  **Phase 3:** Create the "Fleet Dashboard" in the GUI to allow switching between different device views.
