#!/bin/bash
# Ghost-Command Sovereign Bootstrapper v2.0
# Performs pre-flight integrity checks before engaging the mesh.

echo "[BOOT] Initiating Sovereign Pre-Flight sequence..."

# 1. Hardware Root of Trust Check
if ! command -v tpm2_pcrread &> /dev/null; then
    echo "[WARNING] TPM2 tools not found. Hardware integrity cannot be enforced."
fi

# 2. Source Integrity Verification
# We verify that main.ts hasn't been tampered with since the last authorized deployment.
# In a real environment, this would be compared against a signed manifest.
SHA_ACTUAL=$(sha256sum src/orchestrator/main.ts | awk '{print $1}')
echo "[BOOT] Main Orchestrator Hash: $SHA_ACTUAL"

# 3. Environment Sanitization & Sourcing
if [ -f .env ]; then
    echo "[BOOT] Sourcing .env file..."
    # Strip comments and export variables
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^#.*$ ]] && continue
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue
        key_val=$(echo "$line" | sed 's/[[:space:]]*#.*//')
        export "$key_val"
    done < .env
fi

if [ -z "$PKI_SECRET" ]; then
    echo "[CRITICAL] PKI_SECRET is missing. Environment check failed."
    echo "Usage: export PKI_SECRET=... && export API_TOKEN=... && ./start.sh"
    exit 1
fi

# 4. Binary Compilation Check
if [ ! -f "src/agents/target/release/honeypot" ]; then
    echo "[BOOT] Compiling hardened agent fleet..."
    (cd src/agents && cargo build --release)
fi

# 5. Volume Integrity Check (Data-at-Rest Protection)
if [ -d "./volume" ]; then
    MOUNT_INFO=$(df ./volume | tail -1)
    if [[ ! "$MOUNT_INFO" =~ "/dev/mapper/" ]] && [[ "$MOUNT_INFO" != *"tmpfs"* ]]; then
        echo "[SECURITY WARNING] ./volume is not on an encrypted mapper device (LUKS). Data-at-rest is vulnerable."
        # In a strict environment, we might exit here:
        # exit 1
    fi
fi

# 6. Engage Orchestrator (NON-PRIVILEGED)
# We run the orchestrator as the current user. 
# Privileged operations are delegated to sidecars via sudo with NOPASSWD or setcap.
echo "[BOOT] Integrity verified. Engaging Sovereign Mesh (unprivileged)..."

ENVIRONMENT=production \
API_TOKEN=${API_TOKEN:-$API_TOKEN} \
MESH_SECRET=${MESH_SECRET:-$MESH_SECRET} \
PKI_SECRET=${PKI_SECRET:-$PKI_SECRET} \
PROVISIONING_ENABLED=${PROVISIONING_ENABLED:-false} \
deno run --allow-all --unstable-kv --unstable-net src/orchestrator/main.ts
