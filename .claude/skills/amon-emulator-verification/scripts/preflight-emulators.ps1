[CmdletBinding()]
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$ExpectedProjectId = "demo-amon-ci",
  [string[]]$Ports = @("4000", "4400", "5001", "8080", "9099", "9150"),
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$portNumbers = $Ports | ForEach-Object { [int]$_ }
$listeners = @(
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $portNumbers } |
    Sort-Object LocalPort, OwningProcess
)

$rows = foreach ($listener in $listeners) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  [pscustomobject]@{
    LocalAddress = $listener.LocalAddress
    LocalPort = $listener.LocalPort
    OwningProcess = $listener.OwningProcess
    ProcessName = if ($proc) { $proc.Name } else { $null }
    ExecutablePath = if ($proc) { $proc.ExecutablePath } else { $null }
    CommandLine = if ($proc) { $proc.CommandLine } else { $null }
    ProjectRootMatch = if ($proc -and $proc.CommandLine) { $proc.CommandLine -like "*$resolvedRoot*" } else { $false }
    ExpectedProjectIdMatch = if ($proc -and $proc.CommandLine) { $proc.CommandLine -like "*$ExpectedProjectId*" } else { $false }
  }
}

$result = [pscustomobject]@{
  schema = "amon-emulator-verification/preflight-v1"
  timestampUtc = [DateTime]::UtcNow.ToString("o")
  projectRoot = $resolvedRoot
  expectedProjectId = $ExpectedProjectId
  inspectedPorts = $portNumbers
  listeners = @($rows)
  status = if ($rows.Count -eq 0) { "clean" } else { "occupied" }
  action = "read-only; no processes stopped"
}
$json = $result | ConvertTo-Json -Depth 6
if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
}
$json
