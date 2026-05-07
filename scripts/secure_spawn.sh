#!/bin/bash
set -e
NAME=$1
SRC_BIN=$2
DEST_DIR="/var/lib/cts/bin"
DEST_BIN="$DEST_DIR/$NAME"
CAPS=$3

mkdir -p "$DEST_DIR"
cp "$SRC_BIN" "$DEST_BIN"
chown root:root "$DEST_BIN"
chmod 755 "$DEST_BIN"

if [ -n "$CAPS" ]; then
    setcap "$CAPS" "$DEST_BIN"
fi

# Execute from the secure location
# Note: Since this script is called by SystemExecutor (unprivileged)
# it won't be able to chown to root unless the orchestrator is root or script is sudo'd.
# The orchestrator is designed to delegate to sidecars via sudo -n.
