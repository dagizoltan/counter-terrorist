# Antivirus (AV) Guide: Counter-Terrorist Orchestrator

## 1. The Reality of Antivirus on Linux

Linux servers and desktops are traditionally less targeted by standard malware than Windows systems, but the threat landscape is growing. "Counter-Terrorist" integrates **ClamAV** as its primary file-scanning engine for Ubuntu.

### The Base Limitations
Out of the box, ClamAV relies solely on Cisco's official signature databases. While reliable and free of false positives, the standard database is **famously mediocre** at catching modern, fast-moving threats.
*   **Base Detection Rate:** ~60%
*   **Weaknesses:** Phishing attachments, zero-day ransomware, macro-viruses, and advanced persistent threats (APTs).

### How Counter-Terrorist Orchestrates AV
Because running active AV scans is computationally expensive, "Counter-Terrorist" is designed to be lean:
*   We **do not** use `clamonacc` (on-access scanning) for desktops by default, to avoid CPU spikes.
*   We explicitly restrict scans to high-risk ingress directories (`/tmp`, `/var/tmp`, `~/Downloads`) to maximize efficiency and mitigate path-traversal attacks.

## 2. Enhancing Detection Rates (The Fix)

To solve the 60% detection problem, we must feed ClamAV **Third-Party Community Signatures**. Independent security researchers (like Sanesecurity, SecuriteInfo, and LinuxMalwareDetect) maintain highly aggressive, frequently updated databases.

By injecting these signatures, we can boost the detection rate of our ClamAV engine to **~80-85%**.

### Running the Enhancement Script

We have provided an automated script that installs the `clamav-unofficial-sigs` package and configures it to pull the best free community databases.

**Step 1:** Run the script as root:
```bash
sudo ./scripts/enhance_clamav.sh
```

**Step 2:** What the script does:
1.  Installs the necessary `clamav-unofficial-sigs` Debian package.
2.  Generates a custom `user.conf` that explicitly enables aggressive databases (like `sanesecurity.ftm`, `phish.ndb`, `foxhole_generic.cdb`).
3.  Triggers a manual database update immediately.
4.  Restarts the `clamav-daemon` so the new signatures are loaded into memory.

## 3. Alternative OS Reality (Windows/Mac)

While "Counter-Terrorist" is an Ubuntu-first orchestrator, the underlying architecture contemplates cross-platform capabilities:

*   **Windows:** The detection reality is completely different. The orchestrator delegates to **Windows Defender** (`Start-MpScan`), which is currently an industry-leading engine with a **99%+** detection rate.
*   **macOS:** The system relies on Apple's built-in **XProtect**. Currently, our orchestrator does not hook into XProtect, rendering manual AV scans completely ineffective (unimplemented) on macOS endpoints.

## 4. Conclusion

Do not rely on the base ClamAV installation for robust enterprise security. You **must** run `enhance_clamav.sh` to consider the antivirus pillar of the "Counter-Terrorist" orchestrator production-ready.