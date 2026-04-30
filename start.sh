#!/bin/bash

# Security Orchestrator Local Deployment Script
# This script requires root privileges to manage firewalls and monitor system files.

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (sudo ./start.sh)" 
   exit 1
fi

echo "[DEPLOY] Loading environment configuration..."
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found."
    exit 1
fi

echo "[DEPLOY] Checking for sidecar binaries..."
MISSING_BINARIES=()
SIDECARS=("scanner" "blocker" "honeypot" "fim")

for sidecar in "${SIDECARS[@]}"; do
    if [ ! -f "agents/target/release/$sidecar" ]; then
        MISSING_BINARIES+=("$sidecar")
    fi
done

if [ ${#MISSING_BINARIES[@]} -ne 0 ]; then
    echo "Warning: Missing binaries for: ${MISSING_BINARIES[*]}"
    echo "Attempting to build missing agents..."
    cd agents && cargo build --release && cd ..
fi

echo "[DEPLOY] Starting Security Orchestrator..."
deno run --allow-all --unstable-kv orchestrator/main.ts
