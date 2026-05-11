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

# 2. Provision to unique temporary location for hardening
# This mitigates TOCTOU, ensures atomicity, and prevents naming collisions.
TMP_BIN=$(mktemp "$DEST_BIN.XXXXXX")
cp "$SRC_BIN" "$TMP_BIN"

# 3. Lockdown Permissions & Capabilities on the temporary file
chown root:root "$TMP_BIN"
chmod 755 "$TMP_BIN"

if [ -n "$CAPS" ] && [ "$CAPS" != "none" ]; then
    if command -v setcap >/dev/null 2>&1; then
        setcap "$CAPS" "$TMP_BIN"
    else
        echo "Warning: setcap not found. Capabilities not applied."
    fi
fi

# 4. Atomic Swap
mv "$TMP_BIN" "$DEST_BIN"

echo "Successfully provisioned $NAME at $DEST_BIN"
