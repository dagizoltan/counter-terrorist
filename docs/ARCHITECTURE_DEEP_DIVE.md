# 🔬 System Architecture & Deep Dive Reference

## Overview & Paradigm

The Counter-Terrorist Security Orchestrator is an autonomous, real-time threat detection, deception, and automated response engine. It is built on a hybrid architecture:
1. **Deno / TypeScript (DDD Engine):** High-level orchestration, state management, API routes, CommandBus dispatching, event correlation, and web user interfaces.
2. **Native Rust Sidecars (Ring 0 / Low-Level Introspection):** eBPF kernel probes, fanotify file integrity monitors, raw packet capture (`netcap`), hardware TPM 2.0 attestation (`trustroot`), and native network filtering (`enforcer` & `enforcer-win`).

---

## Data Plane & Data Flows

### 1. Zero-Copy Shared Memory IPC (`cts_ipc`)
Sidecar telemetry is transmitted via ring buffers in shared memory (`/dev/shm`):
- **Ring Buffer Layout:** `[0..4]` Head (`AtomicU32`), `[4..8]` Tail (`AtomicU32`), `[8..12]` Capacity (`u32`), `[16..]` Message Payload.
- **Security:** Ed25519 payload signatures (`verify_ed25519`), multi-byte XOR obfuscation (`CTS_MESH_SECRET`), and sealed memory execution (`SYS_memfd_create` with `F_SEAL_WRITE`).

```
┌─────────────────────┐      /dev/shm Ring Buffer      ┌─────────────────────────┐
│ Rust Agent          ├───────────────────────────────►│ Deno SidecarManager     │
│ (sentinel/watchfile)│  Atomic Head/Tail + Ed25519    │ (EventMediator Batcher) │
└─────────────────────┘                                └────────────┬────────────┘
                                                                    │
                                                                    ▼
                                                       ┌─────────────────────────┐
                                                       │ EventBus / UI Broadcast │
                                                       └─────────────────────────┘
```

### 2. EventMediator & Telemetry Batching (`EventMediator.ts`)
- **Backpressure & Load-Shedding:** High-frequency syscalls (`sentinel`) and network logs (`netcap`) are queued up to `MAX_QUEUE_DEPTH = 5000`.
- **Periodic Flush:** Batches are dispatched to the `EventBus` every 100ms (`EBPF_SYSCALL_BATCH`, `NETWORK_LOG_BATCH`).
- **Provisional Geo Enrichment:** `UI_BROADCAST` threats missing spatial coordinates are dynamically enriched with GeoIP metadata before WebSocket broadcast.

### 3. Active Network Socket & Process Attribution (`ActiveSocketService.ts`)
- Enumerates TCP/UDP socket inodes via `/proc/net/tcp` and `/proc/net/udp`.
- Resolves socket inodes to process PIDs and executable names via `/proc/[pid]/fd`.
- Links remote socket endpoints to GeoIP coordinates and Autonomous Response triggers.

---

## State Persistence & Ledger Integrity

### 1. Deno KV & Optimistic Concurrency Control
- State and audit deltas persist in `./volume/storage/orchestrator.db`.
- `KvRepository` implements Optimistic Concurrency Control (OCC) using atomic transaction checks (`kv.atomic().check(...)`) with randomized exponential backoff jitter.
- Enforces strict read-only mode (`FORENSIC_RESTRICTED`) when system integrity tampering is detected.

### 2. Cryptographic Audit Ledger (`AuditService.ts`)
- SHA-256 hash-chained WORM (Write Once Read Many) log sequence.
- Dev-mode auto-healing boundary (`healDevChainBoundary`) detects legacy/corrupted KV audit heads during startup and inserts a secure boundary marker without stopping execution.
