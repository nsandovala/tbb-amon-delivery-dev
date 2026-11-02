# DEPLOY-READY-01 — Fase A (seguridad y configuración)

## Estado

**Implementación local, sin commit.**

- Rama `feat/deploy-ready-01` sobre `main@20a68b9`. Sin push, PR ni deploy.
- No se tocó Firebase real ni Blaze.
- **Bloqueo de entorno:** las pruebas en emulador están pendientes, porque un proceso residual del emulador de Firestore ocupa los puertos 8080 y 9150 (ver Validación).
- **A3** (tenant explícito) está preparado y no aplicado, a la espera de aprobación por ser un cambio contractual.

## Qué cambió

### A1 — Builds productivos fail-closed

- **`tools/build-hosting.mjs`** (`npm run build:hosting:web` y `npm run build:hosting:admin`):
  1. Carga el entorno **efectivo** con `@next/env` (`loadEnvConfig(dir, false)`), la misma función y el mismo orden que `next build`: variables del proceso, luego `.env.production.local`, `.env.local`, `.env.production` y `.env`.
  2. Valida el entorno. Exige las variables `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID` y `NEXT_PUBLIC_FUNCTIONS_BASE_URL`, más `NEXT_PUBLIC_STORE_SLUGS` en web. Rechaza:
     - `NEXT_PUBLIC_USE_EMULATOR` distinto de vacío o `false`;
     - cualquier `NEXT_PUBLIC_*` con `localhost`, `127.0.0.1`, `0.0.0.0`, `demo-`, `minerp-sentinel` o `minierp-sentinel`;
     - un formato inválido de proyecto, API key, authDomain o slugs;
     - una URL de Functions distinta de `https://us-central1-<projectId>.cloudfunctions.net`.

     Cada error indica de qué archivo salió el valor.
  3. Ejecuta `next build` con `NEXT_OUTPUT=export` y `AMON_BUILD_TARGET=production`. Usa `process.execPath` más `next/dist/bin/next`, sin `.bin`.
  4. **Segunda barrera:** recorre `out/` y falla si encuentra `127.0.0.1`, `localhost:`, `minerp-sentinel`, `minierp-sentinel` o `demo-amon-ci`.
- **`apps/{web,admin}/src/lib/public-env.ts`:** única fuente de la configuración pública. `next.config.ts` inyecta `AMON_BUILD_TARGET` como literal en todos los builds. En producción, las ramas de emulador y los valores de respaldo (`"dev"`, `minerp-sentinel`, `127.0.0.1`) quedan como código muerto y desaparecen del bundle. Las 6 APIs y los 2 clientes Firebase usan este módulo.
- **`next.config.ts`:** `AMON_BUILD_TARGET=production` sin `NEXT_OUTPUT=export` aborta.
- **El desarrollo y los builds normales no cambian:** la rama local conserva la lógica previa al pie de la letra.
- **Job `hosting-spike` fuera del validador (opción B):**
  - construye contra emuladores **a propósito** con `npm --workspace apps/<app> run build`;
  - un modo `--target=emulator` agregaría superficie al validador productivo sin proteger nada;
  - el validador solo corre en los scripts `build:hosting:*`.
- **CI (`qa.yml`):** se agregan los guards (`tools/test-build-hosting.mjs`, 28 casos) y un build productivo real con el proyecto ficticio `tbb-pilot-placeholder`, incluida la verificación de `out/`.

### A2 — CORS por allowlist

Ver `docs/architecture/cors-contract.md`.

- 19 de 19 endpoints usan `onRequestWithCors`.
- En producción solo se permite `AMON_CORS_ALLOWED_ORIGINS`, con fail-closed; en el emulador, además, los orígenes locales.

### A3 — Fallbacks de tenant (preparado, NO aplicado)

- **Clientes de `createOrder`:** solo la tienda (`cart-summary.tsx`), con `tenantId` obligatorio por prop. `createOrderApi` de admin no tiene uso.
- **Clientes de `getStoreStatus`:** la tienda (`store-special-dates.tsx`, con `tenantId={tenant.id}`) y la tira de estado del admin (`store-status-strip.tsx`, con `tenantId`).
- **Pruebas existentes:** ninguna depende del fallback.
- **Cambio propuesto:**
  - `createOrderSchema.tenantId` pasa a ser obligatorio;
  - se eliminan `DEFAULT_TENANT` y `PUBLIC_FALLBACK_TENANT`;
  - sin tenant → 400 `VALIDATION_ERROR`.
