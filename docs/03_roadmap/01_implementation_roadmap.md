# Implementation Roadmap: Counter-Terrorist (Phase 2 Update)

This document defines the 6 milestones for the Counter-Terrorist security orchestrator.

## Milestone 1: Security Foundations (COMPLETED)
**Goal:** Implement critical security requirements before any other features.

- [x] **Task 1.1:** Implement bearer authentication on all `/api/*` routes.
- [x] **Task 1.2:** Add IP address validation to Rust blocker.
- [x] **Task 1.3:** Add path validation to antivirus `scanPath` logic.
- [x] **Task 1.4:** Implement strict sidecar allowlist in `SidecarManager`.

## Milestone 2: Active Enforcement & Behavioral Intelligence (COMPLETED)
**Goal:** Transition to high-performance daemon model and autonomous response.

- [x] **Task 2.1:** Refactor scanner to persistent daemon with HASH_CACHE.
- [x] **Task 2.2:** Implement Behavioral Anomaly Scoring for syscalls and bots.
- [x] **Task 2.3:** Strengthen breach containment with automated forensic dumps.
- [x] **Task 2.4:** Secure dashboard real-time telemetry (Authenticated WebSockets).

## Milestone 3: Advanced Intelligence & Scaling (CURRENT)
**Goal:** Transition from single-node signature defense to multi-node collective intent.

- [ ] **Task 3.1:** Implement mTLS Gossip protocol for cross-mesh indicator sharing.
- [ ] **Task 3.2:** Develop local lightweight ML model for behavioral intent modeling.
- [ ] **Task 3.3:** Implement eBPF-based socket inspection for encrypted exfiltration detection.

## Milestone 4: Operational UI & Deployment
**Goal:** Refine Tactical Console for enterprise operators.

- [ ] **Task 4.1:** Tactical Evidence Aggregator UI (Download forensic bundles).
- [ ] **Task 4.2:** Enterprise RBAC (Integration with OIDC/LDAP).
- [ ] **Task 4.3:** Multi-tenant dashboard views.

## Milestone 5: Forensics & Deep Audit
**Goal:** Forensic-grade chain of trust.

- [ ] **Task 5.1:** Deep PCR-hash verification for all system binaries.
- [ ] **Task 5.2:** Implementation of "Forensic Restricted Mode" for tamper-evident logs.
- [ ] **Task 5.3:** Integration of OS-native hardware modules (SEP/NCrypt).

## Milestone 6: Enterprise Readiness
**Goal:** Compliance and High Availability.

- [ ] **Task 6.1:** Remote Syslog (RFC 5424) forwarding.
- [ ] **Task 6.2:** High Availability (HA) failover for orchestrator state.
- [ ] **Task 6.3:** Compliance mapping for PCI-DSS/GDPR.
