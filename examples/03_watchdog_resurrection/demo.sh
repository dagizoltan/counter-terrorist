#!/bin/bash
# Example 03: Watchdog Resurrection Demo
# This script demonstrates the 'Unkillable' autonomous watchdog.

# 1. Find the main orchestrator process
ORCH_PID=$(pgrep -f "src/orchestrator/main.ts" | head -n 1)

if [ -z "$ORCH_PID" ]; then
  echo "ERROR: Orchestrator is not running. Start it with 'deno task start' first."
  exit 1
fi

echo "[SYSTEM] Orchestrator is active at PID: $ORCH_PID"
echo "[SYSTEM] Shadow Watchdog is monitoring in the background..."

# 2. Simulate a crash or manual termination
echo "[ATTACKER] Attempting to terminate orchestrator (kill -9)..."
kill -9 $ORCH_PID

echo "[SYSTEM] Orchestrator PID $ORCH_PID terminated. Monitoring for resurrection..."

# 3. Wait and verify
for i in {1..10}; do
  sleep 1
  NEW_PID=$(pgrep -f "src/orchestrator/main.ts" | grep -v "$ORCH_PID")
  if [ ! -z "$NEW_PID" ]; then
    echo "[SUCCESS] Ghost_Command resurrected at PID: $NEW_PID"
    exit 0
  fi
  echo "...waiting..."
done

echo "[FAILURE] Orchestrator failed to resurrect."
exit 1
