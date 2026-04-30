#!/bin/bash

# This script grants the current user permission to run 'ufw' commands via sudo without a password.
# This allows the Security Orchestrator to manage the firewall while running as a standard user.

# Determine the actual user (even if running via sudo)
USER_NAME=${SUDO_USER:-$(whoami)}
RULE_FILE="/etc/sudoers.d/cts-firewall"

echo "[SETUP] Granting $USER_NAME passwordless sudo access to 'ufw'..."

# Create a temporary sudoers file
cat <<EOF > cts-firewall-tmp
# Counter-Terrorist Security Orchestrator Firewall Permissions
$USER_NAME ALL=(ALL) NOPASSWD: /usr/sbin/ufw
EOF

# Use visudo to check syntax and install it safely
sudo visudo -cf cts-firewall-tmp
if [ $? -eq 0 ]; then
    sudo mv cts-firewall-tmp $RULE_FILE
    sudo chmod 0440 $RULE_FILE
    echo "[SUCCESS] Firewall permissions configured. Orchestrator can now manage ufw natively."
else
    echo "[ERROR] Invalid sudoers syntax. Permissions NOT applied."
    rm cts-firewall-tmp
    exit 1
fi
