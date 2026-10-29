[CmdletBinding()]
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$ExpectedProjectId = "demo-amon-ci",
  [string[]]$Ports = @("4000", "4400", "5001", "8080", "9099", "9150"),
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
try {
  & (Join-Path $PSScriptRoot "preflight-emulators.ps1") -ProjectRoot $ProjectRoot -ExpectedProjectId $ExpectedProjectId -Ports $Ports -OutputPath $OutputPath
  if (-not $?) { throw "Preflight returned a failure status." }
} catch {
  Write-Error "Postflight inspection failed; no clean shutdown was certified: $($_.Exception.Message)"
  exit 1
}
