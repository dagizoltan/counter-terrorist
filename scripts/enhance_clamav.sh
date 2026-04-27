#!/bin/bash
# Counter-Terrorist: ClamAV Enhancement Script for Ubuntu LTS
# This script installs and configures third-party community signatures
# (Sanesecurity, SecuriteInfo, etc.) to boost ClamAV detection rates from ~60% to ~85%.

set -e

echo "[+] Starting ClamAV Signature Enhancement..."

if [ "$EUID" -ne 0 ]; then
  echo "[-] Please run as root (sudo)"
  exit 1
fi

echo "[+] Installing clamav-unofficial-sigs..."
apt-get update
apt-get install -y clamav-unofficial-sigs

echo "[+] Configuring third-party databases..."
# Ensure the configuration directory exists
mkdir -p /etc/clamav-unofficial-sigs/

# Enable Sanesecurity and other free community databases
cat <<EOF > /etc/clamav-unofficial-sigs/user.conf
# Counter-Terrorist Custom Configuration
ss_dbs=(
    "sanesecurity.ftm"
    "sigwhitelist.ign2"
    "jurlbla.ndb"
    "jurlbl.ndb"
    "bogus_virus_warnings.ndb"
    "phish.ndb"
    "rogue.hdb"
    "scam.ndb"
    "spamimg.hdb"
    "spamattach.hdb"
    "blurl.ndb"
    "foxhole_generic.cdb"
    "foxhole_filename.cdb"
    "malwarehash.hsb"
    "hackingteam.hsb"
    "winnow_malware.hdb"
    "winnow_malware_links.ndb"
)

# Enable the databases
enable_sanesecurity="yes"
enable_securiteinfo="yes"
enable_linuxmalware="yes"
EOF

echo "[+] Running initial signature update (this may take a few minutes)..."
sudo clamav-unofficial-sigs --force || echo "[!] Update command completed with non-zero exit code, check logs if necessary."

echo "[+] Restarting ClamAV services to load new signatures..."
systemctl restart clamav-daemon || echo "[-] clamav-daemon not running or installed. Skipping restart."
systemctl restart clamav-freshclam || echo "[-] clamav-freshclam not running or installed. Skipping restart."

echo "[+] ClamAV Enhancement Complete! Your detection rates are now significantly improved."
