# Sovereign Windows Service Installer
$ServiceName = "SovereignSecurityDaemon"
$DisplayName = "Sovereign Defense Enterprise Security Daemon"
$ExecPath = "$PSScriptRoot\..\target\release\sovereign.exe"

Write-Host "Registering Sovereign Windows Service..."

New-Service -Name $ServiceName `
            -BinaryPathName $ExecPath `
            -DisplayName $DisplayName `
            -StartupType Automatic `
            -Description "Auto-starting enterprise security platform service for Windows"

Set-Service -Name $ServiceName -Status Running
Write-Host "Sovereign Windows Service registered and started successfully."
