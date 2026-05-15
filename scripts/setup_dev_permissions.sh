#!/bin/bash
# Sovereign Permission Hardening Utility (Development Mode)
# This script configures the host to allow the Orchestrator to manage sidecars
# without interactive sudo prompts, using a restricted sudoers policy.

set -e

USER_NAME=${SUDO_USER:-$(id -un)}
WORKSPACE_DIR=$(pwd)
SUDOERS_FILE="/etc/sudoers.d/cts-dev-$USER_NAME"

echo "[SETUP] Initiating permanent permission fix for user: $USER_NAME"

# 1. Create necessary system directories
sudo mkdir -p /var/lib/cts/bin /var/lib/cts/scripts
sudo chown -R $USER_NAME:$USER_NAME /var/lib/cts

# 2. Generate restricted sudoers policy
# This allows the user to run the specific sidecar binaries with 'sudo -n' without a password.
echo "[SETUP] Generating sudoers policy..."

CAT_CMD="cat <<EOF > cts_sudoers
# Sovereign Orchestrator - Dev Permissions for $USER_NAME
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/analyzer
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/enforcer
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/sentinel
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/sentinel-darwin
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/telemetry-win
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/decoy
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/netcap
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/watchfile
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/trustroot
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/tunnel
$USER_NAME ALL=(ALL) NOPASSWD: $WORKSPACE_DIR/src/agents/target/release/enforcer-win
$USER_NAME ALL=(ALL) NOPASSWD: /usr/sbin/ufw
$USER_NAME ALL=(ALL) NOPASSWD: /usr/bin/systemctl
$USER_NAME ALL=(ALL) NOPASSWD: /usr/bin/ping
$USER_NAME ALL=(ALL) NOPASSWD: /usr/bin/nmcli
$USER_NAME ALL=(ALL) NOPASSWD: /usr/sbin/ip
EOF"

eval "$CAT_CMD"

sudo mv cts_sudoers "$SUDOERS_FILE"
sudo chmod 440 "$SUDOERS_FILE"
sudo chown root:root "$SUDOERS_FILE"

echo "[SUCCESS] Permissions fixed permanently."
echo "[INFO] The orchestrator can now spawn privileged sidecars via 'sudo -n' without a password."
echo "[INFO] Policy installed at: $SUDOERS_FILE"
