import os
import json
import glob
import re

RED_FLAG_KEYWORDS = [
    r"base64", r"eval\(", r"exec\(", r"shell", r"curl", r"wget", r"http",
    r"powershell", r"-enc", r"hidden", r"bypass", r"NoProfile"
]

HIGH_RISK_PERMISSIONS = [
    "<all_urls>", "webRequest", "webRequestBlocking", "cookies",
    "management", "debugger", "proxy"
]

def check_red_flags(text):
    flags = []
    for pattern in RED_FLAG_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            flags.append(pattern)
    return flags

def generate_triage_report(artifacts_dir):
    report = []
    report.append("# Targeted Triage Report (Multi-Platform)\n")

    # 1. Summarize Persistence
    report.append("## Persistence Mechanisms")
    persistence_dir = os.path.join(artifacts_dir, "**/persistence/**")
    persistence_files = glob.glob(persistence_dir, recursive=True)

    found_persistence = False
    for f in persistence_files:
        if os.path.isfile(f) and (f.endswith(".plist") or f.endswith(".txt") or f.endswith(".json") or f.endswith(".service")):
            found_persistence = True
            file_rel_path = os.path.relpath(f, artifacts_dir)

            try:
                with open(f, 'r', errors='ignore') as content:
                    text = content.read().strip()
                    if text:
                        flags = check_red_flags(text)
                        flag_header = f" [RED FLAGS: {', '.join(flags)}]" if flags else ""
                        report.append(f"### {file_rel_path}{flag_header}")
                        report.append("```")
                        report.append(text[:1500])
                        report.append("```")
            except Exception as e:
                report.append(f"### {file_rel_path} (Error reading: {e})")

    if not found_persistence:
        report.append("No persistence artifacts found.")

    # 2. Browser Extensions Triage
    report.append("\n## Browser Extensions (Manifests)")
    extension_manifests = glob.glob(os.path.join(artifacts_dir, "**/browser-extensions/**/manifest.json"), recursive=True)

    if not extension_manifests:
        report.append("No browser extension manifests found.")
    else:
        for m in extension_manifests:
            try:
                with open(m, 'r') as f:
                    data = json.load(f)
                    name = data.get('name', 'Unknown')
                    permissions = data.get('permissions', [])

                    risky = [p for p in permissions if p in HIGH_RISK_PERMISSIONS]
                    risk_header = f" [RISKY PERMISSIONS: {', '.join(risky)}]" if risky else ""

                    id_folder = os.path.basename(os.path.dirname(m))
                    report.append(f"- **{name}** [ID: {id_folder}]{risk_header}")
            except:
                pass

    # 3. Network Connections
    report.append("\n## External Network Connections")
    netstat_files = glob.glob(os.path.join(artifacts_dir, "**/netstat.txt"), recursive=True)
    for n in netstat_files:
        host_label = os.path.basename(os.path.dirname(n))
        report.append(f"### Host: {host_label}")
        with open(n, 'r') as f:
            lines = f.readlines()
            for line in lines:
                if "ESTABLISHED" in line:
                    if not ("127.0.0.1" in line or "::1" in line):
                        report.append(f"- `{line.strip()}`")

    return "\n".join(report)

if __name__ == "__main__":
    artifacts_candidates = ["incident-response/artifacts", "artifacts"]
    artifacts_path = None
    for cand in artifacts_candidates:
        if os.path.exists(cand):
            artifacts_path = cand
            break

    if artifacts_path:
        triage_data = generate_triage_report(artifacts_path)
        output_path = "incident-response/analysis/targeted-context.md"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w") as f:
            f.write(triage_data)
        print(f"Targeted triage report generated at {output_path}")
    else:
        print("Artifacts directory not found.")
