# CI-FB-01 — QA API y preparación de Firebase piloto

## Objetivo y alcance

Agregar los contratos API al CI y dejar un camino de despliegue manual de Functions para un proyecto Firebase piloto separado. Este sprint no crea el proyecto, credenciales ni variables, y no ejecuta despliegues.

## Evidencia inicial (2026-10-23)

- [PR #78, SEC-01](https://github.com/nsandovala/tbb-amon-delivery-dev/pull/78) fue el PR más reciente y se fusionó el 2026-10-22. `main` partía de `6308775c0a59180e19179a1b353ef097352f65b4`.
- La rama `ci/firebase-pilot-deploy` no existía antes de este sprint. Se creó desde ese commit, sin modificar `main`.
- QA solo compilaba Web, Admin y Functions. Los contratos API ya existían en `e2e/api`, pero no corrían en GitHub Actions.
- `.firebaserc` apunta por defecto a `minerp-sentinel`; `firebase.json` solo declara Functions y Firestore Rules, sin Hosting.

## Cambios y razón

- `.github/workflows/qa.yml`: añade un job `api-contracts` para ejecutar Auth, Firestore y Functions emulados con un namespace local `demo-amon-ci`. Corre los contratos primero con la configuración habitual y luego con `firebase.pilot.json`, que carga el paquete autónomo que se enviaría al piloto. No solicita credenciales ni accede a Firebase real. Instala Java para Firestore y Firebase CLI con versión fijada.
- `playwright.config.ts`, `e2e/support/emulator-fixtures.ts`, `e2e/api/expenses.contract.spec.ts`: leen `FIREBASE_PROJECT_ID` para que URL de Functions, Firestore y Auth coincidan con el proyecto emulado. Sin la variable, conservan el valor local anterior.
- `.github/workflows/firebase-pilot-manual.yml`: permite únicamente `workflow_dispatch` desde `main`, con confirmación literal, ID igual al aprobado en una variable, habilitación explícita y rechazo de `minerp-sentinel`/`minierp-sentinel` y proyectos `demo-*`. El preflight transmite al job de despliegue la identidad federada que validó, evitando que variables del environment sustituyan silenciosamente el proveedor o la cuenta de servicio. Limita el despliegue a la codebase de Functions `amon-functions`.
- `tools/prepare-firebase-pilot.mjs` y `firebase.pilot.json`: preparan una fuente temporal autónoma para Functions. El código compilado no importa `@amon/shared` en runtime; el script comprueba esa condición y genera un manifiesto sin esa dependencia de workspace. CI crea un lockfile acorde, ejecuta `npm ci --omit=dev` sobre el paquete y carga su entrada antes de permitir el deploy. **Reemplazado por BUILD-01 ([PR #82](https://github.com/nsandovala/tbb-amon-delivery-dev/pull/82)):** el paquete usa el `apps/functions/package-lock.json` commiteado, sin regenerarlo, y un manifiesto desplegable sin `scripts`, en Node 22. Ver `roadmap/build-01-functions-lockfile.md`. El CLI usa esta fuente temporal mediante `--config firebase.pilot.json`.

## Barreras de liberación

El workflow manual queda bloqueado hasta que una persona apruebe **un ID de proyecto Firebase piloto distinto** y configure en GitHub:

1. Variable `FIREBASE_PILOT_PROJECT_ID`: ID real aprobado. No se fija en el repositorio.
2. Variable `FIREBASE_PILOT_DEPLOY_ENABLED`: `true` solo tras aprobar la liberación.
3. Variables `FIREBASE_PILOT_WIF_PROVIDER` y `FIREBASE_PILOT_SERVICE_ACCOUNT`: identidad federada con acceso limitado al piloto; este sprint no la crea.
4. Environment `firebase-pilot` con revisores obligatorios y restricción de rama `main`, configurado antes de habilitar el punto 2.

El job `preflight` termina antes de autenticarse cuando falta cualquiera de esos datos. `.firebaserc` no se cambia; ambos comandos de CLI reciben `--project` explícito. El deployment no publica Hosting ni Firestore Rules. Se requiere QA humano y aprobación explícita antes de fusionar el PR y antes de habilitar o ejecutar el workflow manual.

## Contratos afectados

No cambian endpoints, modelos, reglas Firestore ni datos. Solo cambia el project namespace usado por las pruebas cuando se define `FIREBASE_PROJECT_ID`.

## Validación

- En local: `npm ci`, builds de Shared y Functions, análisis de ambos YAML y `git diff --check` aprobaron. La ejecución local de emuladores se detuvo porque Firebase CLI intentó escribir credenciales y caché fuera del checkout permitido; no se amplió ese acceso.
- [GitHub Actions del PR](https://github.com/nsandovala/tbb-amon-delivery-dev/actions/runs/40016010981): el job `api-contracts` ejecutó **46/46 pruebas aprobadas** en Auth, Firestore y Functions emulados con `demo-amon-ci`. El job `qa` compiló Web, Admin y Functions. Ambos terminaron correctamente.
- [Security Gate](https://github.com/nsandovala/tbb-amon-delivery-dev/actions/runs/40016011011): aprobado.
- El preflight manual se probó localmente con valores ficticios: rechazó `DEPLOY_ENABLED=false` y rechazó `minerp-sentinel`, incluso cuando los demás controles tenían valores.
- Tras el comentario de revisión del PR #79 se detectó que `apps/functions/package-lock.json` no corresponde al manifiesto actual: omitía `@amon/shared` y resolvía Zod 3. El paquete piloto temporal evita usar ese lockfile obsoleto. En local, su `npm ci --omit=dev` y la carga de `lib/index.js` aprobaron con Node 20 y Zod 4.6.7. La misma comprobación aprobó en CI.
- La revisión externa detectó dos brechas adicionales: las pruebas API no ejercitaban el paquete piloto (M1) y la autenticación podía leer variables del environment distintas de las verificadas en preflight (M2). Se añadió la segunda ejecución de contratos con `firebase.pilot.json` y se pasó la identidad verificada mediante outputs del job. En [GitHub Actions del commit `ef70914`](https://github.com/nsandovala/tbb-amon-delivery-dev/actions/runs/40020750382), ambas pasadas aprobaron **46/46** contratos y el job de builds aprobó. [Security Gate](https://github.com/nsandovala/tbb-amon-delivery-dev/actions/runs/40020750399) también aprobó.

## Riesgos y próximo paso

- Las pruebas API escriben fixtures en el emulador, incluido un caso del tenant `tbb`; `demo-amon-ci` es un namespace emulado aislado y no un proyecto real.
- `main` no tenía protección de rama en la inspección inicial. Configurar protección y revisores del environment antes de cualquier liberación.
- La cuenta federada debe tener permisos mínimos para desplegar la codebase y su confianza OIDC debe restringirse a este repositorio y rama `main`.
- Si Functions empieza a importar `@amon/shared` en runtime, la preparación fallará hasta que se diseñe un paquete compartido desplegable. Esto evita omitir una dependencia real sin advertencia.
- ~~El lockfile del paquete piloto se genera en cada ejecución y no está fijado en Git.~~ Resuelto por BUILD-01 ([PR #82](https://github.com/nsandovala/tbb-amon-delivery-dev/pull/82)): lock commiteado, Node 22 y guards de empaquetado en CI (M3 de la revisión externa).
- Revisar el PR #79, cerrar QA humano y decidir el proyecto piloto/identidad por separado. No ejecutar el workflow manual durante CI-FB-01.
