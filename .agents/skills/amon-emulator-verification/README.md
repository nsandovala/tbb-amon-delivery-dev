# amon-emulator-verification

Version 1.1.0 portable skill package for Claude, Codex, and AMON Shop agents. It hardens local and CI verification against official Firebase emulators without changing application code.

## Contents

- `SKILL.md` — agent-facing rules and workflow.
- `scripts/preflight-emulators.ps1` — read-only port/process/project inspection.
- scripts/postflight-emulators.ps1 — read-only grace-period polling and evidence capture.
- scripts/prebuild-next-guard.ps1 — read-only fail-closed guard for active Next.js ports 3000/3001.
- scripts/test-postflight-grace.ps1 and scripts/test-prebuild-next-guard.ps1 — synthetic PowerShell safety tests.
- `scripts/cleanup-authorized.ps1` — narrowly scoped, opt-in termination of one verified PID.
- `references/protocol.md` — lifecycle, evidence, CI, and Playwright protocol.

## Install/use

In the AMON Shop repository, the versioned package is installed in both `.agents/skills/amon-emulator-verification` (Codex/AMON agents) and `.claude/skills/amon-emulator-verification` (Claude). Keep the two directories identical. For a standalone agent, copy the package into that agent's skills directory.

Run scripts from the target repository root. For Codex/AMON agents:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.agents\skills\amon-emulator-verification\scripts\preflight-emulators.ps1 -ProjectRoot (Get-Location).Path -ExpectedProjectId demo-amon-ci -OutputPath .\artifacts\emulator-preflight.json
```

Claude agents use the equivalent `.\.claude\skills\amon-emulator-verification\scripts\` path. The scripts are PowerShell 5.1-compatible, emit JSON to stdout or an optional file, and never stop processes by default.

## Safety boundary

The package does not start or stop emulators, alter Firebase, modify source code, or perform Git operations. `cleanup-authorized.ps1` requires `-ConfirmAuthorized` plus an exact `-TargetPid` and validates the current command line before stopping that one process.

## Scope decision

This package is intentionally not integrated into AMON Agents yet. It is a standalone handoff for Claude, Codex, and AMON Shop agents. AA integration can be designed later after this protocol is reviewed.


## v1.1: Grace period and Next.js builds

Windows postflight (read-only): after emulators:exec, use scripts/postflight-emulators.ps1 with -GraceSeconds 90 and -PollSeconds 10. It records shutdown_pending observations and a final clean, residual, ambiguous or error status. A persistent PID does not prove an orphan. Never terminate a process automatically.

Before each next build, use scripts/prebuild-next-guard.ps1. It checks listeners on 3000/3001, including owner PID, command line and executable path. Any occupied port blocks builds conservatively; inspect custom dev ports manually. Do not run next build and next dev sharing a .next directory.

Windows synthetic safety regressions (no emulators or process termination):
- powershell -NoProfile -ExecutionPolicy Bypass -File .\.agents\skills\amon-emulator-verification\scripts\test-postflight-grace.ps1
- powershell -NoProfile -ExecutionPolicy Bypass -File .\.agents\skills\amon-emulator-verification\scripts\test-prebuild-next-guard.ps1

macOS manual inspection: lsof -nP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN. The PowerShell scripts require Windows Get-NetTCPConnection/CIM cmdlets.
