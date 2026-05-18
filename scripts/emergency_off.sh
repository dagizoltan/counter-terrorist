#!/bin/bash

# Sovereign Emergency Cleanup Script
# This script forcibly removes all Sovereign-related kernel programs and stops all agents.
# Use this if the system becomes unresponsive or network connectivity is lost.

echo "🚨 INITIALIZING SOVEREIGN EMERGENCY CLEANUP..."

# 1. Stop the Orchestrator
echo "Stopping Deno Orchestrator..."
pkill -f "deno run .* src/orchestrator/index.ts" || true

# 2. Kill all sidecar agents
echo "Stopping all Sovereign agents..."
AGENTS=("analyzer" "enforcer" "decoy" "netcap" "sentinel" "watchfile" "trustroot" "tunnel")
for agent in "${AGENTS[@]}"; do
    pkill -9 -f "$agent" || true
done

# 3. Flush eBPF/XDP programs from all interfaces
echo "Flushing XDP programs..."
INTERFACES=$(ip -o link show | awk -F': ' '{print $2}')
for iface in $INTERFACES; do
    if [[ "$iface" != "lo" ]]; then
        echo "   Detaching XDP from $iface..."
        ip link set dev "$iface" xdp off 2>/dev/null || true
    fi
done

# 4. Remove temporary firewall rules
echo "Resetting UFW..."
ufw --force reset || true
ufw disable || true

# 5. Clear WireGuard interfaces managed by Sovereign
echo "Cleaning up VPN interfaces..."
wg show interfaces | xargs -I {} wg-quick down {} 2>/dev/null || true

# 6. Cleanup PID and lock files
echo "Removing runtime artifacts..."
rm -f /tmp/cts-*.pid 2>/dev/null
rm -rf /var/lib/cts/tmp/* 2>/dev/null

echo "✅ EMERGENCY CLEANUP COMPLETE. System restored to baseline state."
