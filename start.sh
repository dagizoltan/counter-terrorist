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

# Ensure Deno is available when running via sudo, including user-local installs.
DENO_BIN=$(command -v deno || true)
if [ -z "$DENO_BIN" ] && [ -n "$SUDO_USER" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    if [ -x "$USER_HOME/.deno/bin/deno" ]; then
        DENO_BIN="$USER_HOME/.deno/bin/deno"
    fi
fi
if [ -z "$DENO_BIN" ]; then
    echo "Error: deno not found in PATH. Please install Deno or run sudo with PATH preserved:"
    echo "  sudo env \"PATH=\$PATH\" ./start.sh"
    exit 1
fi

echo "[DEPLOY] Starting Security Orchestrator..."
"$DENO_BIN" run --allow-all --unstable-kv orchestrator/main.ts
