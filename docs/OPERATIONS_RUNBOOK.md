# Operations Runbook: Sovereign Security Orchestrator

## 1. Deployment Flow

### 1.1 Prerequisites
- Ubuntu 24.04 / 26.04 LTS.
- Deno 2.x runtime.
- Rust & Cargo (for sidecar compilation).
- TPM 2.0 (optional, required for high-integrity mode).

### 1.2 Installation
1. **Bootstrap**: Run `deno task bootstrap` to create directory structures and `.env` template.
2. **Build Agents**: Run `deno task build-agents` to compile Rust sidecars.
3. **Provision Integrity**: Run `deno task provision-integrity` to sign binaries and seal initial secrets to TPM.
4. **Service Installation**: Use `sudo deno task install-sovereign` to setup systemd units.

## 2. Incident Recovery

### 2.1 Recovering from Emergency Lockdown
If the system enters `PERMANENT LOCKDOWN` due to a hardware integrity failure or forensic breach:
1. Identify the reason in the orchestrator logs (or `/var/log/cts/orchestrator.log`).
2. Obtain a valid recovery token from the emergency vault.
3. Run:
   ```bash
   deno run -A scripts/recover.ts --token <RECOVERY_TOKEN>
   ```
4. This will clear the `["system", "lockdown"]` key in KV and allow the next boot sequence to proceed.

### 2.2 Forensic Data Acquisition
To export a signed evidence bundle for external analysis:
```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" "https://localhost:8000/api/forensics/export?limit=1000" > evidence.json
```

## 3. Maintenance Tasks

### 3.1 Rotating Sidecars
Sidecars rotate automatically every 6 hours. To force an immediate rotation of a specific agent:
```bash
curl -X POST -H "X-CT-Token: <CSRF>" "https://localhost:8000/api/agents/analyzer/restart"
```

### 3.2 Clearing Baselines
If system behavior changes significantly (e.g., after a major OS update), you may need to reset behavioral baselines:
1. Stop the orchestrator.
2. Run `deno run -A scripts/reset_baselines.ts`.
3. Start the orchestrator in Learning Mode (`SHADOW_MODE=true`).

## 4. Monitoring & Logs
- **System Logs**: `journalctl -u cts-orchestrator -f`
- **Audit Ledger**: View via UI at `/system/ledger` or query `/api/audit/logs`.
- **Metrics**: Real-time stats available at `/api/metrics`.
