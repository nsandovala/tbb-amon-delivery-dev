# SEC-BASE — Identidad, autorización y aislamiento multi-tenant

## Objetivo y alcance

Reemplazar el claim global `admin:true` por un sistema de membresías activas,
roles y permisos vinculados al tenant. SEC-BASE deja la fachada central
`requireMembershipPermission(req, tenantId, permission)` lista para que SEC-02
extienda la autorización a los endpoints hoy aún inseguros (POS/orders) sin
rediseñar el modelo.

## Modelo de membresías

Documento: `tenants/{tenantId}/members/{uid}`

| Campo          | Tipo        | Notas                                                     |
| -------------- | ----------- | --------------------------------------------------------- |
| `uid`          | `string`    | Igual al UID de Firebase Auth.                            |
| `tenantId`     | `string`    | Tenant al que pertenece.                                  |
| `role`         | `owner`/`admin` | Owner recibe `members.manage` además de operacionales. |
| `status`       | `active`/`revoked` | Revocación efectiva en la siguiente request.          |
| `createdAt`    | `Timestamp` | Server timestamp.                                         |
| `createdByUid` | `string`    | UID del operador que creó la membresía.                   |
| `updatedAt?`   | `Timestamp` | Server timestamp.                                         |
| `revokedAt?`   | `Timestamp` | Set al revocar.                                           |
| `revokedByUid?`| `string`    | UID del operador que revocó.                              |

Escritura bloqueada desde cliente en `firestore.rules`. El bootstrap y
cualquier alta posterior pasan por Admin SDK (ver `tools/bootstrap-owner.mjs`).

## Matriz central de permisos

| Permiso                   | owner | admin |
| ------------------------- | :---: | :---: |
| `expenses.create`         |   ✅   |   ✅   |
| `store.read_control`      |   ✅   |   ✅   |
| `store.manage_operation`  |   ✅   |   ✅   |
| `store.manage_hours`      |   ✅   |   ✅   |
| `cash.read_summary`       |   ✅   |   ✅   |
| `cash.close_session`      |   ✅   |   ✅   |
| `orders.read_private`     |   ✅   |   ✅   |
| `orders.update_status`    |   ✅   |   ✅   |
| `pos.create_sale`         |   ✅   |   ✅   |
| `members.manage`          |   ✅   |   ❌   |

Fuente única: `apps/functions/src/lib/permissions.ts`.
`orders.read_private` lo agrega SEC-04 para `getOrder` (ver `roadmap/sprint-sec-04.md`).
`members.manage` queda reservado para SEC-02 (invitaciones y alta de admins).

## Fachada central

`requireMembershipPermission(req, tenantId, permission)` — pipeline por
solicitud:

1. Extraer y verificar el Firebase ID token (401 si falla).
2. Obtener UID autenticado.
3. Validar tenantId recibido explícitamente (403 si vacío).
4. Verificar que `tenants/{tenantId}` existe (403 uniforme si no).
5. Leer `tenants/{tenantId}/members/{uid}` (403 si falta o status ≠ active).
6. Validar permiso contra la matriz (403 si no concedido).
7. Devolver `AuthorizedActor { uid, email, tenantId, role }`.

Variante sin permiso específico: `requireActiveMembership(req, tenantId)`
usada solo por `getMyMembership`.

**Memoización**: `WeakMap<Request, …>` memoiza token y lectura de
membresía dentro de la misma solicitud. **No hay caché entre solicitudes**:
la revocación es efectiva en la próxima request.

## Firestore rules

- Lectura pública: `products`, `categories`, `modifiers`, `modifierGroups`,
  doc raíz del tenant.
- Lectura privada (requiere membresía activa): `orders`, `customers`,
  `settings`, `expenses`, `cashCloseSessions`, `auditEvents`.
- `members/{uid}`:
  - `get`: self o owner con membresía activa.
  - `list`: solo owner con membresía activa.
  - `write`: deny desde cliente (Admin SDK vía `tools/bootstrap-owner.mjs`).

