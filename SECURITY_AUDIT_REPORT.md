# Sovereign Security Orchestrator: Architectural & Security Audit Report

**Date:** June 2024
**Auditor:** Jules (Senior Security & System Architect)
**Status:** Post-Hardening Phase 1

---

## 1. Executive Summary
A comprehensive reverse-engineering and security evaluation of the Sovereign Security Orchestrator was conducted. The system demonstrates a strong "Security by Design" philosophy, utilizing hardware-backed integrity (TPM), strict IPC schemas, and automated agent rotation. However, several critical vulnerabilities related to path traversal, authentication entropy, and incomplete agent implementations were identified. A hardening phase has addressed the most immediate risks, but several architectural bottlenecks and medium-risk vulnerabilities remain.

---

## 2. Methodology
The audit was performed exclusively via manual code review and reverse-engineering of the Deno (TypeScript) and Rust source files. No external documentation or design specifications were consulted.

---

## 3. Findings & Vulnerabilities

### 3.1. Resolved in Phase 1
| Issue | Severity | Description | Fix Action |
| :--- | :--- | :--- | :--- |
| **Arbitrary Hash Disclosure** | **High** | The `analyzer` could hash any file (e.g., `/etc/shadow`), allowing for offline cracking. | Implemented path jailing in `validateRequest`. |
| **Low Auth Entropy** | **High** | `API_TOKEN` minimum length of 16 characters was insufficient for a master secret. | Increased minimum length to 32 characters in `ConfigSchema`. |
| **Scanner Bypass** | **Medium** | `DIR_SCAN` command was unimplemented in the agent, leading to silent failures. | Implemented `DIR_SCAN` in Rust `analyzer`. |
| **Incomplete Visibility** | **Medium** | Filesystem scanning was non-recursive, missing threats in subdirectories. | Refactored `analyzer` to perform recursive stack-based walks. |
| **Sidecar Regression** | **Medium** | Missing `ebpf` and `openssl` policies in `SystemExecutor` caused legitimate defense failures. | Restored whitelists and added JSON-argument policies. |

### 3.2. Remaining Vulnerabilities
| Issue | Severity | Description |
| :--- | :--- | :--- |
| **Sidecar TOCTOU** | **Medium** | A race condition exists in `SidecarManager` between binary identification and its copy to the secure `/var/lib/cts/bin/` jail. |
| **SSRF via Webhooks** | **Medium** | `isValidWebhookUrl` relies on blacklisting and regex. It remains susceptible to DNS Rebinding or IPv6-mapped IPv4 bypasses. |
| **Local DOS** | **Low** | Malicious users could trigger massive recursive scans on large directories (e.g., `/var/`) to spike CPU/IO and fill the `DashMap` cache. |

---

## 4. Performance Bottlenecks

1. **Synchronous Process Offloading:** The orchestrator offloads hashing to the external `sha256sum` binary. Spawning a new process per file for integrity checks (especially during boot) is significantly slower than using an in-process native crypto implementation.
2. **Memory-Resident Hash Cache:** The `analyzer` agent uses a `DashMap` with a fixed capacity guard (100,000 entries). Large-scale filesystem audits can consume upwards of 50MB of RAM for the cache alone, which may be prohibitive on IoT/Edge deployments.
3. **Rust Allocation Patterns:** While `MALICIOUS_HASHES` was moved to a `Lazy` static, the recursive directory walker allocates a new `PathBuf` for every entry. On deep hierarchies, this creates significant pressure on the allocator.

---

## 5. Partial Implementations & Architectural Debt

1. **TPM Integration:** While `TPMManager` exists, much of the logic for "Golden PCR" verification relies on environment variables (`TPM_GOLDEN_PCR_X`), which are less secure than NvIndex-backed authoritative state.
2. **eBPF "Sentinel" Agent:** The `sentinel` agent has five hardcoded errors related to `aya` (eBPF library) version mismatches and private field access. This indicates the kernel-level protection is currently in a "broken" state and likely non-functional in production.
3. **Mesh Signature Verification:** The `meshAuth` middleware includes a "fallback to standard auth" if signature verification fails. This significantly weakens the mesh security, as an attacker could bypass signature checks by presenting a standard session cookie.

---

## 6. Recommendations

1. **Implement DNS Resolution in SSRF Guard:** Modify `isValidWebhookUrl` to resolve hostnames and validate the resulting IPs *before* the request is initiated.
2. **Transition to Native Hashing:** Replace `sha256sum` process spawning with Deno's `crypto.subtle.digest` or a dedicated high-performance Rust hashing sidecar.
3. **Harden Sidecar Swap:** Use `flock` or a similar advisory locking mechanism during the binary swap in `secure_spawn.sh` to eliminate the TOCTOU window.
4. **Fix Sentinel Kernel Compilation:** Address the `sentinel-kernel` missing file error by ensuring the BPF toolchain is correctly integrated into `deno task build-agents`.
