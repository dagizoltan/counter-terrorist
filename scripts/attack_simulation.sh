#!/bin/bash

# 1. Start a "Malicious" process
echo "[SIMULATION] Spawning malicious process (sleep 500)..."
sleep 500 &
MALICIOUS_PID=$!
echo "[SIMULATION] Malicious PID: $MALICIOUS_PID"

# 2. Give it a moment to stabilize
sleep 1

# 3. Simulate eBPF detection of a suspicious ptrace() syscall from this PID
echo "[SIMULATION] Sending simulated eBPF ptrace alert to Orchestrator..."
curl -s -X POST http://localhost:8000/api/test/simulate-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secure-orchestrator-token-2026" \
  -d "{
    \"sidecar\": \"ebpf\",
    \"event\": {
      \"type\": \"SYSCALL_EVENT\",
      \"pid\": $MALICIOUS_PID,
      \"comm\": \"rootkit-demo\",
      \"syscall\": \"ptrace\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }
  }"

echo ""
echo "[SIMULATION] Waiting for Playbook execution..."
sleep 2

# 4. Verify the process was quarantined (killed)
if ps -p $MALICIOUS_PID > /dev/null; then
    echo "[SIMULATION] FAILED: Malicious process $MALICIOUS_PID is still running!"
    exit 1
else
    echo "[SIMULATION] SUCCESS: Malicious process $MALICIOUS_PID was automatically quarantined."
fi