## Bootstrap seguro del owner

Script: `tools/bootstrap-owner.mjs`

- Idempotente: si ya es `owner/active`, no reescribe `createdAt`.
- Rechaza autoproclamación: `--uid` debe diferir de `--created-by-uid`.
- Requiere que `tenants/{tenantId}` exista antes de crear la membresía.
- Soporta `--dry-run`.
- Primero contra Firebase Emulator; después contra un proyecto real
  autenticando con `GOOGLE_APPLICATION_CREDENTIALS`.

### Procedimiento emulador (preferido para primera corrida)

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=minerp-sentinel \
node tools/bootstrap-owner.mjs \
  --tenant tbb \
  --uid <AUTH_UID_DEL_OWNER_TBB> \
  --created-by-uid system:bootstrap
```

### Procedimiento proyecto real (requiere aprobación humana)

1. Confirmar que `tenants/tbb` existe en Firestore.
2. Obtener el UID real del owner desde Firebase Auth (console).
3. Correr con Admin SDK autenticado por SA aprobado:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json \
node tools/bootstrap-owner.mjs \
  --tenant tbb \
  --uid <AUTH_UID> \
  --created-by-uid <operador>
```

4. Verificar en console que el doc existe como `owner/active`.
5. Guardar un registro fuera del repo del par (operador, uid).

### Rollback

- Antes de merge: revertir rama; nada en producción.
- Después de bootstrap: revocar la membresía fijando
  `status: "revoked"` + `revokedAt` + `revokedByUid`. El owner pierde acceso
  en la próxima request. Para restaurar: nueva corrida de
  `tools/bootstrap-owner.mjs` (es idempotente, repondrá `status: active`).

**No usar `delete` sobre el documento**: pierde `createdAt` histórico y
rompe la trazabilidad.

## Migración desde `admin:true`

- Backend: eliminado `requireAdmin` y el módulo `lib/admin-auth.ts`. Las
  rutas migraron a la fachada central con permisos explícitos.
- Frontend: `AdminGuard` y `login` consumen `getMyMembership` en vez de
  `token.claims.admin`. El claim legacy puede quedar en la base de usuarios
  (Auth) pero no concede acceso.
- Rules: `isAdmin()` eliminado. `hasActiveMembership(tenantId)` lo reemplaza.
- Fixtures Playwright: `createMembership` reemplaza el patrón
  `{ admin: true }`. Nuevo flag `legacyAdminClaim` solo para pruebas que
  verifican que el claim ya no concede acceso.

Ningún usuario existente queda habilitado para acceder a otras empresas:
el claim legacy no se traduce a membresía en ningún tenant.

## QA ejecutada (post-auditoría GPT 2026-10-24)

- `npm --workspace apps/functions run build`: OK.
- `npm --prefix packages/shared run typecheck`: OK.
- `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit`: OK.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: OK.
- `firebase emulators:exec --project demo-sec-base --only auth,firestore,functions 'npm run test:e2e:api'`:
  - **62/62 pruebas aprobadas** (33 M6J + 14 expenses + 14 SEC-BASE + 1 listener revocation).
  - Casos nuevos: owner opera su tenant; owner-A rechazado en B;
    admin-B no lee A; sin membresía → 403; miembro revocado → 403; claim
    legacy sin membresía → 403; tenant inexistente → 403; anónimo → 401;
    storefront público intacto; `getMyMembership` happy-path y foráneo;
    `listMyMemberships` devuelve solo tenants autorizados (vacío para
    no-afiliados y revocados); escritura directa a `members` desde cliente
    bloqueada por rules; evidencia de `permission-denied` al revocar con
    listener activo tras siguiente write.
- Bootstrap matrix (ver sección H-02): dry-run / inicial / idempotente /
  revocado-sin-flag refuses / `--reactivate` restaura y preserva `createdAt`
  — todos los exit codes esperados.

