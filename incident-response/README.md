# Multi-Platform Incident Response Workspace (Counter-Terrorist Mode)

This workspace is a high-fidelity toolkit for identifying "parasites" (session hijackers, infostealers, and backdoors) across Windows, macOS, and Linux.

## 1. Workspace Layout

- `/artifacts/`: Drop point for forensic data.
  - Subfolders: `persistence/`, `browser-extensions/`, `network/`
- `/analysis/`: AI Triage center.
  - `targeted-context.md`: The condensed forensic summary.
- `/reports/`: Investigation outcomes.

## 2. Platform Collectors

### Windows (`collect-windows.ps1`)
Run as Administrator. Collects Registry, WMI Event Consumers, Scheduled Tasks, Hashed Startup items, Alternate Data Streams, and Browser Extensions.

### macOS (`collect-mac.sh`)
Run via Terminal. Collects LaunchAgents/Daemons (listing and content), Login Items, Crontabs, Browser Extensions, and recently modified files in drop zones.

### Linux (`collect-linux.sh`)
Run via Bash. Collects `systemd` units (system/user), Crontabs, XDG Autostart, `LD_PRELOAD` status, Browser Extensions, and `/dev/shm` / `/tmp` recently modified files.

## 3. The "Counter-Terrorist" Workflow

1. **Collect:** Run the appropriate script on each suspected machine.
2. **Transfer:** Move the resulting folders into this workspace under `incident-response/artifacts/`.
3. **Triage:** Run the aggregator to flag suspicious items:
   ```bash
   python3 triage-context.py
   ```
4. **Analyze:** Open `analysis/targeted-context.md` in your AI-enabled editor. Use the `analysis-system-prompt.md` to guide the AI in identifying specific parasites and generating removal steps.

## 4. Key Detection Capabilities

- **Session Hijacking:** Automated flagging of high-risk browser extension permissions.
- **Fileless Malware:** Detection of encoded commands and WMI-based persistence.
- **Rootkits/Hooks:** Detection of `LD_PRELOAD` on Linux and rogue MDM profiles on Mac.
- **Shadow Files:** Alternate Data Stream (ADS) detection on Windows.
