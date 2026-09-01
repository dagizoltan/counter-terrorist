# Multi-Platform Incident Response Workspace (Counter-Terrorist Mode)

This workspace is a high-fidelity toolkit for identifying "parasites" (session hijackers, infostealers, and backdoors) across Windows, macOS, and Linux, powered by Deno for secure artifact analysis.

## 1. Workspace Layout

- `/artifacts/`: Drop point for raw forensic data collected from hosts.
- `/analysis/`: AI Triage center.
  - `targeted-context.md`: The condensed forensic summary.
  - `/quarantine/`: A "shrinked" collection of suspicious binaries and scripts for deep AI inspection.
- `/reports/`: Investigation outcomes and mitigation plans.

## 2. Platform Collectors

- **Windows:** `collect-windows.ps1` (Registry, WMI, Tasks, ADS, Extensions)
- **macOS:** `collect-mac.sh` (LaunchAgents, Login Items, Crontabs, Extensions)
- **Linux:** `collect-linux.sh` (systemd, Cron, Autostart, LD_PRELOAD, Extensions)

## 3. The "Counter-Terrorist" Workflow

1. **Collect:** Run the appropriate script on each suspected machine and move the folders to `incident-response/artifacts/`.
2. **Triage & Quarantine (Powered by Deno):**
   Run the Deno aggregator to flag suspicious items and quarantine suspected malware:
   ```bash
   deno run --allow-read --allow-write incident-response/triage-context.ts
   ```
   *Note: This generates `analysis/targeted-context.md` and populates `analysis/quarantine/`.*
3. **Analyze:** Use the `analysis-system-prompt.md` in your AI-enabled editor. Provide it with the triage report and allow it to request specific files from the `quarantine` folder.

## 4. Professional-Grade Forensics

For deep parsing of complex binary artifacts (e.g., Windows MFT, Registry Hives, macOS Unified Logs), this toolkit is designed to be compatible with **[Artemis](https://puffycid.github.io/artemis-book/)**.

You can extend the `triage-context.ts` logic using `artemis-core` (available as a Deno-compatible library) for enterprise-level forensic requirements.

## 5. Security & Isolation

- **Deno Security:** The triage script runs in Deno's secure sandbox.
- **Quarantine:** Suspicious files are moved to a controlled folder to avoid accidental execution.
- **Clean Machine:** ALWAYS perform the analysis on a clean machine, never on the infected host.
