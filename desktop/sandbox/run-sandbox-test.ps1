param([string]$Setup)
$ErrorActionPreference = 'Stop'
if (Get-Process WindowsSandbox,WindowsSandboxRemoteSession -ErrorAction SilentlyContinue) { throw 'Eine Windows Sandbox läuft bereits.' }
if (-not $Setup) { $Setup = (Get-ChildItem (Join-Path $PSScriptRoot '..\dist\NextQuest-Setup-*.exe') | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $Setup -or -not (Test-Path -LiteralPath $Setup)) { throw 'Setup nicht gefunden; -Setup angeben oder Desktop-Build erstellen.' }
$run = Join-Path 'D:\Temp\nq-sandbox' (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
$inputDir = Join-Path $run 'in'; $outputDir = Join-Path $run 'out'
New-Item -ItemType Directory -Force $inputDir,$outputDir | Out-Null
Copy-Item -LiteralPath $Setup -Destination (Join-Path $inputDir 'setup.exe')
Copy-Item (Join-Path $PSScriptRoot 'sandbox-test.ps1') $inputDir
$escapedIn = [System.Security.SecurityElement]::Escape($inputDir); $escapedOut = [System.Security.SecurityElement]::Escape($outputDir)
$config = @"
<Configuration><Networking>Enable</Networking><MemoryInMB>4096</MemoryInMB><MappedFolders><MappedFolder><HostFolder>$escapedIn</HostFolder><SandboxFolder>C:\nq-in</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder><MappedFolder><HostFolder>$escapedOut</HostFolder><SandboxFolder>C:\nq-out</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder></MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\nq-in\sandbox-test.ps1</Command></LogonCommand></Configuration>
"@
$wsb = Join-Path $run 'test.wsb'; Set-Content -LiteralPath $wsb -Value $config -Encoding UTF8
Write-Host "Sandbox-Ergebnisse: $outputDir"
try {
  Start-Process "$env:SystemRoot\System32\WindowsSandbox.exe" -ArgumentList "`"$wsb`"" | Out-Null
  $deadline = (Get-Date).AddMinutes(25)
  while (-not (Test-Path (Join-Path $outputDir 'done.json')) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
  if (-not (Test-Path (Join-Path $outputDir 'done.json'))) { throw 'Sandbox-Test nach 25 Minuten abgebrochen.' }
  $done = Get-Content (Join-Path $outputDir 'done.json') -Raw | ConvertFrom-Json
  Get-Content (Join-Path $outputDir 'results.json') -Raw | Write-Host
  if (-not $done.ok) { exit 1 }
} finally {
  Start-Sleep -Seconds 7
  Get-Process WindowsSandboxRemoteSession,WindowsSandbox -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
