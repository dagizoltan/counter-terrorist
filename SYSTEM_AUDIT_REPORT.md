# Sovereign System Status & Technical Debt Report (v6.2)

This report details the current state of the Sovereign security orchestrator, focusing exclusively on unresolved issues, technical debt, and required next steps for production maturity.

## 1. Current Code State
The system has completed Phase 1 & 2 of production hardening. Core security logic (TPM, Mesh Consensus, Provisioning) is now functional and verified. The orchestrator is stable on Linux with a 100% pass rate across 171 integration scenarios. However, the codebase remains in a "hybrid" state where high-level domain logic is strongly typed, but lower-level infrastructure and platform-specific providers still rely on legacy mocks and unvalidated types.

- **Type Safety**: ~209 instances of `any` remain (primarily in `infrastructure/` and `app/`).
- **Platform Support**: Authoritative on Linux; Mock-heavy on Windows/macOS.
- **Resilience**: Basic crash recovery and tiered timeouts implemented; automated forensic lifecycle missing.

## 2. Unresolved Issues & Technical Debt

### 2.1 High Priority: Platform Parity Gaps
- **Issue**: Critical security providers for Windows and macOS are currently functional stubs or mocks.
- **Affected Components**: `WindowsFirewallProvider`, `MacOSAntivirusProvider`, `MacOSProcessProvider` (partial), `WindowsPcapProvider`.
- **Impact**: The system provides zero real-world protection or telemetry when deployed on non-Linux assets.

### 2.2 Medium Priority: Type-Safety Erosion (Phase 3)
- **Issue**: 209 `any` types bypass compiler checks, increasing the risk of runtime failures in edge cases.
- **Affected Layers**: Infrastructure providers, WebSocket handlers, and KV repository implementations.
- **Impact**: Reduced maintainability and high reliance on runtime Zod validation rather than compile-time safety.

### 2.3 Medium Priority: AppArmor Profile TOCTOU
- **Issue**: The profile deployment pipeline uses world-writable `/tmp` for intermediate files.
- **Impact**: Potential for local privilege escalation or security policy bypass via symlink attacks.
- **Remediation**: Migrate to root-owned `/var/lib/cts/tmp`.

### 2.4 Low Priority: Remote Path Validation
- **Issue**: `SystemExecutor` regex for SSH/SCP remote paths returns `valid: true` immediately.
- **Impact**: Potential for shell metacharacter injection if a payload satisfies the basic regex but contains malicious sub-commands.

### 2.5 Low Priority: Unbounded Forensic Growth
- **Issue**: PCAP captures and process dumps lack an automated lifecycle purging mechanism.
- **Impact**: Linear disk exhaustion over long operational windows in high-activity environments.

## 3. Immediate Next Steps

1.  **Phase 3 Type-Safety**: Refactor `src/orchestrator/infrastructure/` to eliminate `any` in sidecar management and repository ports.
2.  **Windows/macOS Drivers**: Replace WFP and ESF mocks with functional native command implementations.
3.  **Secure Temp Directory**: Reconfigure `KernelService` to use restricted-access paths for policy generation.
4.  **Forensic Lifecycle**: Implement a background cleaner service for `./volume/storage/forensics/`.
5.  **Context-Aware Validation**: Refine `SystemExecutor` to audit remote path strings for dangerous metacharacters.
