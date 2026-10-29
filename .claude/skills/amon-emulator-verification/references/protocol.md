# Emulator verification protocol

## Purpose

Make emulator-backed verification reproducible and diagnosable. The protocol separates code failures from environment contamination and prevents a stale Firestore process from being mistaken for a passing or failing application result.

## Lifecycle

1. **Preflight**: inspect `4000` (UI), `4400` (Hub), `5001` (Functions), `8080` (Firestore), `9099` (Auth), and `9150` (additional emulator/observability port when configured). Capture PID, process name, full command line, executable path, repository/project clues, and timestamp.
2. **Ownership decision**: an empty port set is clean. A listener is allowed only when its owner and project/config are unambiguous and it is intentionally the instance for this run. Otherwise stop before tests.
3. **Run**: use the official Firebase CLI/emulator suite. Keep automated CI on `demo-amon-ci`; do not share ports with the manual QA stack (`minerp-sentinel` in the reported incident).
4. **Layer evidence**: unit, API emulator, browser emulator, and CI are separate claims. A compile, `--list`, mock, or offline simulation is not emulator evidence.
5. **Postflight**: inspect the same ports and process metadata. Record clean shutdown or every residual process. A Firestore-only PID is still a lifecycle defect.
6. **Authorized cleanup**: only after a human confirms the run is finished and identifies one orphan PID. Re-inspect immediately before termination and stop exactly that PID. Re-run postflight.

## Incident baseline

The 29 Oct 2026 report recorded CI `363/363`, FIN-H01 isolated through Playwright projects, and a Firestore emulator left behind after `emulators:exec`: PID `33920`, ports `8080/9150`. Earlier local QA evidence showed PID `37736` on port `8080` with `cloud-firestore-emulator-v1.20.2.jar`, while other Firebase ports were not listening. These findings confirm lifecycle contamination risk; they do not alone prove that a `500` or `ECONNRESET` was caused by the orphan.

## Evidence matrix

| Observation | Classification | Required action |
|---|---|---|
| `409` with documented stale/concurrent business state | Expected domain outcome | Assert exact code and durable state |
| `422` with documented validation such as required difference reason | Expected domain outcome | Assert exact code and durable state |
| `500` or `ECONNRESET` | Unresolved failure | Preserve failure; investigate and report |
| Port already occupied by another project/stack | Environment isolation failure | Stop, identify owner, obtain human direction |
| Residual emulator after run | Cleanup/lifecycle finding | Record PID/command; authorized cleanup only |
| Mock/offline substitute used | Non-official experiment | Never claim emulator coverage |

## Playwright and CI

- Keep FIN-H01 in a named, explicit Playwright project with its own fixture/worker policy.
- Run ordinary API contracts and FIN-H01 as separately attributable phases.
- Keep assertions for `500`, `ECONNRESET`, duplicate writes, durable Firestore state, session state, and receipts.
- Use real loopback hosting for browser harnesses so Chromium can reach emulators under Local Network Access restrictions.
- In CI, publish preflight/postflight JSON and emulator logs as artifacts. Always fail the job on unexpected test errors; cleanup evidence must not be the reason a failed test turns green.

## Canonical AMON layers

Adapt paths to the repository, but preserve the separation:

```powershell
npm --workspace packages/shared run build
npm --workspace apps/functions run build
npx tsc -p apps/web/tsconfig.json --noEmit
npx tsc -p apps/admin/tsconfig.json --noEmit
npm --workspace apps/web run build
npm --workspace apps/admin run build
npx playwright test e2e/unit --config=playwright.config.ts
npx playwright install chromium
$env:FIREBASE_PROJECT_ID = "demo-amon-ci"
npx --yes firebase-tools@15.34.1 emulators:exec --config firebase.json --project demo-amon-ci --only auth,firestore,functions "npm run test:e2e:api && npm run test:e2e:browser"
npx --yes firebase-tools@15.34.1 emulators:exec --config firebase.pilot.json --project demo-amon-ci --only auth,firestore,functions "npm run test:e2e:api && npm run test:e2e:browser"
git diff --check
```

On Windows, invoke Node CLIs through `process.execPath` plus the JavaScript entry point when a `.bin/*` shim is not executable. Keep both Firebase configurations attributable in the report. If the official Firestore emulator cannot run in the current agent environment, report that limitation and leave the official run as a human/CI step; do not substitute mocks and claim equivalent coverage.

## Report template

```text
Run/date:
Repository and commit/ref:
Project ID / config:
Preflight: clean | occupied | ambiguous
Ports and owners:
Unit/build evidence:
API emulator command/result:
Browser command/result:
Playwright project and workers:
Expected 409/422 cases:
Unexpected 500/ECONNRESET cases:
Postflight: clean | residual
Residual PID/command/project:
Authorized cleanup performed: yes/no (human authorization and PID)
Unresolved risks:
```
