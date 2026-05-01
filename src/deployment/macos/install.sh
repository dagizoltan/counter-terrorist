#!/bin/bash
# Counter-Terrorist macOS Installation Script
# Must be run with sudo

set -e

INSTALL_DIR="/usr/local/lib/counter-terrorist"
BIN_DIR="/usr/local/bin"
LOG_DIR="/var/log/cts"
PLIST_DIR="/Library/LaunchDaemons"
PLIST_NAME="com.cts.orchestrator.plist"

echo "--- 🌍 Deploying Counter-Terrorist for macOS ---"

# 1. Create Directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/agents"
mkdir -p "$LOG_DIR"

# 2. Generate Secure Environment
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "[CTS] Generating secure tokens..."
    API_TOKEN=$(openssl rand -hex 24)
    MESH_SECRET=$(openssl rand -hex 24)
    cat <<EOF > "$ENV_FILE"
PORT=8000
API_TOKEN=$API_TOKEN
MESH_SECRET=$MESH_SECRET
LOG_LEVEL=INFO
ENVIRONMENT=production
EOF
    chmod 600 "$ENV_FILE"
fi

# 3. Register LaunchDaemon
echo "[CTS] Registering LaunchDaemon..."
cp "./$PLIST_NAME" "$PLIST_DIR/$PLIST_NAME"
chmod 644 "$PLIST_DIR/$PLIST_NAME"
chown root:wheel "$PLIST_DIR/$PLIST_NAME"

# 4. Binary Symlink
if [ -f "./counter-terrorist" ]; then
    cp "./counter-terrorist" "$BIN_DIR/counter-terrorist"
    chmod +x "$BIN_DIR/counter-terrorist"
fi

# 5. Load Service
echo "[CTS] Loading service..."
launchctl unload "$PLIST_DIR/$PLIST_NAME" 2>/dev/null || true
launchctl load "$PLIST_DIR/$PLIST_NAME"

echo "✅ Installation Complete. Orchestrator is running."
echo "Logs: tail -f $LOG_DIR/orchestrator.log"
echo "Dashboard: http://localhost:8000"