## Costo adicional de Firestore

Cada operación privada agrega hasta **2 lecturas** por solicitud:

1. `tenants/{tenantId}` para validar existencia.
2. `tenants/{tenantId}/members/{uid}` para resolver membresía/rol/estado.

Dentro de la misma solicitud, llamadas repetidas se memoizan vía
`WeakMap<Request, …>`. Para 7 endpoints administrativos con tráfico típico
de admin interno (decenas por hora), el costo es despreciable. Si SEC-02
o endpoints POS pasan a hacer varios chequeos por request, la memoización
ya lo cubre.

Las rules de Firestore agregan **1 lectura** más cuando el cliente consulta
`orders`/`customers`/`settings`/`expenses` para verificar membresía. En la
práctica el admin usa listeners (una verificación inicial por sesión), así
que no hay regresión notable.

## Restricciones respetadas

- No se implementó SEC-02, SEC-03 ni SEC-04.
- No hay invitaciones ni UI de personal.
- Sin JEV ni LLM.
- Tarifas, modelo comercial y cobros intactos.
- Sin bypass por entorno de desarrollo (todas las rutas gatean idéntico en
  emulador y producción).
- Sin cambios en proyectos Firebase remotos; sin deploy; sin merge.

## Hallazgos auditoría GPT (2026-10-24)

### H-01 — Autoría de gastos persistida

`handleCreateExpense` ahora recibe `actor` y escribe `createdByUid` +
`createdByEmail?` en `tenants/{tenantId}/expenses/{expenseId}`. La ruta
`createExpense` propaga el `AuthorizedActor` resuelto por la fachada.
Prueba de contrato nueva: *H-01: gasto persistido referencia al UID del actor
autenticado* en `e2e/api/expenses.contract.spec.ts`.

**No se backfillean gastos históricos**: solo gastos creados tras esta
migración incluyen el campo. Métricas y vistas que lean el campo deben
tratarlo como opcional.

### H-02 — Bootstrap endurecido

`tools/bootstrap-owner.mjs` ahora:

- Exige `--i-understand-this-is-not-emulator` fuera del emulador (ausencia
  de `FIRESTORE_EMULATOR_HOST`). Exit 5 si falta.
- Rechaza reactivar membresías revocadas sin `--reactivate`. Exit 4.
- Mantiene idempotencia (`owner/active` → no-op, exit 0).
- Promoción (p. ej. admin → owner) se maneja con el mismo path, preservando
  `createdAt` y limpiando `revokedAt`/`revokedByUid`.

Matriz de resultados contra el emulador:

| Escenario                                 | Exit | Resultado                                  |
| ----------------------------------------- | ---- | ------------------------------------------ |
| `--dry-run` sobre tenant vacío            | 0    | imprime payload planeado, no escribe       |
| alta inicial                              | 0    | crea owner/active + createdAt+createdByUid |
| re-ejecución sin cambios                  | 0    | no-op explícito                            |
| re-ejecución tras revoke sin `--reactivate` | 4  | rechaza                                    |
| re-ejecución tras revoke con `--reactivate` | 0  | restaura owner/active preservando createdAt |
| `--uid == --created-by-uid`               | 2    | rechaza autoproclamación                   |
| sin `FIRESTORE_EMULATOR_HOST` ni flag prod | 5    | rechaza por seguridad                     |

### Remediación PR #80 (2026-10-24, post-Codex)

#### CI-FIX — `firebase.pilot.json` abría rules por omisión

Causa raíz: `firebase.pilot.json` no incluía `firestore` → el job
"Run API contracts against pilot package" iniciaba el emulador sin
`firestore.rules` ni `firestore.indexes.json`. El emulador advierte en
stderr "Rules not available" y aplica permisivas (`allow read, write: if true`).
Toda prueba negativa de aislamiento pasaba en falso en esa segunda corrida.

