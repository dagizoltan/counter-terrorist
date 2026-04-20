import os
import json
import glob

def generate_triage_report(artifacts_dir):
    report = []
    report.append("# Targeted Triage Report\n")

    # 1. Summarize Persistence
    report.append("## Persistence Mechanisms")
    persistence_dir = os.path.join(artifacts_dir, "**/persistence/**")
    persistence_files = glob.glob(persistence_dir, recursive=True)

    found_persistence = False
    for f in persistence_files:
        if os.path.isfile(f) and (f.endswith(".plist") or f.endswith(".txt")):
            found_persistence = True
            report.append(f"### {os.path.relpath(f, artifacts_dir)}")
            try:
                with open(f, 'r', errors='ignore') as content:
                    text = content.read().strip()
                    if text:
                        report.append("```")
                        report.append(text[:1500]) # Slightly more context
                        report.append("```")
                    else:
                        report.append("*Empty file*")
            except Exception as e:
                report.append(f"Error reading file: {e}")

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
                    version = data.get('version', 'Unknown')
                    permissions = data.get('permissions', [])
                    id_folder = os.path.basename(os.path.dirname(m))
                    report.append(f"- **{name}** (v{version}) [ID: {id_folder}]")
                    if permissions:
                        report.append(f"  - Permissions: {', '.join(permissions)}")
                    else:
                        report.append("  - No special permissions.")
            except:
                pass

    # 3. Suspicious Network Connections
    report.append("\n## Suspicious Network Connections (Established)")
    netstat_files = glob.glob(os.path.join(artifacts_dir, "**/netstat.txt"), recursive=True)
    for n in netstat_files:
        host_label = os.path.basename(os.path.dirname(n))
        report.append(f"### Host: {host_label}")
        with open(n, 'r') as f:
            lines = f.readlines()
            for line in lines:
                if "ESTABLISHED" in line:
                    # Basic filter to ignore common local noise if possible
                    if not ("127.0.0.1" in line or "::1" in line):
                        report.append(f"- `{line.strip()}`")

    return "\n".join(report)

if __name__ == "__main__":
    # Check current directory and its parent for artifacts
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
