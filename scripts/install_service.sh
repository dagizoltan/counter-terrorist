#!/bin/bash
set -e

SERVICE_NAME="sovereign"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
WORKING_DIR="$(pwd)"

echo "Installing Sovereign systemd service..."

cat <<EOF > "$SERVICE_PATH"
[Unit]
Description=Sovereign Defense Enterprise Security Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${WORKING_DIR}
ExecStart=deno task start
Restart=always
RestartSec=5s
LimitNOFILE=65536
LimitMEMLOCK=infinity

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$SERVICE_PATH"
systemctl daemon-reload || true
echo "Sovereign systemd service registered at ${SERVICE_PATH}"