- Cambia el contrato de la API pública, así que espera aprobación. El parche y su spec (`deploy-ready-tenant.contract.spec.ts`, 5 casos) están fuera del repo. Compila; falta ejecutarlo en el emulador.

### A4 — Mínimo privilegio (sin cambios)

- `membershipRoleSchema` admite solo `owner` y `admin`, y ambos tienen todos los permisos operativos, incluido `orders.read_private`.
- Las reglas dejan a cualquier miembro activo leer `orders`, `customers`, `settings`, `expenses`, `cashCloseSessions` y `auditEvents` **de su tenant**. `paymentEvents` queda reservado a owner y admin.
- Anónimos no tienen acceso, y otros tenants tampoco, porque la membresía es por ruta.
- **Hoy no hay exposición indebida.** El riesgo es futuro: un rol nuevo (por ejemplo, cajero en SEC-02) heredaría la lectura de datos personales por `hasActiveMembership`. Al agregar roles hay que cambiar estas reglas a permisos por rol, como `canViewPayments`.

### A5 — Herramientas administrativas

- **`tools/bootstrap-owner.mjs`:**
  - exige `--project <id>`;
  - aborta (código 6) si `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `FIREBASE_PROJECT_ID`, `FIREBASE_CONFIG` o el `project_id` de `GOOGLE_APPLICATION_CREDENTIALS` apuntan a otro proyecto, o si se usa `demo-*` fuera del emulador;
  - inicializa Admin SDK con el proyecto explícito y lo verifica;
  - conserva el modo emulador, `--dry-run` y `--i-understand-this-is-not-emulator`.
- **`--dry-run` de `bootstrap-owner`:** también lee Firestore, así que fuera del emulador exige `--i-understand-this-is-not-emulator` (código 5). Corrección de la revisión cruzada.
- **`tools/set-admin-claim.mjs`:**
  - aborta sin `FIREBASE_AUTH_EMULATOR_HOST`, sin `--project` o con un `--project` distinto de `GCLOUD_PROJECT`;
  - ya no tiene proyecto por defecto (se eliminó el respaldo `minerp-sentinel`, tras la revisión cruzada);
  - corrige el riesgo 6 de HOSTING-SPIKE.
- **CI sin literales con forma de credencial:** la API key ficticia se genera al vuelo y aleatoria (`node tools/test-build-hosting.mjs --print-placeholder-key`).

## Por qué

- Un build productivo podía compilar sin variables, o con el `.env.local` de emulador del PC, y publicar un sitio apuntando a `127.0.0.1` o a `minerp-sentinel`.
- `cors: true` aceptaba cualquier origen.
- Las herramientas de bootstrap podían escribir en el proyecto que infiriera ADC.

## Contratos afectados

| Contrato | Cambio |
|---|---|
| CORS de Functions | Nuevo, en `docs/architecture/cors-contract.md` |
| API de pedidos y tienda | Sin cambios (A3 no aplicado) |
| Firestore | Sin cambios |
| `tools/bootstrap-owner.mjs` | `--project` pasa a ser obligatorio (uso operativo) |

## Validación

- **Builds y typechecks:** Shared (build y typecheck), Functions, Web y Admin (`tsc --noEmit` y build normal): OK.
- **Unitarias:** 234 aprobadas (217 de la base más 17 de CORS).
- **Guards:** los 28 del build de Hosting y los 5 del empaquetado piloto, OK.
- **Build productivo con `tbb-pilot-placeholder`:**
  - web y admin OK;
  - `out/` sin marcadores;
  - la URL ficticia de Functions aparece inlineada.
- **Barrera de artefactos:** la primera versión de admin dejó `http://127.0.0.1:9099` en el bundle, y la barrera lo detectó. Se corrigió condicionando cada valor local a `AMON_BUILD_TARGET` y no a un binding exportado.
- **Caso negativo real:** `node tools/build-hosting.mjs --app web --check-only` con el `.env.local` de este PC da 9 errores en web y 8 en admin, todos atribuidos a `apps/<app>/.env.local`.
- **Emulador oficial con `firebase.json` (`test:e2e:api`, `demo-amon-ci`, firebase-tools 15.34.1 desde la caché local):**
  - **exit 0:** `contracts` con **212** aprobadas y `fin-h01-isolated` con **2**, entre 2026-11-02 16:22 y 16:24;
  - incluye 41 pruebas de CORS (los 19 endpoints) y 13 de herramientas administrativas;
  - sin `Unhandled error`, `ECONNRESET` ni transacciones inválidas.
