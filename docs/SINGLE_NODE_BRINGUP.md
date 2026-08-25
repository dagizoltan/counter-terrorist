# Single-Node Bring-Up

How to bring the orchestrator up on one Ubuntu host, and what each step actually
guarantees. Verified end-to-end on Ubuntu 24.04 / x86_64 / Deno 2.9 / Rust 1.94.

## 1. Prerequisites

| Component | Needed for | If missing |
|---|---|---|
| Deno ≥ 2.x | orchestrator | hard requirement |
| Rust + Cargo | agent fleet | hard requirement |
| systemd (PID 1) | per-agent cgroup gating | agents still spawn, **without** CPUQuota/MemoryMax/ProtectProc |
| TPM 2.0 (`/dev/tpm*`) | PCR attestation, sealed secrets | `trustroot` falls back to a software vTPM; production refuses to boot |
| `ufw` | firewall enforcement | blocklist actions become no-ops |
| `iproute2` (`ss`) | honeypot port-collision checks | decoy port morphing degrades |

Nothing in the list except Deno and Cargo blocks the boot. Everything else
degrades a subsystem and says so in the audit log.

## 2. Bring-up

```bash
deno task up
```

One command. It generates `.env` with CSPRNG secrets if absent, builds the Rust
agents, refreshes the sidecar integrity manifest, rebuilds the stylesheet, and
starts the node. Each step is skipped when its inputs are unchanged, so the
first run takes about a minute and subsequent runs add ~100ms.

`deno task status` reports what is running and what is stale. `deno task stop`
shuts the node down gracefully.

For a production profile, generate the environment explicitly first:
`deno task setup -- --production`. That sets `STRICT_HARDWARE_INTEGRITY=true`
and `ALLOW_HARDWARE_BYPASS=false`, which a host without a working TPM 2.0 stack
cannot satisfy — the boot will abort by design. The default profile is
`ENVIRONMENT=development`, `SINGLE_NODE=true`.

The dashboard is on `https://localhost:8000` behind a self-signed cert. Get the
API token with `grep '^API_TOKEN' .env`.

### Why the manifest refresh is chained to the agent build

Every non-dev spawn checks the agent binary's SHA-256 against
`src/orchestrator/infrastructure/runtime/sidecars.manifest.json`. Those hashes are
specific to whoever built the binaries, so a fresh clone's committed hashes will
not match your build, and **every sidecar is refused until the manifest is
refreshed**. The symptom is `CRITICAL: Sidecar <name> integrity check failed`
for the whole fleet — a node that reports a successful boot while running no
agents at all.

This used to be a step you had to remember. `deno task up` now tracks the agent
binaries by fingerprint and refreshes the manifest whenever they change, so the
two cannot drift apart. If you invoke `cargo build` directly, run
`deno task build` afterwards to resync.

Editing the manifest invalidates its Ed25519 signature. In development that is
logged and tolerated; in production an unsigned manifest without an
`upgrade_token` aborts the boot. Re-sign with `scripts/sign_manifest.ts`.

## 3. What SINGLE_NODE changes

`SINGLE_NODE=true` is a topology declaration, not a feature flag:

- `MeshManager.startDiscovery()` returns early — no subnet sweep, no mDNS listener.
- `ConsensusManager.requestQuorumCommand()` auto-approves — no waiting on peers
  that will never answer.

It does **not** disable local telemetry. `NetworkDiscoveryService` still sweeps
the LAN every 20s for host visibility; that is deliberate, and separate from mesh
peering.

## 4. Verifying the node is healthy

```bash
TOKEN=$(grep '^API_TOKEN' .env | cut -d'"' -f2)
curl -sk https://localhost:8000/api/status                              # expect 401
curl -sk -H "Authorization: Bearer $TOKEN" https://localhost:8000/api/status  # expect 200
```

A healthy single node reaches `Sovereign Orchestrator fully engaged` in about one
second and runs eight agent processes on Linux: `analyzer`, `decoy`, `enforcer`,
`netcap`, `sentinel`, `trustroot`, `tunnel`, `watchfile`. Confirm with:

```bash
DPID=$(pgrep -x deno | head -1)
for p in $(ps -eo pid,ppid --no-headers | awk -v d=$DPID '$2==d{print $1}'); do
  readlink /proc/$p/exe
done
```

Agents execute from sealed `memfd` images, so `/proc/<pid>/exe` reads
`/memfd:cts-agent-<name> (deleted)`. That is expected, not tampering.

## 5. Expected noise on a TPM-less host

These are correct and loud by design; they are not bring-up failures:

```
CRITICAL: Hardware Integrity Mismatch against NVRAM Golden Hash!
WARNING: RUNNING IN UNSAFE BYPASS MODE. System integrity is NOT hardware-verified.
No systemd manager detected. Agents will be spawned directly without cgroup resource gating
```

The bypass is only honoured when `SECURE_ENVIRONMENT_TOKEN` equals
`SECURE_BYPASS_TOKEN`, both are ≥ 32 characters, and `ENVIRONMENT != production`.

## 6. Running as a service

`src/deployment/linux/systemd/counter-terrorist.service` is the supported
production wrapper and is where real confinement lives — `ProtectSystem=strict`,
`NoNewPrivileges`, a pinned `CapabilityBoundingSet`. The Deno permission flags in
`deno task start` narrow the runtime; they are not the security boundary on their
own.
