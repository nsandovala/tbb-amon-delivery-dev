# BUILD-01 — Functions en Node 22 y empaquetado reproducible

## Estado

**Implementado en [PR #82](https://github.com/nsandovala/tbb-amon-delivery-dev/pull/82), pendiente de merge.** Con este PR fusionado deja de bloquear el deploy piloto por la parte de lockfile y runtime. BUILD-01 **no** autoriza ningún despliegue: `FIREBASE_PILOT_DEPLOY_ENABLED` sigue en `false` hasta completar el Release Gate del piloto (proyecto aprobado, Blaze, identidad federada y aprobación humana).

## Problema original

- `apps/functions/package-lock.json` estaba desalineado con el manifiesto: fijaba `zod ^3.23.0` (3.25.76) y omitía `@amon/shared`. `npm ci --prefix apps/functions` fallaba con *lock file out of sync*.
- El workflow piloto regeneraba en cada corrida un lockfile para `.firebase-pilot/functions/`, así que QA y deploy no garantizaban las mismas versiones (M3 de la revisión externa de CI-FB-01).
- `engines.node` era `20`. El runtime Node.js 20 de Cloud Run functions se retira el **2026-10-30**: después de esa fecha no se puede desplegar ni actualizar una función con ese runtime.

## Qué cambió

- Functions y CI pasan a **Node.js 22** (`engines.node`, `qa.yml` en ambos jobs y `firebase-pilot-manual.yml`).
- Se elimina `@amon/shared` de las dependencias de Functions. No se importaba en runtime (es ESM y Functions compila a CommonJS), y era la única razón para generar un manifiesto aparte.
- `apps/functions/package-lock.json` se regeneró con el npm de Node 22: Zod 4.6.7 dentro de `^4.4.3`.
- `tools/prepare-firebase-pilot.mjs` copia `lib/`, el `package-lock.json` commiteado y un manifiesto desplegable **sin `scripts`**. Ya no regenera el lock: QA, contratos y deploy usan exactamente las mismas versiones.
- El script falla antes de empaquetar si: (a) Functions declara dependencias de workspace (`@amon/*`, `*`, `file:`, `workspace:`), (b) el lock no coincide con el manifiesto o (c) el compilado importa `@amon/` o `@shared/`.
- Nuevo `tools/test-prepare-firebase-pilot.mjs`: 2 casos positivos y 3 negativos sobre copias temporales; corre en `qa.yml` antes de empaquetar.

### Por qué el manifiesto desplegable va sin `scripts`

El paquete se despliega ya compilado (solo `lib/`, sin `src/` ni `tsconfig.json`). El buildpack de Node.js de Google ejecuta `npm run build` si el manifiesto declara ese script, así que copiar `"build": "tsc"` haría fallar Cloud Build. Las dependencias y devDependencies se conservan para que `npm ci` siga coincidiendo con el lock. Hallazgo P1 de la revisión de Codex en el PR #82.

## Archivos modificados

- `apps/functions/package.json`
- `apps/functions/package-lock.json`
- `package-lock.json` (solo el enlace a `@amon/shared` y `engines` de functions)
- `tools/prepare-firebase-pilot.mjs`
- `tools/test-prepare-firebase-pilot.mjs` (nuevo)
- `.github/workflows/qa.yml`
- `.github/workflows/firebase-pilot-manual.yml`
- Documentación: este archivo, `roadmap/sprint-ci-fb-01.md`, `roadmap/phase-log.md`, `AGENTS.md`

## Contratos afectados

Ninguno. No cambian endpoints, schemas, reglas de Firestore, índices ni datos. Cambia el contrato de **empaquetado**: el paquete desplegable usa el lock commiteado, un manifiesto sin scripts y Node 22.

## Validación

Local, con Node v22.23.4 y npm 10.9.9:

```bash
npm ci
npm --workspace packages/shared run build
npm --workspace packages/shared run typecheck
npm --workspace apps/functions run build
npm --workspace apps/web run build
npm --workspace apps/admin run build
node tools/test-prepare-firebase-pilot.mjs        # 5/5
node tools/prepare-firebase-pilot.mjs
npm ci --omit=dev --ignore-scripts --workspaces=false --prefix .firebase-pilot/functions
FIREBASE_PROJECT_ID=demo-amon-ci node -e 'require("./.firebase-pilot/functions/lib/index.js")'   # 15 funciones
git diff --check
```

- Todos aprobaron. `npm ci` completo (sin `--omit=dev`, como lo ejecuta Cloud Build) también aprobó sobre el paquete.
- Prueba inversa: al desactivar un guard en una copia temporal, el test falla con exit 1.
- CI del PR #82 (commit `435787c`): `qa`, `api-contracts` (ambas configuraciones) y Security Gate en verde. El ajuste de `scripts` se valida en la siguiente corrida.
- No ejecutado en local: contratos API en emulador. El entorno de ejecución no pudo descargar el jar del emulador de Firestore; los cubre CI.

## Riesgos restantes

1. El workspace resuelve Zod 4.4.3 y el paquete desplegable 4.6.7, dentro del mismo rango `^4.4.3`. Cada lado lo cubre su propia corrida de contratos.
2. `firebase-functions` 4.9 y `firebase-admin` 10 son antiguos. Compilan y cargan en Node 22; migrarlos es un sprint aparte.
3. Contratos TypeScript duplicados entre `apps/functions/src/schemas/*.shared.ts` y `packages/shared`: deuda existente, sin cambios aquí.
4. El paso de build en la nube no se ejercita hasta el primer deploy real; se mitiga con el manifiesto sin `scripts` y su test.
5. Las máquinas locales necesitan Node 22 para los emuladores sin advertencias de `engines`.

## Rollback

Revertir el commit de BUILD-01. El paquete piloto vuelve a la generación anterior. No hay datos ni reglas que revertir.

## Próximo paso

Merge del PR #82 antes del 2026-10-30 con el Release Gate en verde. Luego: ORDER-HARDENING (P0) del Release Backlog v1.
