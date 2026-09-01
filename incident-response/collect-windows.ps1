$OUT="C:\incident-artifacts"
New-Item -ItemType Directory -Force -Path $OUT
New-Item -ItemType Directory -Force -Path "$OUT\persistence"
New-Item -ItemType Directory -Force -Path "$OUT\browser-extensions"

# System info
systeminfo > "$OUT\systeminfo.txt"

# Processes & Network
tasklist /v > "$OUT\processes.txt"
netstat -ano > "$OUT\netstat.txt"
ipconfig /all > "$OUT\ipconfig.txt"

# Persistence - Registry
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /s > "$OUT\persistence\registry_run_hklm.txt"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /s > "$OUT\persistence\registry_run_hkcu.txt"

# Persistence - Scheduled Tasks
schtasks /query /fo LIST /v > "$OUT\persistence\schtasks.txt"

# Persistence - WMI Event Consumers (Advanced)
Get-WmiObject -Namespace root\subscription -Class __EventConsumer | Select-Object Name, CommandLineTemplate, ExecutablePath > "$OUT\persistence\wmi_consumers.txt"
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Select-Object Name, Query > "$OUT\persistence\wmi_filters.txt"

# Persistence - Startup Items Hashing
$startupItems = wmic startup get caption,command /format:list
$startupItems > "$OUT\persistence\startup_wmic.txt"
$startupItems | Select-String "Command=" | ForEach-Object {
    $cmd = $_.ToString().Split("=")[1].Trim()
    if ($cmd -match '(?i)"([^"]+\.exe)"' -or $cmd -match '(?i)^([^\s]+\.exe)') {
        $path = $matches[1]
        if (Test-Path $path) {
            Get-FileHash -Path $path -Algorithm SHA256 | Out-File -Append "$OUT\persistence\startup_hashes.txt"
        }
    }
}

# Browser Extensions
$browserPaths = @{
    "Chrome" = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Extensions";
    "Edge"   = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Extensions";
    "Firefox"= "$env:APPDATA\Mozilla\Firefox\Profiles"
}

foreach ($browser in $browserPaths.Keys) {
    $path = $browserPaths[$browser]
    if (Test-Path $path) {
        $dest = "$OUT\browser-extensions\$browser"
        New-Item -ItemType Directory -Force -Path $dest
        if ($browser -eq "Firefox") {
             Get-ChildItem -Path $path -Recurse -Filter "extensions.json" | Copy-Item -Destination $dest -ErrorAction SilentlyContinue
        } else {
             Get-ChildItem -Path $path -Recurse -Filter "manifest.json" | ForEach-Object {
                 $id = $_.Directory.Parent.Name
                 $extDest = "$dest\$id"
                 New-Item -ItemType Directory -Force -Path $extDest
                 Copy-Item -Path $_.FullName -Destination $extDest
             }
        }
    }
}

# Hosts & DNS
type C:\Windows\System32\drivers\etc\hosts > "$OUT\hosts.txt"
Get-DnsClientCache > "$OUT\dns_cache.txt"

# Recent modified files + ADS Check (Alternate Data Streams)
Get-ChildItem -Path $env:TEMP, $env:LOCALAPPDATA -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 50 | Select-Object FullName, LastWriteTime, Length > "$OUT\recent_files.txt"
# Check Downloads for ADS (common for zone identifier/malware notes)
Get-Item "$env:USERPROFILE\Downloads\*" -Stream * | Where-Object Stream -ne ':$DATA' > "$OUT\downloads_ads.txt" 2>$null
