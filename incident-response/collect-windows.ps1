$OUT="C:\incident-artifacts"
New-Item -ItemType Directory -Force -Path $OUT

# System info
systeminfo > "$OUT\systeminfo.txt"

# Processes
tasklist /v > "$OUT\processes.txt"

# Services
Get-Service | Sort-Object Status > "$OUT\services.txt"

# Startup items
wmic startup get caption,command > "$OUT\startup.txt"

# Scheduled tasks
schtasks /query /fo LIST /v > "$OUT\schtasks.txt"

# Network connections
netstat -ano > "$OUT\netstat.txt"

# DNS config
ipconfig /all > "$OUT\ipconfig.txt"

# ARP table
arp -a > "$OUT\arp.txt"

# Installed programs
wmic product get name,version > "$OUT\installed.txt"

# Defender scan log (if available)
Get-MpThreatDetection > "$OUT\defender.txt" 2>$null

# Hosts file
type C:\Windows\System32\drivers\etc\hosts > "$OUT\hosts.txt"
