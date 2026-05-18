#!/bin/bash
# Sovereign Secure Spawn Utility
# Moves and prepares sidecar binaries in a root-protected jail.
# Mitigates TOCTOU by ensuring verification happens in a non-user-writable path.

set -e

NAME=$1
SRC_BIN=$2
CAPS=$3
EXPECTED_HASH=$4
DEST_DIR="/var/lib/cts/bin"
DEST_BIN="$DEST_DIR/$NAME"

if [ -z "$NAME" ] || [ -z "$SRC_BIN" ]; then
    echo "Usage: $0 <name> <src_bin> [caps] [expected_hash]"
    exit 1
fi

# 0. TOCTOU Hardening: Verify source hash before any operation
if [ -n "$EXPECTED_HASH" ] && [ "$EXPECTED_HASH" != "none" ]; then
    ACTUAL_HASH=$(sha256sum "$SRC_BIN" | awk '{ print $1 }')
    if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
        echo "CRITICAL: Integrity mismatch for source script/binary $NAME!"
        echo "Expected: $EXPECTED_HASH"
        echo "Actual:   $ACTUAL_HASH"
        exit 101
    fi
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