Fix: `firebase.pilot.json` ahora declara `"firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" }`. El workflow sigue limitando el deploy manual a Functions (el `firebase deploy --only functions:amon-functions` no publica rules).

Fail-closed de defensa en profundidad: nuevo spec `e2e/api/sec-base-rules-closed.spec.ts` escribe anónimamente a `tenants/{tenantId}/expenses/anonymous-poke` y exige 403. Si el emulador vuelve a quedar abierto por un edit futuro de los configs, este spec detona antes que el resto de la suite dé verde falso.

#### P1-1 — Autorización efectiva de `updateOrderStatus` y `createPosSale`

Antes: ambos endpoints hardcodeaban `DEFAULT_TENANT = "tbb"` y no exigían token. `/pedidos` ya consultaba el tenant activo pero el backend lo ignoraba.

Fix:
- `apps/functions/src/lib/permissions.ts` incorpora `orders.update_status` y `pos.create_sale` a la lista `OPERATIONAL_PERMISSIONS` (owner y admin reciben ambos).
- `apps/functions/src/routes/pos.ts`: ambos handlers resuelven tenantId explícito (query o body) y pasan por `requireMembershipPermission(req, tenantId, permission)`. Sin fallback silencioso.
- `apps/admin/src/lib/api/orders.ts`: nuevo helper `authHeaders()` que obtiene un ID token fresco por request. `createPosSaleApi`, `updateOrderStatusApi` adjuntan `Authorization: Bearer <token>`; firmas ahora exigen `tenantId` explícito.
- `/pedidos` y `/pos` pasan `tenantId` desde `useActiveTenant()`.
- Nuevos tests en `sec-base-authorization.spec.ts`: anónimo → 401, no-afiliado → 403, cross-tenant → 403, sin tenantId → 400.
- `e2e/api/orders.contract.spec.ts` y el loop `expectBothChannelsRejected` de m6j ahora adjuntan `bearer(adminToken)` a cualquier `createPosSale`.

#### P1-3 — Eliminación de `STORE_TENANT_ID`

`apps/admin/src/lib/api/store.ts`: eliminada la constante `STORE_TENANT_ID`. Todas las funciones (`fetchStoreStatus`, `fetchStoreControl`, `setStoreOperationApi`, `updateStoreHoursApi`, `updateStoreDateExceptionApi`, `deleteStoreDateExceptionApi`, `fetchCashCloseDay`, `closeCashSessionApi`) reciben `tenantId` como primer argumento. El cliente lo propaga desde `useActiveTenant()`.

Call-sites migrados: `app/operacion/page.tsx`, `components/store-status-strip.tsx`, `components/operation/cash-panel.tsx`, `components/operation/store-panel.tsx`, `components/operation/schedule-editor.tsx`, `components/operation/special-dates-editor.tsx`.

#### P1-2 — Reset de estado POS al cambiar tenant

`apps/admin/src/components/admin-guard.tsx` envuelve `children` con `<div key={activeTenant.tenantId}>`. En cambio de tenant, React remonta toda la rama bajo el guard. Resultado:
- Carrito y formulario de cliente reiniciados.
- Catálogo de productos y precios se re-fetchean.
- Listeners de órdenes del día e historial POS se desuscriben y reabren contra la nueva colección.
- Pending orders y receipts internos se descartan.

Garantía: un ítem agregado al carrito en el tenant A no puede terminar en una venta persistida bajo B porque el componente que la crea deja de existir.

#### P2 — Estado "error" en `TenantProvider`

Antes: cualquier fallo transitorio en `fetchMyMemberships` degradaba a `status: "unauthenticated"`, el guard redirigía a `/login`, el login detectaba sesión Firebase viva + fetch exitoso y volvía a `/pedidos` — loop.

