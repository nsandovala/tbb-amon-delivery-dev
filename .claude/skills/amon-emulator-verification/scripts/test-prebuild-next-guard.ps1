[CmdletBinding()]
param()

# Synthetic test: no Next server launched, no processes terminated.
$ErrorActionPreference = "Stop"
$target = Join-Path $PSScriptRoot "prebuild-next-guard.ps1"
$global:fakeOccupied = $false
function global:Get-NetTCPConnection {
  [CmdletBinding()]
  param([string]$State)
  if ($global:fakeOccupied) {
    [pscustomobject]@{ LocalAddress = "127.0.0.1"; LocalPort = 3001; OwningProcess = 987653 }
  }
}
function global:Get-CimInstance {
  [CmdletBinding()]
  param([string]$ClassName, [string]$Filter)
  [pscustomobject]@{
    Name = "node.exe"
    ExecutablePath = "C:\tools\node.exe"
    CommandLine = "next dev -p 3001"
  }
}
try {
  $clear = (& $target -ProjectRoot (Get-Location).Path | ConvertFrom-Json)
  if ($clear.status -ne "clear") { throw "Expected clear with no listeners." }
  $global:fakeOccupied = $true
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & $target -ProjectRoot (Get-Location).Path 2>&1
  $ErrorActionPreference = $previous
  $strings = @($output | Where-Object { $_ -is [string] })
  $jsonString = $strings | Where-Object { $_.TrimStart().StartsWith("{") } | Select-Object -First 1
  if (-not $jsonString) { throw "Expected JSON report for blocked build." }
  $blocked = $jsonString | ConvertFrom-Json
  if ($blocked.status -ne "blocked") { throw "Expected blocked state." }
  if ((($output | Out-String) -notmatch "Prebuild Next.js guard: blocked")) {
    throw "Blocked build must produce an error."
  }
  Write-Output "PASS: guard refuses an occupied Next port and does not clean it."
} finally {
  Remove-Item Function:\Get-NetTCPConnection -ErrorAction SilentlyContinue
  Remove-Item Function:\Get-CimInstance -ErrorAction SilentlyContinue
}
