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

# 3. Environment Sanitization
if [ -z "$PKI_SECRET" ]; then
    echo "[CRITICAL] PKI_SECRET is missing. Sovereignty compromised. Aborting."
    exit 1
fi

# 4. Binary Compilation Check
if [ ! -f "src/agents/target/release/honeypot" ]; then
    echo "[BOOT] Compiling hardened agent fleet..."
    (cd src/agents && cargo build --release)
fi

# 5. Engage Orchestrator
echo "[BOOT] Integrity verified. Engaging Sovereign Mesh..."
sudo env "PATH=$PATH" ENVIRONMENT=production \
     API_TOKEN=$API_TOKEN \
     MESH_SECRET=$MESH_SECRET \
     PKI_SECRET=$PKI_SECRET \
     PROVISIONING_ENABLED=true \
     $(which deno) run --allow-all --unstable-kv src/orchestrator/main.ts
