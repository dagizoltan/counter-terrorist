#!/bin/bash
# Bring a node up.
#
# Thin wrapper over `deno task up` for anyone who reaches for ./start.sh.
# The build orchestration, staleness checks and run control all live in
# tools/ops/lifecycle.ts — this only adds the two things a shell is better at:
# privilege dropping, and the pre-flight warnings that need system binaries.
#
# What used to be here (env parsing, a "is trustroot built?" check, a
# duplicated deno invocation) is gone: .env is loaded by the orchestrator's
# own config layer, and the build state is tracked properly rather than
# guessed from one file's existence.

set -euo pipefail
cd "$(dirname "$0")/../../../.."

ORCHESTRATOR_USER="cts-orchestrator"

# ── Pre-flight warnings ───────────────────────────────────────────────────
command -v tpm2_pcrread >/dev/null 2>&1 || \
  echo "[warn] TPM2 tools not found — hardware integrity cannot be enforced."

if [ -d "./volume" ]; then
  MOUNT_INFO="$(df ./volume 2>/dev/null | tail -1)"
  case "$MOUNT_INFO" in
    */dev/mapper/*|*tmpfs*) ;;
    *) echo "[warn] ./volume is not on an encrypted mapper device — data at rest is unprotected." ;;
  esac
fi

# ── Drop privileges before doing any work ─────────────────────────────────
# Re-exec as the unprivileged service account if we are root and it exists, so
# the build and the node both run without privilege. systemd handles this with
# User=/Group=; this is for the manual path.
if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  if id "$ORCHESTRATOR_USER" >/dev/null 2>&1; then
    echo "[boot] dropping privileges to $ORCHESTRATOR_USER"
    exec sudo -u "$ORCHESTRATOR_USER" --preserve-env=PATH,ENVIRONMENT,PROVISIONING_ENABLED \
      deno task up "$@"
  else
    echo "[warn] running as root; $ORCHESTRATOR_USER not found."
    echo "       run scripts/provision_os_security.sh to create it."
  fi
fi

exec deno task up "$@"
