# Evaluation and Roadmap: Counter-Terrorist Security Orchestrator

## 1. Executive Summary

This document provides a comprehensive evaluation of the "Counter-Terrorist" security orchestrator. After reverse-engineering the current codebase, we have identified several critical new blockers that must be resolved before the solution is ready for first production-ready pilot trials. While earlier blockers like scanner persistence were resolved, new integration and security flaws have been introduced or discovered.

## 2. Reverse Engineering Findings & Architectural Flaws

### 2.1 Orchestrator (Deno + Hono)
- **Broken Frontend API Authentication:** The backend requires Bearer token authentication for all `/api/*` routes via the `API_TOKEN` environment variable. However, the frontend (`Dashboard.tsx`, `BlockingLog.js`) does not pass any authorization headers when making `fetch` calls (e.g., to `/api/baseline/set`, `/api/protection/firewall/block`), resulting in immediate HTTP 401 Unauthorized errors and breaking all UI functionality.
- **WebSocket Authentication Failure:** The backend expects the WebSocket connection to `/api/ws/events` to include a `?token=...` query parameter for authentication. The frontend component (`BlockingLog.js`) hardcodes the connection URL without this token, meaning real-time events will fail to connect.
- **Incomplete Status Indicators:** The `StatusIndicator` web component is hardcoded to simulate an "ONLINE" state after 1000ms rather than pulling actual status from the backend.

### 2.2 Scanner Agent (Rust)
- **Status:** **CRITICAL MEMORY LEAK.**
- **Implementation Flaw:** The persistent scanner daemon maintains a `hash_cache: HashMap<String, CacheEntry>` to cache process binary hashes and reduce CPU load. However, there is no cache eviction or cleanup mechanism for processes that have terminated. As a result, the `hash_cache` will grow indefinitely over time, causing a significant memory leak and eventually crashing the system or triggering OOM killer.

### 2.3 Protection Pillars & Security
- **Antivirus Path Traversal / Prefix Bypass:** The `AntivirusManager` in `orchestrator/protection/antivirus.ts` uses `.startsWith()` to validate if a path is within allowed directories (`/tmp`, `/var/tmp`, `~/Downloads`). This allows an attacker to scan or access directories like `/tmp-malicious` or `/var/tmp-bypass` because it only checks for the string prefix, failing to ensure proper path boundaries.
- **VPN:** Logic for `wg-quick` exists but lacks comprehensive error handling and active connection validation.
- **Firewall:** Integrated with `ufw` correctly, but UI interaction is broken due to the authentication issue.

## 3. Critical Blockers for Production (Updated)

| Blocker ID | Priority | Description | Impact | Status |
| :--- | :--- | :--- | :--- | :--- |
| **B-06** | **Highest** | Broken Frontend API Authentication. | The entire UI is non-functional because API requests return 401 Unauthorized. | **RESOLVED** |
| **B-07** | **Highest** | Broken WebSocket Authentication. | Real-time events and logging in the UI fail to connect (401 Unauthorized). | **RESOLVED** |
| **B-08** | **High** | Scanner Agent Memory Leak. | `hash_cache` grows indefinitely, leading to high RAM usage and OOM crashes. | **RESOLVED** |
| **B-09** | **High** | Antivirus Path Validation Bypass. | Using `.startsWith()` allows scanning unauthorized directories (e.g. `/tmp-malicious`). | **RESOLVED** |

## 4. Security Audit Findings
- **Positive:** Input validation for IPs is present in the Rust blocker agent.
- **Risk:** TLS termination is deferred to Nginx, but internal communication between Deno and Sidecars is unencrypted.
- **Risk:** The path traversal bypass in Antivirus component represents a security risk if the orchestrator processes user-supplied paths.
- **Risk:** Hardcoded fake data in UI components (`StatusIndicator.js`) presents a false sense of security to the operator.

## 5. Roadmap to Pilot Trials

### Phase 1: Core Fixes (Completed)
- **Frontend Authentication Refactoring:** Implemented `X-CT-Token` and session-based CSRF protection. UI islands now correctly pass authorization headers.
- **Scanner Memory Leak Fix:** Implemented proactive cache eviction in `src/agents/analyzer/src/main.rs` that verifies file existence on disk in addition to TTL.
- **Path Validation Fix:** Refactored `validatePath` in `validation.ts` to use strict directory boundary checks and proper normalization, preventing prefix bypasses.

### Phase 2: UI/UX Completeness (In Progress)
- **Real Backend Integration:** Update `StatusIndicator.js` to fetch real agent statuses from the backend instead of using `setTimeout` mocks. (COMPLETED)
- **Dashboard Refinement:** Ensure all hardening controls and system baselines dynamically update based on backend responses.

### Phase 3: Production Readiness (Pre-Pilot)
- **TLS Security:** Ensure proper HTTPS termination.
- **Deployment Scripting:** Finalize `systemd` unit files and packaging.
- **Protection Pillars Hardening:** `vpn.ts` and `antivirus.ts` enhanced with production-grade error handling.

## 6. Conclusion
While earlier milestones addressed scanner persistence, the system currently suffers from severe integration regressions (auth) and architectural oversights (memory leak, path traversal bypass). Resolving these newly identified blockers is strictly mandatory before any production pilot can commence.