Fix:
- Nuevo `status: "error"` en `TenantContext` + campo `errorMessage` para debugging.
- Resolver distingue: `auth.currentUser === null` → `unauthenticated`; `fetchMyMemberships() === null` (401/403) → `unauthenticated`; throw (red/5xx) → `error`.
- `AdminGuard` renderiza una UI con "Reintentar" y "Cerrar sesión" cuando `status === "error"`. **No** redirige: rompe el loop.
- Login maneja igual el error: muestra mensaje sin autoredirigir ni auto-logout.

### H-03b — Fix de reproducibilidad del test de revocación (2026-10-24, post-QA)

QA humano con `npx playwright test e2e/api/sec-base-listener-revocation.spec.ts --workers=1 --repeat-each=5` reportó 5/5 FAIL con `unexpected error on initial snapshot: permission-denied` en el snapshot inicial.

**Causa raíz**: `sec-base-listener-revocation.spec.ts` tenía un fallback propio `process.env.FIREBASE_PROJECT_ID ?? "demo-sec-base"` que no coincidía con el resto del repo:

- `.firebaserc` default: `minerp-sentinel`.
- `emulator-fixtures.ts`, los otros specs y `playwright.config.ts`: `?? "minerp-sentinel"`.
- Solo este spec: `?? "demo-sec-base"`.

Sin `FIREBASE_PROJECT_ID` en el entorno (ejecución local directa de Playwright), las fixtures REST escribían la membresía en el namespace `minerp-sentinel`, mientras el Firebase Web SDK dentro del spec inicializaba la app con `projectId: "demo-sec-base"`. Las rules evaluaban `hasActiveMembership(tenantId)` en `demo-sec-base`, no encontraban el doc y rechazaban la lectura con `permission-denied` ANTES de probar la revocación. El workflow CI pasaba porque exportaba `FIREBASE_PROJECT_ID=demo-sec-base`, lo que accidentalmente alineaba ambos lados en el mismo namespace.

**Fix** (`e2e/support/emulator-fixtures.ts`, `e2e/api/sec-base-listener-revocation.spec.ts`):
- `PROJECT_ID` y `FIRESTORE_DOCS` exportados desde `emulator-fixtures.ts` como fuente única de verdad.
- El spec elimina su constante local y los importa.
- Se agregó una verificación defensiva antes de abrir el listener: `GET /tenants/{tenantId}/members/{uid}` vía REST con token owner. Si la membresía no es visible en el namespace actual, el test falla con un mensaje accionable que menciona `project=<id>` y pide alinear fixtures y SDK.
- El mensaje de `permission-denied` del snapshot inicial ahora reporta `project`, `tenant` y `uid` para hacer el diagnóstico instantáneo si vuelve a aparecer.

**No se modificaron Firestore rules.** La propiedad real (listener NO desconecta hasta el próximo evento) y la mitigación cliente de H-03 siguen intactas.

**Verificación**:
- Bare-run reproducible como el QA humano: `firebase emulators:exec --project minerp-sentinel --only auth,firestore,functions 'npx playwright test e2e/api/sec-base-listener-revocation.spec.ts --workers=1 --repeat-each=5'` → **5/5 PASS** (~550 ms por corrida).
- Suite API completa en bare-run: **62/62 PASS**.
- Suite API con `FIREBASE_PROJECT_ID=demo-sec-base`: **62/62 PASS** (regresión del flujo CI).
- Unit tests Playwright: **96/96 PASS**.

### H-03 — Revocación y listeners activos

**Hecho observado (contrario al mito de "revocación instantánea")**: las
rules de Firestore NO desconectan listeners existentes en el momento del
patch a `members/{uid}`. La re-evaluación ocurre al siguiente evento del
watcher — nueva escritura en la colección observada, nuevo listener, o
token refresh del cliente. Lo demuestra el test
`e2e/api/sec-base-listener-revocation.spec.ts`, que necesita un write
posterior al revoke para que el listener dispare `permission-denied`.

