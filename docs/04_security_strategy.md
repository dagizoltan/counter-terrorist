# Security Strategy

## Defensive Objectives
- Detect attacker behavior early using honeypots, eBPF events, and filesystem monitoring.
- Contain threats rapidly through automated firewall blocking and VPN isolation.
- Keep the orchestrator small, auditable, and constrained.

## Key Risk Controls
- API token enforcement on all authenticated endpoints.
- Sidecar command allowlisting and strict binary execution paths.
- Input validation for IP addresses, filesystem paths, and request payloads.
- SSRF and DNS Rebinding protection for outbound webhooks using IP-level validation and safe-fetch utilities.
- Separation between orchestrator logic and privileged native agents.

## Risk Observations
- Current UI integration must be fixed to ensure tokens are passed on API and WebSocket connections.
- Path validation needs exact directory boundary checks to prevent prefix bypasses.
- Deep JSON inspection for IPC payloads is required to prevent path smuggling.
- Persistent sidecars need careful lifecycle management and streaming integrity checks to avoid resource exhaustion.

## AI-Assisted Development Practices
- Use AI to generate boilerplate, but require human review of every security-relevant change.
- Adopt tests-first development for sidecar behavior and authorization flows.
- Run all development in an isolated container before deploying to production.

## What Must Be Confirmed Before Pilot
- API authentication works end-to-end for the dashboard and real-time event stream.
- Persistent agent processes are stable and do not leak resources.
- VPN and firewall operations are verified on Ubuntu and behave deterministically.
- The deployment model includes TLS termination and service persistence.

## Previous
Back to `03_roadmap.md` for implementation milestones and deployment sequencing.

## Next
Continue to `05_handover.md` for final evaluation and handoff guidance.
