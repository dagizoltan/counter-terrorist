#!/bin/bash

# Start a target process
echo "[CHAOS] Starting target process..."
sleep 1000 &
TARGET_PID=$!
echo "[CHAOS] Target PID: $TARGET_PID"

# Simulate a suspicious ptrace attempt
# In a real scenario, this would be detected by eBPF
# Since eBPF is not yet active, we can manually trigger the event bus if we had a way,
# or we can just wait for eBPF to be active.

# For now, let's just use this to verify the 'blocker' can actually kill it
echo "[CHAOS] Testing blocker manual kill via curl..."
curl -s -X POST http://localhost:8000/api/protection/blocker/kill \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secure-orchestrator-token-2026" \
  -d "{\"pid\": $TARGET_PID}"

sleep 1
if ps -p $TARGET_PID > /dev/null; then
    echo "[CHAOS] FAILED: Process $TARGET_PID still alive."
else
    echo "[CHAOS] SUCCESS: Process $TARGET_PID killed."
fi
