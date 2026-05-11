#!/bin/bash
# Sovereign Secure Spawn Utility
# Moves and prepares sidecar binaries in a root-protected jail.
# Mitigates TOCTOU by ensuring verification happens in a non-user-writable path.

set -e

NAME=$1
SRC_BIN=$2
CAPS=$3
DEST_DIR="/var/lib/cts/bin"
DEST_BIN="$DEST_DIR/$NAME"

if [ -z "$NAME" ] || [ -z "$SRC_BIN" ]; then
    echo "Usage: $0 <name> <src_bin> [caps]"
    exit 1
fi

# 1. Create secure jail if missing
mkdir -p "$DEST_DIR"

# 2. Atomic Copy to jail
# Use 'cp' then 'mv' for atomicity if on same FS, or just 'cp' to root-owned dir
cp "$SRC_BIN" "$DEST_BIN"

# 3. Lockdown Permissions
chown root:root "$DEST_BIN"
chmod 755 "$DEST_BIN"

# 4. Apply Linux Capabilities (Ring 0 Parity)
if [ -n "$CAPS" ] && [ "$CAPS" != "none" ]; then
    if command -v setcap >/dev/null 2>&1; then
        setcap "$CAPS" "$DEST_BIN"
    else
        echo "Warning: setcap not found. Capabilities not applied."
    fi
fi

echo "Successfully provisioned $NAME at $DEST_BIN"
