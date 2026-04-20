OUT=~/incident-artifacts
mkdir -p $OUT

# System info
system_profiler SPSoftwareDataType > $OUT/system.txt

# Processes
ps aux > $OUT/processes.txt

# Launch agents/daemons
ls -la ~/Library/LaunchAgents > $OUT/launch_agents_user.txt
ls -la /Library/LaunchAgents > $OUT/launch_agents_system.txt
ls -la /Library/LaunchDaemons > $OUT/launch_daemons.txt

# Login items
osascript -e 'tell application "System Events" to get the name of every login item' > $OUT/login_items.txt

# Network
netstat -anv > $OUT/netstat.txt

# DNS
scutil --dns > $OUT/dns.txt

# Hosts file
cat /etc/hosts > $OUT/hosts.txt

# Profiles (important)
profiles list > $OUT/profiles.txt

# Installed apps
system_profiler SPApplicationsDataType > $OUT/apps.txt
