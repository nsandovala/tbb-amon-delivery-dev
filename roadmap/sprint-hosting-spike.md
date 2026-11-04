# HOSTING-SPIKE-01 — ¿Firebase Hosting estático o App Hosting?

## Estado

READY FOR REVIEW, resultado técnico **favorable a Hosting estático**. Rama `feat/hosting-spike-01` sobre `40abe88`, sin commit, push, PR ni deploy. No se tocó Firebase real ni Blaze.

## Regla de corte (fijada antes de empezar)

Si `/tienda/tbb`, `/login`, `/pedidos`, `/pos` y `/operacion` no se pueden exportar y servir con ajustes acotados, sin reestructurar pantallas, se pasa a Firebase App Hosting.

## Qué cambió

Todo es opcional: sin `NEXT_OUTPUT=export`, los builds son los mismos de antes.

1. **`apps/web/next.config.ts` y `apps/admin/next.config.ts`:** con `NEXT_OUTPUT=export` generan `out/`, con `images.unoptimized`, sin rewrites ni server actions. Sin la variable, web sigue `standalone` y admin igual que antes. El rewrite `/api/functions` queda solo con servidor Next.
2. **`apps/web/src/app/tienda/[slug]`:**
   - `page.tsx` pasa a ser un envoltorio de servidor que declara los slugs con `generateStaticParams`, tomados de `NEXT_PUBLIC_STORE_SLUGS` (por defecto `tbb`).
   - La página cliente original pasa a `store-page.tsx`, sin cambios de lógica.
   - Una tienda nueva requiere volver a construir.
3. **Clientes HTTP** (`apps/web/src/lib/api/orders.ts` y `apps/admin/src/lib/api/{orders,membership,store,payments,expenses}.ts`):
   - `NEXT_PUBLIC_FUNCTIONS_BASE_URL` explícita tiene prioridad sobre el proxy `/api/functions`, que solo existe en `next dev`.
   - Sin la variable, el comportamiento no cambia.
4. **`firebase.hosting.json`:** configuración de Hosting con dos targets (`web`, `admin`) además de Functions y Firestore, sin tocar `firebase.json`.
   - `cleanUrls`.
   - Redirección `/` → `/pedidos` en admin.
   - `no-cache` para HTML y `immutable` para `/_next/static/**`.
5. **`.firebaserc`:** targets de Hosting solo para `demo-amon-ci`. Los sitios reales se mapean con `firebase target:apply` cuando se creen.
6. **`.gitignore`:** `apps/web/out/` y `apps/admin/out/`.
7. **Verificación automática en GitHub Actions** (`.github/workflows/hosting-spike.yml`): build estático de web y admin, emulador oficial de Hosting con Auth, Firestore y Functions, seed de `tbb`, owner con membresía y `e2e/hosting/static-hosting.spec.ts` (`playwright.hosting.config.ts`, `npm run test:e2e:hosting`). Comprueba rutas, 404, redirección, caché, catálogo de la tienda, login y `/pedidos`, `/pos`, `/operacion` con recarga directa, sin errores de JavaScript ni proxy. Proyecto `demo-amon-ci`: no toca nada real.

## Por qué

- Web y admin son SPA de cliente: Firebase Auth, Firestore y Functions se llaman desde el navegador.
- No hay API routes, middleware, server actions ni SSR con datos.
- Un sitio estático por CDN no mantiene servidor encendido, no suma Cloud Run ni Cloud Build y no tiene arranques en frío.

## Validación

| Prueba | Resultado |
|---|---|
| `NEXT_OUTPUT=export next build` web | OK. `/`, `/tienda/tbb` (SSG) |
| `NEXT_OUTPUT=export next build` admin | OK. `/`, `/login`, `/pedidos`, `/pos`, `/operacion`, `/gastos`, `/metricas` |
| Builds normales (`npm --workspace apps/web\|admin run build`) | OK. Sin regresión |
| Typecheck web y admin | OK |
| Unitarias | 217 passed |
| `git diff --check` | OK |

**Hosting emulator oficial** (`firebase-tools@15.34.1`, `--config firebase.hosting.json`, proyecto `demo-amon-ci`):

- **Web (`:5050`):**
  - `/` y `/tienda/tbb` responden 200.
  - `/tienda/otra` responde 404.
- **Admin (`:5055`):**
  - `/` responde 302 a `/pedidos`.
  - `/login`, `/pedidos`, `/pos`, `/operacion`, `/gastos` y `/metricas` responden 200 con carga directa.