Mitigación en cliente (`apps/admin/src/lib/auth/handle-authz-loss.ts`):
cuando el callback de error de `onSnapshot` recibe `permission-denied`,
`tearDownAuthorizedSession()` cierra sesión en Firebase Auth y navega vía
`window.location.assign("/login")` para forzar liberación de estado.
Instalado en `useLiveExpenses`, `useLiveOrders`, y los dos listeners
privados de `/pos` (`todayOrders`, `posHistoryOrders`).

Ventana real de revocación efectiva en UI:
- Suscripción activa + sin tráfico → el usuario sigue viendo datos stale
  hasta que llega un write a la colección (típicamente inminente: nueva
  orden, nuevo gasto, cambio de estado).
- Suscripción activa + tráfico normal → próxima emisión dispara error y
  tear-down.
- Nueva pestaña / recarga → la resolución de membresía vía
  `listMyMemberships` falla directamente.

Para invalidación inmediata del ID token habría que llamar
`admin.auth().revokeRefreshTokens(uid)` desde Admin SDK + forzar al cliente
a refrescar. Queda fuera de alcance SEC-BASE y debería evaluarse en
SEC-02 junto al endpoint "revocar miembro".

### H-04 — Contexto multi-tenant en el frontend

- Nuevo endpoint `GET /listMyMemberships` (`apps/functions/src/routes/membership.ts`).
  Requiere token válido; devuelve `{ uid, email, memberships[] }` con
  `tenantId`, `tenantName`, `role`, `permissions`. Lista vacía si el usuario
  no está en ninguna membresía activa (NO 403).
- `firestore.indexes.json` declara el índice compuesto necesario:
  `collectionGroup members` + `uid ASC` + `status ASC`. `firebase.json`
  apunta a ese archivo. En emulador no es necesario; en prod se despliega
  junto al deploy piloto.
- `TenantProvider` (`apps/admin/src/components/tenant-provider.tsx`)
  resuelve memberships tras `onAuthStateChanged`. Auto-selecciona si hay
  una; valida que la selección manual pertenezca a la lista servida
  (nunca acepta un `tenantId` arbitrario). `sessionStorage` conserva la
  selección por pestaña.
- `AdminGuard` ahora delega al contexto. Estados:
  - `loading` → spinner.
  - `unauthenticated` → redirige a `/login`.
  - `no-memberships` → UI explicativa + botón salir.
  - `authenticated` sin tenant activo → `TenantSelector`.
  - `authenticated` con tenant activo → renderiza children.
- `TenantBadge` + `ActiveTenantCard` muestran empresa + rol + email + selector
  compacto en el sidebar.
- Páginas migradas de `const tenantId = "tbb"` a `useActiveTenant().tenantId`:
  `/pedidos`, `/pos`, `/gastos`, `/metricas`. Login consume `fetchMyMemberships`
  para decidir redirect post-sign-in.

Pruebas backend (ya cubiertas por *H-04: listMyMemberships devuelve solo
los tenants autorizados*):
- owner de A ve solo A.
- admin de B ve solo B.
- no-afiliado y revocado ven lista vacía (200, no 403).
- anónimo → 401.

Pruebas de aislamiento cruzado y promoción directa bloqueada por rules se
mantienen desde la primera iteración de SEC-BASE.

## Matriz final (roles × permisos × tenants)

### Matriz por rol

| Permiso                   | owner | admin |
| ------------------------- | :---: | :---: |
| `expenses.create`         |   ✅   |   ✅   |
| `store.read_control`      |   ✅   |   ✅   |
| `store.manage_operation`  |   ✅   |   ✅   |
| `store.manage_hours`      |   ✅   |   ✅   |
| `cash.read_summary`       |   ✅   |   ✅   |
| `cash.close_session`      |   ✅   |   ✅   |
| `orders.read_private`     |   ✅   |   ✅   |
| `orders.update_status`    |   ✅   |   ✅   |
| `pos.create_sale`         |   ✅   |   ✅   |
| `members.manage`          |   ✅   |   ❌   |

