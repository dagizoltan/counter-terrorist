# Zero-Config Mesh Design: "Autonomous Security"

## 1. Vision: Plug-and-Protect
The goal is to achieve a "Zero-Config" setup where a new device running the Counter-Terrorist agent automatically discovers the mesh, securely joins it, and receives its configuration (active plugins/rules) without manual key exchange or IP configuration.

## 2. Automatic Mesh Discovery

### 2.1 mDNS / Avahi Broadcast
- Each node broadcasts its presence as a `_ct-orchestrator._tcp` service on the local network using Multicast DNS (mDNS).
- New nodes scan for this service to identify the "Master" or peer nodes.

### 2.2 Trust-on-First-Use (TOFU) with Physical Proximity
- **The "Sting" Mode:** When a node is in "Pairing" mode (activated for 5 minutes after first boot), it will accept the first connection from a peer on the local subnet.
- **Visual/Physical Verification:** The dashboard will show a "New Node Attempting to Join" alert. A single click "Authorizes" the node, after which mTLS certificates are automatically generated and exchanged.

## 3. Automated Security & Key Management

### 3.1 Self-Signed CA & Internal PKI
- The first node (The "Bootstrap" node) generates a self-signed Root Certificate Authority (CA).
- When a new node joins, it generates a CSR (Certificate Signing Request) and sends it to the Bootstrap node.
- The Bootstrap node signs it and returns the certificate. All subsequent communication is strictly mTLS.

### 3.2 Key Rotation
- The system automatically rotates internal session keys and certificates every 30 days without user intervention.

## 4. Manifest-Based Plugin Activation
Instead of complex configuration files, we use a simple `security-manifest.json`:

```json
{
  "profile": "high-alert",
  "active_plugins": ["honeypot", "firewall", "ebpf-forensics"],
  "auto_block": true,
  "mesh_sync": true
}
```

- **Dynamic Sync:** When you update the manifest on the "Bootstrap" node, it is automatically pushed to all mesh nodes via the gossip protocol.
- **Default Profiles:** We provide pre-defined profiles (e.g., `clean-room`, `active-sting`, `server-hardened`) so the user only has to select a "Mood" for their security.

## 5. Network Autonomy
- **Self-Healing:** If the Bootstrap node goes offline, the mesh enters "Autonomy Mode" where nodes continue to enforce the last known manifest but buffer their logs until the mesh is reunited.
- **Conflict Resolution:** If two nodes disagree on a block (e.g., Node A thinks IP X is safe, Node B thinks it's a threat), the mesh defaults to the **most restrictive** policy (Deny-by-Default).

## 6. Implementation Strategy for Zero-Config
1.  **Step 1:** Integrate the `mdns` Deno library for service discovery.
2.  **Step 2:** Implement an "Auto-Join" window in `bootstrapper.ts`.
3.  **Step 3:** Use Deno KV to store and sync the signed certificates and the global `security-manifest.json`.

## 7. Zero-Config & The Attacker
This "Zero-Config" approach is actually **more secure** against your current attacker:
- **No Static Keys:** Since there are no hardcoded keys or static passwords to steal, an attacker cannot easily "Join" the mesh even if they have access to your old config files.
- **Fast Lockdown:** Because the configuration is centralized in the manifest, you can flip the entire fleet into "Isolation Mode" with one change.
