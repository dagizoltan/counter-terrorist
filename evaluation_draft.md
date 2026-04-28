# Counter-Terrorist Orchestrator: Security & Systems Evaluation

**Role:** Senior Security & Systems Engineer
**Objective:** Evaluate the current design, state, and next steps for the "Counter-Terrorist" security orchestrator.

## 1. Design Evaluation
The foundational architecture—a three-tier model using a least-privilege Deno orchestrator, native Rust sidecars (Daemon Scanner + One-shot Blocker), and an SSR dashboard—is sound and highly resilient.
- **Strengths:**
  - **Isolation & Communication:** JSON-over-stdin/stdout between Deno and Rust prevents network-based sidecar exploitation.
  - **Behavioral Defense:** Shifting focus from static AV to honeypots and baseline tracking is a modern, effective approach against sophisticated inside threats.
  - **Stealth:** Process masquerading and dead man's switch concepts align well with the "Sting" operation methodology.
- **Areas for Improvement:** The eventual transition to a Zero-Config Mesh (mTLS/mDNS) and eBPF integration will elevate this to an enterprise-grade solution, but the immediate priority must remain strictly on single-node stability and fixing critical regression.

## 2. Current State Assessment
The codebase has successfully transitioned to Milestone 2 (Persistent Daemon State) and Phase 1 (Architecture Stabilization) according to `STABLE_DESIGN.md`. However, `EVALUATION_AND_ROADMAP.md` highlights **Critical Blockers** that render the system unusable for immediate pilot trials:
- **Authentication Regression (Highest):** Frontend UI requests (API and WebSockets) fail with 401 Unauthorized because the bearer token mechanism/session cookies are improperly implemented or missing in the frontend client logic.
- **Scanner Memory Leak (High):** The Rust scanner daemon caches hashes (`hash_cache`) without eviction, leading to unlimited memory growth and eventual OOM.
- **AV Path Traversal Bypass (High):** The `AntivirusManager` uses an insecure `.startsWith()` check for validation, allowing attackers to scan or manipulate unauthorized directories (e.g., `/tmp-malicious`).

## 3. Recommended Next Steps (Action Plan)
Before advancing to Phase 2 (Immutable Telemetry / PCAP) or the Zero-Config Mesh, we must execute an "Incremental Refactoring" phase focused strictly on remediation:

1.  **Remediate Authentication Integration:**
    - Fix the frontend API and WebSocket connection logic to properly utilize the secure, `httpOnly` session cookies implemented in Phase 1 (as noted in memory and design docs), removing reliance on insecure token passing.
2.  **Patch Scanner Memory Leak:**
    - Implement a periodic cache eviction mechanism in the Rust scanner (`agents/scanner/src/main.rs`) to prune `hash_cache` entries for processes that have terminated.
3.  **Harden Antivirus Path Validation:**
    - Refactor `orchestrator/protection/antivirus.ts` to enforce exact directory matching or strict boundary checks (e.g., ensuring a trailing slash `startsWith("/tmp/")` or resolving absolute paths).
4.  **Backend Data Wiring:**
    - Remove hardcoded UI stubs (e.g., `StatusIndicator` 1000ms delay) and connect Web Components directly to real backend API endpoints for live status.
5.  **Run Validations:**
    - Execute `deno test --allow-env` and `cargo test` in the `agents` directory to ensure fixes do not introduce regressions.

## 4. Prompt Generation Directive
The following section will be distilled into a clear, actionable prompt designed for an AI agent to execute these next steps autonomously.
