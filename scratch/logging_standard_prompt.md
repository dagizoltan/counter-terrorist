# Logging Standardization Prompt

**Goal:** Standardize logging across the Counter-Terrorist orchestrator and sidecars to ensure consistent forensics, proper type/severity usage, and clear attribution in the `caller` field.

---

### 1. Caller Field Format Requirements
All logs must have a `caller` field following these strict patterns:

- **Orchestrator Logs (Deno):** `orchestrator:(subsystem):(module)` or `orchestrator:(subsystem):(module):(sub-module)`
    - *Subsystems:* `app`, `core`, `domain`, `infra`, `interface`.
    - *Examples:*
        - `orchestrator:infra:runtime:sidecar_manager`
        - `orchestrator:domain:protection:honeypot`
        - `orchestrator:interface:web:api:ws`
        - `orchestrator:app:bootstrapper`

- **Sidecar Logs (Rust):** `(sidecar_name):(module)`
    - *sidecar_name* must match the name in `SIDECAR_REGISTRY`.
    - *Examples:*
        - `scanner:main`
        - `blocker:enforcement`
        - `ebpf:lsm_monitor`
        - `fim:watcher`

---

### 2. Log Type & Severity Rules

#### **LogType (`LogType` enum)**
- **`audit`**: **Mandatory** for any event involving security state changes, authentication, identity management, or permission elevations.
- **`activity`**: Standard operational events, task completions, and service lifecycle transitions.
- **`debug`**: High-frequency telemetry such as periodic metrics, heartbeats, or internal state dumps that would otherwise clutter the forensic ledger.
- **`generic`**: Fallback only.

#### **LogSeverity (`LogSeverity` enum)**
- **`error`**: Critical failures, security breaches, or failed enforcement actions.
- **`warning`**: Suspicious behavior, drift detection, or non-fatal errors.
- **`success`**: **Use this** to confirm successful security mitigations (e.g., "IP Blocked", "Scan Clean", "Integrity Verified").
- **`info`**: General operational information.

---

### 3. Proposed Mapping for Refactoring

| Current Caller | New Target Caller | Subsystem/Reason |
| :--- | :--- | :--- |
| `SIDECAR_MANAGER` | `orchestrator:infra:runtime:sidecar_manager` | Runtime management |
| `BOOTSTRAP:SELF_TEST` | `orchestrator:app:bootstrapper` | Startup logic |
| `WS`, `WS:EVENT` | `orchestrator:interface:web:api:ws` | WebSocket interface |
| `AUTH`, `AUTH:HANDLER` | `orchestrator:interface:web:features:auth` | Authentication feature |
| `FIREWALL` | `orchestrator:infra:system:protection:firewall` | Firewall infrastructure |
| `NETWORK` | `orchestrator:infra:system:network` | Network infrastructure |
| `PLATFORM` | `orchestrator:infra:system:platform` | Platform abstraction |
| `TPM`, `TPM:PROVISION` | `orchestrator:infra:system:protection:tpm` | TPM hardware interface |
| `SCANNER_AGENT` | `scanner:main` | Rust Sidecar |
| `BLOCKER_AGENT` | `blocker:main` | Rust Sidecar |
| `FIM_GUARD` | `fim:main` | Rust Sidecar |
| `PCAP_ENGINE` | `pcap:main` | Rust Sidecar |
| `VPN_AGENT` | `vpn:main` | Rust Sidecar |

---

### 4. Implementation Instructions
1.  **Orchestrator:** Search and replace `loggingService.log` calls in `src/orchestrator/`.
2.  **Rust Agents:** Update `log_forensic` function calls in `src/agents/*/src/main.rs`.
3.  **Cross-Verification:** Ensure `SidecarManager` in `sidecar_manager.ts` handles the incoming `[LOG]` JSON from sidecars correctly after they are updated.
4.  **Test:** Run `deno run -A verify_logging.ts` and inspect the output formatting and Deno KV entries.