- **Emulador oficial con `firebase.pilot.json` (paquete autónomo `.firebase-pilot/functions`):**
  - **exit 0:** **212 + 2** aprobadas, entre 16:36 y 16:37;
  - el paquete se generó con `tools/prepare-firebase-pilot.mjs` (lock idéntico al versionado) y se instaló con `npm ci --offline`;
  - carga las 19 Functions desde `.firebase-pilot/functions`.
- **Desglose por área, idéntico en ambas configuraciones:**

  | Área | Aprobadas |
  |---|---|
  | SEC-BASE (autorización, reglas cerradas, revocación) | 16 |
  | SEC-04 | 15 |
  | FIN-01 (authz, pagos, correcciones, concurrencia) más PR88 | 38 |
  | ORDER-IDEMPOTENCY | 23 |
  | COST-GUARD | 19 |
  | M6J | 19 |
  | Pedidos | 14 |
  | Gastos | 16 |
  | CORS | 41 |
  | Herramientas administrativas | 13 |
  | **Total** | **214** |

  0 fallos, 0 respuestas 500 o `Unhandled error`, 0 `ECONNRESET`. Ningún archivo de código cambió entre las dos corridas.
- **Procesos residuales:**
  - PID 36476 (residual de la corrida 1) se terminó con autorización de Nelson, tras verificar el JAR oficial, `demo-amon-ci`, el padre inexistente y los sockets en 8080/9150.
  - La corrida 2 dejó otro residual, PID 23080, que **no se terminó** por no estar autorizado.
- **Hallazgo de entorno (Windows):** `emulators:exec` deja vivo el proceso Java del emulador de Firestore. Esa es la causa del PID 17076 anterior, que ya no existe y no se terminó.
  - Esos sockets aparecen con estado TCP `0`, un valor fuera del enum de `Get-NetTCPConnection`.
  - Los scripts de la skill filtran `-State Listen` y por eso informan `clean` aunque los puertos sigan bloqueados.
  - La skill necesita revisar cualquier estado, o el PID dueño.

## Riesgos restantes

1. Faltan las pruebas en emulador: CORS en los 19 endpoints, herramientas administrativas, regresión completa de contratos y paquete piloto.
2. A3 sigue sin aplicar: `createOrder` y `getStoreStatus` aún eligen `tbb` si falta el tenant.
   - **Compatibilidad:** `contracts/api-contracts.md` y `contracts/order.schema.json` ya declaran `tenantId` obligatorio, así que el parche alinea el código con el contrato publicado.
   - **Consumidores conocidos:** todos envían `tenantId`.
   - **Sin verificar:** `tbb-whatsapp-baileys-lab` no está en este PC. El único `createOrder` externo encontrado (`C:\Dev\dark_kitchen`, remoto `sentinel-erp`) es un `onCall` propio y no consume AMON.
3. CORS productivo sin configurar hasta DEPLOY-PILOT-01, que lo deja fail-closed. Para servir a navegadores hay que fijar `AMON_CORS_ALLOWED_ORIGINS`.
4. Un build productivo en el PC exige sobrescribir o retirar el `.env.local` de emulador. Es intencional.
5. App Check y rate limit siguen pendientes de decisión.
6. `--dry-run` de `bootstrap-owner` lee Firestore real sin `--i-understand-this-is-not-emulator` (solo lectura, preexistente).
7. Fase C: `playbooks/release-checklist.md` todavía recomienda "restore permissive rules" (F8).

## Próximo paso

1. Nelson resuelve el PID 17076.
2. Se corren los emuladores oficiales con `firebase.json` y `firebase.pilot.json`.
3. Nelson decide sobre A3.
4. Revisión cruzada.
5. GO o NO-GO para la Fase B.
