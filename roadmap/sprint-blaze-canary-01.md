# BLAZE-CANARY-01 — gate de despliegue

## Cambio y motivo

El workflow manual exige que tanto el proyecto aprobado como el solicitado sean `tbb-amon-preview` y fija explícitamente ese proyecto y `functions:amon-functions:getStoreStatus` en el comando de despliegue. La fase canaria no despliega el codebase completo. QA ejecuta pruebas del guard y del comando. No se despliega ni cambia Firebase en esta fase.

## Archivos y contratos

- `.github/workflows/firebase-pilot-manual.yml`: destino y función exclusivos.
- `.github/workflows/qa.yml`, `tools/test-pilot-canary-gate.mjs`: pruebas locales del guard real y de la línea de despliegue.
- `roadmap/sprint-blaze-canary-01.md`: este registro.

No cambian contratos HTTP ni estructura de Firestore. `getStoreStatus` es lectura pública, GET, y requiere Firestore y configuración operativa adecuada para resultados útiles. CORS no reemplaza autorización de invocación. La invocación y la cuenta de servicio efectiva deben verificarse en el proyecto antes de liberar tráfico.

## Variables y validación

Preflight no usa environment: `FIREBASE_PILOT_PROJECT_ID`, `FIREBASE_PILOT_DEPLOY_ENABLED`, `FIREBASE_PILOT_WIF_PROVIDER` y `FIREBASE_PILOT_SERVICE_ACCOUNT` deben estar disponibles a nivel repositorio u organización. `FIREBASE_PILOT_CORS_ORIGINS` se resuelve en el job con environment `firebase-pilot`, y debe contener exactamente `https://tbb-amon-preview.web.app,https://tbb-amon-preview-admin.web.app`. Confirmar valores efectivos y reglas de aprobación del environment antes de ejecutar.

Validación local: `node --test tools/test-pilot-canary-gate.mjs tools/test-configure-pilot-cors.mjs`; `npm --workspace packages/shared run build`; `npm --workspace apps/functions run build`; `node tools/test-prepare-firebase-pilot.mjs`; `node tools/prepare-firebase-pilot.mjs`; `npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .firebase-pilot/functions --workspaces=false`; importar `lib/index.js` con proyecto demo; `git diff --check`.

La CLI 15.34.1, ejecutando localmente su parser de filtros sobre las 19 exportaciones compiladas, seleccionó solo `getStoreStatus`. El parser también coincide con IDs que comiencen con `getStoreStatus-`; repetir esta verificación si se agregan funciones agrupadas. Las pruebas de selector fijan la línea exacta del workflow y rechazan una modificación que despliegue todas.

## Riesgos y siguiente paso

La configuración real de GitHub, IAM, invoker, Firestore y facturación no se verificó. Opciones globales: región `us-central1`, máximo 5 instancias por función, mínimo 0, 256 MiB y timeout de 30 s; no son tope de gasto. Nelson verifica presupuesto y límites. Confirmar estado previo de la función y política de artefactos antes de cualquier autorización. Si la función es nueva, el rollback es `firebase functions:delete getStoreStatus --project tbb-amon-preview --region us-central1` con confirmación humana; si existía, preparar restauración de la versión anterior en vez de borrarla. La eliminación no limpia necesariamente artefactos.

Siguiente paso: revisar diff y QA, verificar precondiciones cloud sin cambios y obtener aprobación explícita antes de commit, PR y cualquier despliegue.
