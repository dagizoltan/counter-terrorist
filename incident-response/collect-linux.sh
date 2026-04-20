#!/bin/bash
OUT=~/incident-artifacts
mkdir -p $OUT
mkdir -p $OUT/persistence
mkdir -p $OUT/browser-extensions

# System info
uname -a > $OUT/system.txt
lsb_release -a >> $OUT/system.txt 2>/dev/null

# Processes
ps aux > $OUT/processes.txt

# Persistence - systemd
mkdir -p $OUT/persistence/systemd
systemctl list-unit-files --type=service > $OUT/persistence/systemd/unit_files.txt
systemctl list-units --type=service --state=running > $OUT/persistence/systemd/running_services.txt
# User services
systemctl --user list-unit-files --type=service > $OUT/persistence/systemd/user_unit_files.txt 2>/dev/null

# Persistence - Cron
mkdir -p $OUT/persistence/cron
crontab -l > $OUT/persistence/cron/user_cron.txt 2>/dev/null
ls -la /etc/cron.* > $OUT/persistence/cron/etc_cron_list.txt

# Persistence - Autostart
mkdir -p $OUT/persistence/autostart
ls -la /etc/xdg/autostart ~/.config/autostart > $OUT/persistence/autostart/list.txt 2>/dev/null

# Network
netstat -tulpn > $OUT/netstat.txt 2>/dev/null || ss -tulpn > $OUT/netstat.txt
cat /etc/resolv.conf > $OUT/dns.txt

# Browser Extensions (Chromium & Firefox)
# Chromium/Chrome/Brave/Edge often use ~/.config/...
find ~/.config -name "manifest.json" -maxdepth 5 2>/dev/null | while read -r m; do
    id=$(basename "$(dirname "$(dirname "$m")")")
    browser=$(echo "$m" | cut -d/ -f5) # Rough guess at browser name
    mkdir -p "$OUT/browser-extensions/$browser/$id"
    cp "$m" "$OUT/browser-extensions/$browser/$id/"
done

find ~/.mozilla -name "extensions.json" -exec cp {} $OUT/browser-extensions/ \; 2>/dev/null

# Hosts file
cat /etc/hosts > $OUT/hosts.txt

# Suspicious file locations (Recently modified - 7 days)
find /tmp /var/tmp /dev/shm -type f -mtime -7 -ls 2>/dev/null | sort -k 11 -r | head -n 50 > $OUT/recent_files.txt

# Check for LD_PRELOAD
echo $LD_PRELOAD > $OUT/persistence/ld_preload.txt
