# Incident Response Workspace Setup

This workspace is tailored for investigating suspected session hijacking and router compromise across Windows and macOS environments.

## 1. Folder Structure

- `/artifacts/`: Collection point for host and network data.
  - `/windows-host-1/`, `/windows-host-2/`
  - `/macbook-1/`, `/macbook-2/`
  - `/network/`: Nmap scans and packet captures.
  - `/router/`: Manual inspection notes.
- `/analysis/`: Centralized analysis workspace.
- `/reports/`: Final investigation reports.

## 2. Artifact Collection

### Windows
Run `collect-windows.ps1` as Administrator on each Windows machine. Artifacts will be collected in `C:\incident-artifacts`.

### macOS
Run `collect-mac.sh` on each Mac. Artifacts will be collected in `~/incident-artifacts`.

### Network Scan
From a clean machine, run:
```bash
# Discovery scan
nmap -sn 192.168.1.0/24 -oN artifacts/network/hosts.txt

# Deeper scan of suspicious devices
nmap -A <IP> -oN artifacts/network/device_<IP>.txt
```

### Packet Capture
From a clean machine:
```bash
sudo tcpdump -i <interface> -w artifacts/network/capture.pcap
```

### Router Inspection
Document the findings in `artifacts/router/notes.txt`.

## 3. Analysis

Use the system prompt provided in `analysis-system-prompt.md` for the LLM agent tasked with correlating findings across the collected artifacts.

## 4. Critical Operational Rules

- **DO NOT** analyze artifacts directly on suspected infected machines.
- **DO NOT** trust browser state on compromised hosts.
- **DO** prioritize rotating passwords and session tokens immediately.
