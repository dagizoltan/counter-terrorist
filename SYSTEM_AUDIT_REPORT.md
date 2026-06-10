# Sovereign System Audit Report (v5.2-CLEANUP)

This report details identified issues, partial implementations, and "AI-intuitive" logic gaps in the Counter-Terrorist orchestrator. While the system is functional and passes integration tests, several components lack production rigor.

## 1. High Severity: Security & Integrity Gaps

### 1.1 Signature Inconsistency (Mesh Split-Brain)
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue:** `signPayload` uses standard `JSON.stringify(payload)` when in TPM mode, but software-based signatures (via `crypto_utils.ts`) use `canonicalStringify`.
- **Impact:** Mesh nodes with TPM identity cannot verify payloads from non-TPM nodes (and vice-versa) due to key-ordering differences in JSON serialization. This breaks consensus in heterogeneous clusters.

### 1.2 Kernel Attestation Mock
- **File:** `src/agents/analyzer/src/main.rs`
- **Issue:** The `AttestKernel` command is a hardcoded mock that returns `success: true` and "Integrity verified" without performing any actual kernel checks or measurements.
- **Impact:** False sense of security; the system claims to attest kernel integrity but provides zero actual verification.

### 1.3 Insecure Syslog TLS Fallback
- **File:** `src/orchestrator/infrastructure/system/logging/SyslogTransport.ts`
- **Issue:** The transport silently ignores CA certificate loading failures. If the `tlsCaCertPath` is invalid, it proceeds with `Deno.connectTls` without pinned certificates.
- **Impact:** Potential for Man-in-the-Middle (MITM) attacks on remote audit logging if the system falls back to standard trust stores or unverified connections.

---

## 2. Medium Severity: Stability & Performance

### 2.1 Mesh Discovery Task Leakage
- **File:** `src/orchestrator/domain/orchestration/mesh.ts`
- **Issue:** `discoverSubnet` is an async process triggered via `setInterval` every 30-60 seconds. It lacks a re-entrancy guard.
- **Impact:** On slow or congested networks, multiple discovery cycles can overlap, leading to a "Promise Explosion," socket exhaustion, and eventually crashing the Deno worker pool.

### 2.2 Unbounded News Signal Growth
- **File:** `src/orchestrator/domain/analysis/audit.ts` / `NewsSignalService` (Ref)
- **Issue:** While the Audit Ledger has a retention policy, auxiliary forensic data like `AuditDelta` and `NewsItem` signals are stored in Deno KV without any automatic purge or archival logic.
- **Impact:** Linear disk growth over time, leading to potential volume exhaustion in long-running production environments.

### 2.3 Simplified Merkle Proofs (Limited Horizon)
- **File:** `src/orchestrator/domain/analysis/audit.ts`
- **Issue:** `getMerkleProof` is hardcoded to only check the last 100 events in memory.
- **Impact:** Forensic verification of events older than 100 entries requires a full chain scan, making the "Merkle proof" capability nearly useless for long-term audit verification.

---

## 3. Low Severity & Technical Debt

### 3.1 Massive Type-Safety Erosion
- **Status:** 311+ instances of `any` found in `src/`.
- **Issue:** Critical security paths (e.g., `EventBus`, `PolicyEngine`) bypass TypeScript's compiler checks.
- **Impact:** High risk of "silent" runtime failures and "Undefined" errors in production, typical of systems evolved through rapid AI suggestions without strict linting.

### 3.2 Non-Atomic Persistent Queue Failures
- **File:** `src/orchestrator/core/utils/persistent_queue.ts`
- **Issue:** `handleFailure` performs a `kv.delete()` followed by a `kv.set()` for the Dead-Letter Queue (DLQ).
- **Impact:** If the orchestrator crashes between these two calls, a critical security alert is permanently lost. This should be wrapped in `kv.atomic()`.

### 3.3 Platform Parity Mocks
- **Files:** `enforcer-win`, `sentinel-darwin`
- **Issue:** Core enforcement features (WFP, ESF) are still largely stubs with `MOCK` comments.
- **Impact:** Windows and macOS support is currently "Provisional" and does not offer the same security guarantees as the Linux implementation.
