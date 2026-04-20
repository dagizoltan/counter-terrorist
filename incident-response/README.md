# Incident Response Workspace Setup (Counter-Terrorist Mode)

This workspace is a multi-platform toolkit designed to identify and remove "parasites" (session hijackers, infostealers, etc.) by collecting and analyzing targeted context.

## 1. Folder Structure

- `/artifacts/`: Collection point for host and network data.
  - `/windows-host-1/`, `/macbook-1/`, etc.
  - Subdirectories: `persistence/`, `browser-extensions/`
- `/analysis/`: AI analysis workspace.
  - `targeted-context.md`: The "shrinked" context for the AI agent.
- `/reports/`: Final investigation reports.

## 2. Artifact Collection (The "Collectors")

### Windows
Run `collect-windows.ps1` as Administrator.
It collects:
- Registry Run/RunOnce keys.
- Startup item hashes.
- Browser extension manifests (Chrome, Edge, Firefox).
- Recently modified files in AppData/Temp.

### macOS
Run `collect-mac.sh`.
It collects:
- LaunchAgent/Daemon plist contents.
- Crontabs.
- Browser extension manifests.
- Recently modified files in `/tmp` and `LaunchAgents`.

## 3. Triage & AI Analysis (The "Analyzer")

Once artifacts are collected and placed in the `/artifacts/` folder:

1. **Generate Targeted Context:**
   Run the triage script to shrink the data for the AI agent:
   ```bash
   python3 triage-context.py
   ```
   This creates `analysis/targeted-context.md`.

2. **Run AI Agent:**
   Use the `analysis-system-prompt.md` in your local AI-enabled editor (e.g., Cursor, VS Code with Copilot/Cody) and provide it with `analysis/targeted-context.md` as context.

## 4. Critical Operational Rules

- **Isolate:** DO NOT analyze artifacts on suspected infected machines.
- **Precision:** Focus on specific file paths and extension IDs identified by the agent.
- **Remediate:** Use the agent's "Actionable Removal Steps" to clean the host.