- **Cabeceras de caché:** HTML con `no-cache`; `/_next/static/**` con `public, max-age=31536000, immutable`.

**Chromium** contra los emuladores oficiales de Hosting, Auth y Functions:

- Las páginas se montan sin errores de JavaScript.
- El login funciona contra el emulador de Auth.
- `listMyMemberships` se llama **directo** a Functions (`:5001/demo-amon-ci/...`), sin proxy: 200 con CORS al origen de Hosting.
- El guard funciona: sin membresía, `/pos`, `/operacion` y `/pedidos` vuelven a `/login` con "Esta cuenta no tiene membresías activas".

**No ejecutado aquí:** carga de datos con el **emulador oficial de Firestore**, porque la sandbox no puede descargarlo. Afecta al catálogo en `/tienda/tbb`, a la lista de `/pedidos` y a los productos de `/pos`. Para el ensayo de Functions se usó un Firestore no oficial que solo habla gRPC; no sirve WebChannel ni `collectionGroup`, así que `/tienda/tbb` mostró "Tienda no encontrada" y la cuenta quedó sin membresías. Es esperado y **no es evidencia**. Pendiente en el PC (checklist abajo).

## Contratos afectados

Ninguno de API ni de Firestore. Cambia solo cómo se construye y se sirve el frontend.

## Riesgos restantes

1. Falta la verificación con datos reales en el emulador oficial de Firestore (PC).
2. Cada tienda nueva exige un rebuild (`NEXT_PUBLIC_STORE_SLUGS`). Aceptable para el piloto de una tienda.
3. Las Functions tienen `cors: true`: aceptan cualquier origen. Antes de la apertura general, restringir a los dominios de Hosting (DEPLOY-READY-01).
4. Los sitios reales (`<proyecto>-web`, `<proyecto>-admin`) y su `target:apply` se crean en DEPLOY-READY-01, con aprobación.
5. Firebase Hosting usa RE2: los `regex` de cabeceras no admiten lookahead (se usaron globs).
6. `tools/set-admin-claim.mjs` tiene `minerp-sentinel` fijo: en emuladores con `demo-amon-ci` crea el usuario en otro proyecto. No se usa en este flujo.

## Checklist en el PC (emuladores oficiales)

```powershell
# 1) Preflight de puertos (skill amon-emulator-verification)
# 2) Build estático apuntando a los emuladores
$env:NEXT_OUTPUT = "export"
$env:NEXT_PUBLIC_USE_EMULATOR = "true"
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-amon-ci"
$env:NEXT_PUBLIC_FIREBASE_API_KEY = "fake-api-key"
$env:NEXT_PUBLIC_FUNCTIONS_BASE_URL = "http://127.0.0.1:5001/demo-amon-ci/us-central1"
npm --workspace apps/functions run build
npm --workspace apps/web run build
npm --workspace apps/admin run build
# 3) Emuladores con Hosting (terminal 1)
npx --yes firebase-tools@15.34.1 emulators:start --config firebase.hosting.json --project demo-amon-ci --only auth,firestore,functions,hosting
# 4) Datos y owner (terminal 2)
$env:FIREBASE_PROJECT_ID = "demo-amon-ci"; $env:SEED_TARGET = "emulator"; $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm run seed
#    Usuario en el emulador de Auth DEL PROYECTO demo-amon-ci (no usar tools/set-admin-claim.mjs:
#    tiene minerp-sentinel fijo y el claim admin ya no da acceso desde SEC-BASE)
$u = Invoke-RestMethod -Method Post -ContentType "application/json" `
  -Uri "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" `
  -Body '{"email":"owner@demo.amon.test","password":"demo-password-123","returnSecureToken":true}'
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"; $env:GCLOUD_PROJECT = "demo-amon-ci"
node tools/bootstrap-owner.mjs --project demo-amon-ci --tenant tbb --uid $u.localId --created-by-uid system:bootstrap
```

Abrir:

| URL | Esperado |
|---|---|
| `http://127.0.0.1:5050/tienda/tbb` | Catálogo |
| `http://127.0.0.1:5055/login` | Ingreso → `/pedidos` con la lista |
| `/pos` | Productos |
| `/operacion` | Panel |

Recargar cada página: debe mantener la sesión y la ruta.

## Próximo paso

- Si el checklist pasa: congelar Hosting estático y abrir DEPLOY-READY-01:
  - sitios reales y targets;
  - variables de producción;
  - CORS restringido;
  - reglas e índices;
  - owner real;
  - rollback.
- Si falla por algo que exija servidor Next: Firebase App Hosting, según la regla de corte.
