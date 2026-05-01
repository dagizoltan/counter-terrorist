# Counter-Terrorist Windows Installation Script
# This script must be run with Administrative privileges.

$InstallDir = "C:\Program Files\Counter-Terrorist"
$BinPath = "$InstallDir\counter-terrorist.exe"

Write-Host "--- 🌍 Deploying Counter-Terrorist for Windows ---" -ForegroundColor Cyan

if (-not (Test-Path $InstallDir)) {
    New-Item -Path $InstallDir -ItemType Directory | Out-Null
}

# 1. Copying Files (Assumes script is run from inside the release folder)
Write-Host "[1/3] Copying binaries..."
Copy-Item -Path ".*" -Destination $InstallDir -Recurse -Force

# 2. Environment Configuration
Write-Host "[2/4] Configuring environment..."
$EnvFile = "$InstallDir\.env"
if (-not (Test-Path $EnvFile)) {
    $ApiToken = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 255) }))
    $MeshSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 255) }))
    
    $Config = @"
PORT=8000
API_TOKEN=$ApiToken
MESH_SECRET=$MeshSecret
LOG_LEVEL=INFO
ENVIRONMENT=production
"@
    $Config | Out-File -FilePath $EnvFile -Encoding utf8
    Write-Host "Generated new secure tokens in .env" -ForegroundColor Yellow
}

# 3. Creating Service (using sc.exe for maximum compatibility)
Write-Host "[3/4] Registering Windows Service..."
$ServiceExists = Get-Service -Name "CTOrchestrator" -ErrorAction SilentlyContinue
if ($ServiceExists) {
    Stop-Service -Name "CTOrchestrator"
    sc.exe delete CTOrchestrator
}

sc.exe create CTOrchestrator binPath= "$BinPath" start= auto DisplayName= "Counter-Terrorist Orchestrator"
sc.exe description CTOrchestrator "High-performance security orchestrator and defense mesh node."

# 4. Starting Service
Write-Host "[4/4] Starting service..."
Start-Service -Name "CTOrchestrator"

Write-Host "`n✅ Installation Complete. Orchestrator active." -ForegroundColor Green
Write-Host "Dashboard: http://localhost:8000"