### Mapeo endpoint → permiso

| Endpoint                       | Permiso requerido       |
| ------------------------------ | ----------------------- |
| `POST /createExpense`          | `expenses.create`       |
| `GET /getStoreControl`         | `store.read_control`    |
| `POST /setStoreOperation`      | `store.manage_operation`|
| `POST /updateStoreHours`       | `store.manage_hours`    |
| `POST /updateStoreDateException` | `store.manage_hours` |
| `POST /deleteStoreDateException` | `store.manage_hours` |
| `GET /getCashCloseSummary`     | `cash.read_summary`     |
| `POST /closeCashSession`       | `cash.close_session`    |
| `GET /getMyMembership`         | (requiere membresía activa, cualquier rol) |
| `GET /listMyMemberships`       | (requiere token válido; devuelve lista vacía si no hay memberships) |
| `GET /getStoreStatus`          | público (sin token)     |
| `POST /createOrder`            | público (storefront)    |
| `POST /createPosSale`          | `pos.create_sale`       |
| `PATCH /updateOrderStatus`     | `orders.update_status`  |
| `GET /getOrder`                | `orders.read_private` (SEC-04; antes público) |

El aislamiento es por membresía: un usuario puede tener memberships en
`tenantA` y `tenantB` con roles distintos. Cada request resuelve el permiso
contra la membresía del tenant que se envía explícitamente — nunca contra
una "sesión multi-tenant" implícita.

## Riesgos residuales

- `createOrder` y `getOrder` siguen siendo rutas públicas por diseño
  (storefront + tracking futuro). SEC-BASE no las toca.
  `updateOrderStatus` y `createPosSale` quedaron autorizados en la
  remediación PR #80 (P1-1).
- Revocación de membresía con listener Firestore activo: NO es
  instantánea en UI. La propiedad precisa está documentada en H-03.
  Mitigación cliente ya instalada. Invalidación inmediata requiere
  `admin.auth().revokeRefreshTokens(uid)` + forzar refresh; fuera de
  alcance SEC-BASE.
- `fetchMyMemberships` requiere el índice compuesto declarado en
  `firestore.indexes.json`. En emulador funciona sin él; en producción
  Firebase construye el índice automáticamente al primer deploy —
  verificar la primera corrida.
- Si alguien manipula `vars.FIREBASE_PILOT_*` en el environment, el
  workflow piloto se protege con el preflight; sin embargo, el override por
  environment sigue siendo posible (riesgo bajo, aceptado en PR #79).
- **BUILD-01** (`roadmap/build-01-functions-lockfile.md`):
  `apps/functions/package-lock.json` sigue desalineado respecto al
  manifiesto (zod 3 vs 4, falta `@amon/shared`). Rompe `npm ci --prefix
  apps/functions`. El workflow piloto lo esquiva pero sigue siendo
  **bloqueante antes de habilitar `FIREBASE_PILOT_DEPLOY_ENABLED=true`**.
  Follow-up aislado documentado.

## Próximo paso

1. Nueva auditoría cruzada GPT/Claude de la diff (post-H01..H04 + BUILD-01 record).
2. QA humano en emulador si procede:
   - Bootstrap de owner con `tools/bootstrap-owner.mjs` contra emulador.
   - Login/gastos/cierre de caja en TBB con el owner creado.
   - Multi-tenant: añadir membresía en un segundo tenant y verificar
     selector + badge.
   - Revocación mientras `/pedidos` está abierto: forzar un write (nueva
     orden) y verificar tear-down a `/login`.
3. Cerrar BUILD-01 como follow-up aislado antes de habilitar el deploy
   piloto.
4. Al merge: bootstrap real del owner de TBB antes de habilitar el
   workflow piloto. Programar SEC-02.

**Estado**: READY FOR REVIEW. SEC-02 permanece BLOCKED hasta merge.
