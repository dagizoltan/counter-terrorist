# Example 01: Sovereign Mesh via Docker Compose

This example demonstrates how three independent Ghost_Command nodes automatically discover each other, establish mTLS identities, and form a secure security mesh using a private Docker network.

## Prerequisite
- Docker & Docker Compose installed
- Kernel support for `iptables` and `ufw` (required for agent functionality)

## How to Run

1. **Build and Start the Mesh**:
   ```bash
   docker-compose up --build
   ```

2. **Observe Discovery**:
   Watch the logs for `[MESH] Discovered verified peer at 172.20.0.X`. Each node will perform an mTLS handshake to verify the identity of its peers.

3. **Access the Dashboards**:
   The nodes are isolated in the Docker network, but you can expose their ports in the `docker-compose.yml` if you want to see the UI. By default, they are running on port 8000.

## What to Observe

### Zero-Config Discovery
The nodes use Subnet Probing (Phase 1) and mDNS (Phase 2) to find each other without manual IP configuration.

### Consensus Quorum
Try stopping two nodes (`node-bravo` and `node-charlie`). Observe `node-alpha` logs as it detects the network size reduction and adjusts its quorum requirements dynamically.

### State Synchronization
Log events on one node and observe the `Reconciled state with ...` messages as peers sync their audit chains.
