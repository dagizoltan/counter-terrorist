#!/bin/bash
# Sovereign OS Security Provisioner
# Configures the host environment for unprivileged orchestrator execution.

set -e

ORCHESTRATOR_USER="cts-orchestrator"
BIN_DIR="/var/lib/cts/bin"
DATA_DIR="/var/lib/cts/data"
LOG_DIR="/var/log/cts"

echo "[PROVISION] Hardening Host OS for Ghost-Command..."

# 1. Create Orchestrator User
if ! id "$ORCHESTRATOR_USER" &>/dev/null; then
    echo "- Creating unprivileged user: $ORCHESTRATOR_USER"
    useradd -r -s /bin/false "$ORCHESTRATOR_USER"
fi

# 2. Setup Secure Directory Structure
echo "- Initializing secure directories..."
mkdir -p "$BIN_DIR" "$DATA_DIR" "$LOG_DIR"

# BIN_DIR: Root-owned, world-readable (for execution), but only root-writable
chown root:root "$BIN_DIR"
chmod 755 "$BIN_DIR"

# DATA_DIR: Orchestrator-owned for DB and state
chown "$ORCHESTRATOR_USER:$ORCHESTRATOR_USER" "$DATA_DIR"
chmod 700 "$DATA_DIR"

# LOG_DIR: Orchestrator-owned for system logs
chown "$ORCHESTRATOR_USER:$ORCHESTRATOR_USER" "$LOG_DIR"
chmod 755 "$LOG_DIR"

# 3. Setup Sudo Permissions for secure_spawn.sh
# We allow the unprivileged user to execute ONLY the secure_spawn.sh script as root.
SUDO_FILE="/etc/sudoers.d/cts-orchestrator"
echo "- Configuring granular sudo access..."
echo "$ORCHESTRATOR_USER ALL=(root) NOPASSWD: /var/lib/cts/scripts/secure_spawn.sh" > "$SUDO_FILE"
chmod 440 "$SUDO_FILE"

# 4. Copy scripts to secure location
echo "- Staging security scripts..."
mkdir -p /var/lib/cts/scripts
cp scripts/secure_spawn.sh /var/lib/cts/scripts/
chown root:root /var/lib/cts/scripts/secure_spawn.sh
chmod 755 /var/lib/cts/scripts/secure_spawn.sh

# 5. Pre-Apply Baseline Capabilities (Optional but recommended)
# Note: secure_spawn.sh handles this dynamically, but we can set defaults here.
if command -v setcap >/dev/null 2>&1; then
    echo "- Applying baseline capabilities to sidecars..."
    # Ensure binary directory exists
    mkdir -p "$BIN_DIR"

    # These are examples; in production, they are applied during sidecar deployment
    # setcap cap_net_admin,cap_net_raw+ep "$BIN_DIR/netcap" 2>/dev/null || true
    # setcap cap_net_admin,cap_kill+ep "$BIN_DIR/enforcer" 2>/dev/null || true
fi

# 6. Ensure orchestrator user can read source for Deno execution
echo "- Adjusting source permissions..."
chown -R "$ORCHESTRATOR_USER:$ORCHESTRATOR_USER" .
# But ensure scripts are root-owned and not user-writable
chown root:root scripts/*.sh
chmod 755 scripts/*.sh

echo "✅ OS Hardening Complete. Orchestrator can now run as '$ORCHESTRATOR_USER'."
