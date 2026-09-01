OUT=~/incident-artifacts
mkdir -p $OUT
mkdir -p $OUT/persistence
mkdir -p $OUT/browser-extensions

# System info
system_profiler SPSoftwareDataType > $OUT/system.txt

# Processes
ps aux > $OUT/processes.txt

# Launch agents/daemons
for dir in ~/Library/LaunchAgents /Library/LaunchAgents /Library/LaunchDaemons; do
    if [ -d "$dir" ]; then
        base=$(basename "$dir")
        ls -la "$dir" > "$OUT/persistence/${base}_list.txt"
        mkdir -p "$OUT/persistence/${base}_contents"
        cp "$dir"/*.plist "$OUT/persistence/${base}_contents/" 2>/dev/null
    fi
done

# Login items
osascript -e 'tell application "System Events" to get the name of every login item' > $OUT/login_items.txt

# Network
netstat -anv > $OUT/netstat.txt
scutil --dns > $OUT/dns.txt

# Browser Extensions (Chromium)
CHROME_EXT="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"
if [ -d "$CHROME_EXT" ]; then
    mkdir -p "$OUT/browser-extensions/Chrome"
    find "$CHROME_EXT" -name "manifest.json" -maxdepth 3 | while read -r m; do
        id=$(basename "$(dirname "$(dirname "$m")")")
        mkdir -p "$OUT/browser-extensions/Chrome/$id"
        cp "$m" "$OUT/browser-extensions/Chrome/$id/"
    done
fi

# Firefox Extensions
find "$HOME/Library/Application Support/Firefox/Profiles" -name "extensions.json" -exec cp {} $OUT/browser-extensions/ \; 2>/dev/null

# Cron jobs
crontab -l > $OUT/persistence/crontab.txt 2>/dev/null

# Hosts file
cat /etc/hosts > $OUT/hosts.txt

# Profiles
profiles list > $OUT/profiles.txt

# Recent modified files
find ~/Library/LaunchAgents /tmp /var/tmp -type f -mtime -7 -ls | sort -k 11 -r | head -n 50 > $OUT/recent_files.txt

# Installed apps
system_profiler SPApplicationsDataType > $OUT/apps.txt
