# 🛠️ Architecture Reverse Engineering & Local Build Playbook

## System Architecture Overview

The Counter-Terrorist Security Orchestrator (v7.1-PRODUCTION) employs a multi-tiered security model combining the sandbox safety of Deno with low-level kernel introspection in native Rust sidecar agents.

```
                  ┌─────────────────────────────────────────┐
                  │          HTTP/WebSocket Dashboard        │
                  └────────────────────┬────────────────────┘
                                       │
                  ┌────────────────────▼────────────────────┐
                  │    Deno Orchestrator (DDD Core Engine)  │
                  └──────┬───────────────────────────┬──────┘
                         │                           │
          ┌──────────────▼─────────────┐   ┌─────────▼──────────────┐
          │  Active Guard Deception    │   │  Hardware Root of Trust│
          │  Honeypots / Morphing Ports│   │  TPM Sealed WORM Log  │
          └──────────────┬─────────────┘   └─────────┬──────────────┘
                         │                           │
    ┌────────────────────▼───────────────────────────▼──────────────────┐
    │  Ring 0 Kernel Introspection & Enforcement (Rust Sidecars)        │
    │  • eBPF LSM Process Isolation (sentinel)                            │
    │  • Active Guard File Integrity / fanotify (watchfile)             │
    │  • Instant Containment / Privilege Escalation (enforcer)          │
    └───────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Deno Orchestrator (`src/orchestrator/`)
- **App Engine (`SovereignApp`):** Initializes via a strict 7-phase boot sequence.
- **Domain Services:** Autonomous response, behavioral anomaly scoring, threat intelligence syncing, deception morphing, active network socket monitoring (`ActiveSocketService`), and forensic causal graph generation.
- **EventMediator (`event_mediator.ts`):** Buffers high-volume telemetry (`MAX_QUEUE_DEPTH = 5000`) and periodically flushes batches every 100ms. Enriches incoming threat indicators with GeoIP coordinates (`enrichThreatGeo`).
- **State Persistence:** Persistent storage layer (`kv_store.ts` & `kv_repository.ts`) built on Deno KV with Optimistic Concurrency Control (OCC) and randomized exponential backoff jitter. Supports read-only execution modes during `FORENSIC_RESTRICTED` state.

### 2. Core C-ABI IPC & Security Libraries (`src/agents/cts_ipc` & `src/agents/cts_sec`)
- **`cts_ipc`:** Zero-copy lock-free ring buffer in shared memory (`/dev/shm`) using atomic head/tail pointers (`AtomicU32`), MessagePack serialization, Ed25519 signature validation, and multi-byte XOR obfuscation keys (`CTS_MESH_SECRET`).
- **`cts_sec`:**
  - AVX2/NEON SIMD-accelerated string/memory XOR morphing routines.
  - Sealed memory file creation (`create_sealed_memfd`) utilizing `SYS_memfd_create` and `F_ADD_SEALS` (`F_SEAL_WRITE`) to execute agent binaries directly from memory, preventing TOCTOU file tampering on disk.

### 3. Native System Agents (`src/agents/`)
- **`sentinel`:** eBPF/LSM Linux kernel tracer built with `aya` (BpfLoader CO-RE/BTF relocations). Maintains an in-kernel `TRUSTED_PIDS` HashMap ("Quiet Mode") to suppress redundant sidecar telemetry overhead at the kernel boundary.
- **`analyzer`:** Syscall sequence anomaly scoring (15-min TTL sliding window) and kernel integrity attestation (inspects taint flags, lockdown mode, and unmanaged kernel modules).
- **`enforcer` & `enforcer-win`:** Low-level network filtering (eBPF/iptables on Linux, native Windows Filtering Platform `FWPM_LAYER_INBOUND_IPPACKET_V4` on Windows) and emergency process containment (`cap_net_admin`, `cap_kill`).
- **`netcap`:** High-throughput network packet capture and raw socket inspection (`cap_net_raw`).
- **`trustroot`:** Hardware Root-of-Trust manager using TCG TSS2 C FFI bindings (`libtss2-esys`) for physical TPM 2.0 chips and cloud vTPMs (AWS Nitro/Azure) with PCR bank sealing/unsealing.
- **`watchfile`:** eBPF/fanotify file integrity monitor detecting unauthorized mutations in protected directory trees.
- **`tunnel`:** Encrypted mesh overlay and WireGuard VPN lifecycle controller.
- **`decoy`:** High-interaction deception grid honeypot node supporting interactive SSH/Redis/HTTP banners.

---

## 🚀 Local Build & Startup Guide

### System Prerequisites
- **Deno (v2.x):** Binary installed at `deno` (or installed via `./install_deno.sh`).
- **Rust & Cargo:** `stable-x86_64-unknown-linux-gnu` toolchain.
- **Linux Packages:** `build-essential`, `clang`, `llvm`, `pkg-config`, `libssl-dev`, `wireguard-tools` (`wg-quick`), `ufw`.

---

### Step 1: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `.env` contains valid, high-entropy secrets (minimum 32 characters each):
```env
API_TOKEN=a_very_long_secure_random_api_token_32chars
SECURE_BYPASS_TOKEN=a_very_long_secure_random_bypass_token_32c
PKI_SECRET=a_very_long_secure_random_pki_secret_key_32c
MESH_SECRET=a_very_long_secure_random_mesh_secret_key_32c
ENVIRONMENT=development
PORT=8000
```

### Step 2: Bootstrap Storage & Environment
```bash
deno task bootstrap
```

### Step 3: Build Rust Native Agents
Compile all native Rust agents in release mode and automatically update the SHA-256 hashes in `sidecars.manifest.json`:
```bash
deno task build-agents
```

### Step 4: Run Pre-flight System Verification
```bash
deno task provision-integrity
```

### Step 5: Execute System Test Suite
Execute the full integration and property-based test suite (281 test cases):
```bash
deno test --allow-all --unstable-kv --no-check tests/
```

### Step 6: Start the System
- **Development Mode (with live reload):**
  ```bash
  deno task dev
  ```
- **Production Mode (with strict sandbox flags):**
  ```bash
  deno task start
  ```

Once running, access the dashboard at **`http://localhost:8000`**.
