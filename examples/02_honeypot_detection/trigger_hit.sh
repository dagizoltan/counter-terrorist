#!/bin/bash
# Example 02: Honeypot Detection & Automated Forensics
# This script simulates an attacker probing the orchestrator's decoys.

# 1. Identify the target (defaulting to the Alpha node in the Docker mesh)
TARGET_IP=${1:-"172.20.0.10"}

# 2. Probe the SSH Decoy (Port 22)
echo "[ATTACKER] Probing SSH Decoy at $TARGET_IP:22..."
timeout 2 nc -v $TARGET_IP 22

# 3. Probe the Redis Decoy (Port 6379)
echo "[ATTACKER] Probing Redis Decoy at $TARGET_IP:6379..."
timeout 2 nc -v $TARGET_IP 6379

echo ""
echo "RESULTS TO OBSERVE IN ORCHESTRATOR LOGS:"
echo "1. [HONEYPOT] Triggered: Access to 22 from <your_ip>"
echo "2. [FIREWALL] Blocking IP <your_ip> due to high-confidence decoy hit."
echo "3. [PCAP] Initiating automated capture: honeypot_hit_<your_ip>_*.pcap"
