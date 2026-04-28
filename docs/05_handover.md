# Handover & Evaluation

## Deployment Readiness
- Confirm the orchestrator starts reliably on Ubuntu using `systemd`.
- Ensure the dashboard and API are accessible only over TLS or trusted local proxy.
- Validate that sidecars are installed and executed from controlled paths.
- Confirm firewall and VPN operations can be triggered from the orchestrator.

## Evaluation Checklist
- Verify all `/api/*` routes require valid bearer authentication.
- Confirm WebSocket connections are authenticated and delivering events.
- Validate scanner and honeypot telemetry in the dashboard.
- Review audit and baseline records in Deno KV.
- Test service restart behavior and resource stability.

## Handover Notes
- The primary deployment model is Ubuntu 24.04 / 26.04 LTS.
- The system is designed to be a local defender, not a full enterprise EDR.
- Use the `05_handover/EVALUATION_AND_HANDOVER.md` document for formal handover details and operational guidance.

## Next Steps After Pilot
- Collect real-world telemetry and refine alarm thresholds.
- Harden the orchestrator with additional runtime policy controls.
- Expand documentation to include installer and operator runbook steps.

## Previous
Back to `04_security_strategy.md` for final security validation and pilot readiness.
