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
arp -a > "$OUT\arp.txt"

# Persistence - Registry
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /s > "$OUT\persistence\registry_run_hklm.txt"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /s > "$OUT\persistence\registry_run_hkcu.txt"
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnce" /s > "$OUT\persistence\registry_runonce_hklm.txt"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce" /s > "$OUT\persistence\registry_runonce_hkcu.txt"

# Persistence - Scheduled Tasks (Verbose)
schtasks /query /fo LIST /v > "$OUT\persistence\schtasks.txt"

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

# Browser Extensions (Preserve ID to prevent overwrite)
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
             # Chromium: Extensions/{ID}/{Version}/manifest.json
             Get-ChildItem -Path $path -Recurse -Filter "manifest.json" | ForEach-Object {
                 $id = $_.Directory.Parent.Name
                 $extDest = "$dest\$id"
                 New-Item -ItemType Directory -Force -Path $extDest
                 Copy-Item -Path $_.FullName -Destination $extDest
             }
        }
    }
}

# Hosts file
type C:\Windows\System32\drivers\etc\hosts > "$OUT\hosts.txt"

# DNS Cache
Get-DnsClientCache > "$OUT\dns_cache.txt"

# Recent modified files
Get-ChildItem -Path $env:TEMP, $env:LOCALAPPDATA -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 50 | Select-Object FullName, LastWriteTime, Length > "$OUT\recent_files.txt"
