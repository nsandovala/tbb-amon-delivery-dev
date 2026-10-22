# SEC-01 — Protección de `createExpense`

Parte del contrato **SPRINT 01 · SECURE CORE** (`fix/sec-01-expense-auth`).
Baseline: `efe1561d8ec282b5b48ad908363cc9384078e4a5`.

## Qué cambió

- `apps/functions/src/routes/expenses.ts` llama a `requireAdmin(req)` **antes**
  de parsear el body o tocar Firestore. Lectores sin token reciben `401`
  (`UNAUTHENTICATED`); autenticados sin claim `admin` reciben `403` (`FORBIDDEN`).
  El check `405` para métodos distintos a `POST` se evalúa antes del auth gate
  para no revelar nada a probes equivocadas.
- `apps/admin/src/lib/api/expenses.ts` adjunta un Firebase ID token fresco
  (`auth.currentUser.getIdToken()`) en cada llamada. El token no se persiste y
  si no hay sesión activa se lanza el mismo error humano usado en otras APIs
  admin ("Sesión admin expirada. Vuelve a ingresar.").
- `e2e/api/expenses.contract.spec.ts` se actualizó para:
  - Ejecutar los happy-paths con token admin del emulador.
  - Agregar tres pruebas negativas de autorización (sin token, token basura,
    staff sin claim admin) que además verifican que la colección de gastos del
    tenant fixture queda **vacía** tras cada rechazo.
  - Un round-trip admin que lee el documento con `Bearer owner` del emulador
    para confirmar que categoría, importe, método de pago y `occurredAt` se
    preservan sin alteración.
- `e2e/api/m6j-store-operation.contract.spec.ts` envía token admin en las dos
  llamadas a `createExpense` del flujo de cash close (`Pan de emergencia` y
  `Intento posterior al cierre`). El resto de la suite no requirió cambios.

## Por qué

La auditoría GPT × Claude detectó que `createExpense` escribía sin autenticar
al solicitante. Un atacante podía inflar los gastos del día operacional e
impactar `expectedCash` del cierre de caja. El cambio cierra ese vector sin
alterar la validación financiera: ya existía `requireAdmin` reutilizado en los
endpoints de operación y cierre, por lo que SEC-01 solo lo propaga a la ruta de
gastos.

## Archivos modificados

- `apps/functions/src/routes/expenses.ts`
- `apps/admin/src/lib/api/expenses.ts`
- `e2e/api/expenses.contract.spec.ts`
- `e2e/api/m6j-store-operation.contract.spec.ts`
- `roadmap/sprint-sec-01-expense-auth.md` (nuevo)
- `roadmap/phase-log.md`

Sin cambios en: schemas, servicios, repositorios, reglas Firestore, UI de la
página `/gastos`, firma pública del endpoint.

## Contratos afectados

- **Autenticación `/createExpense`**: ahora obliga `Authorization: Bearer <ID
  token>` con claim `admin:true`. Mismo claim que `isAdmin()` en
  `firestore.rules` y que el resto de endpoints administrativos. No se agrega
  actor al documento de gasto (fuera de alcance de SEC-01).
- **Tenant scope**: el claim `admin` es global y la ruta acepta un `tenantId`
  solicitado por el cliente. SEC-01 cierra la escritura anónima, pero todavía
  no verifica membresía ni rol dentro de ese tenant. SEC-BASE debe definir
  identidad, membresías por tenant, roles granulares y trazabilidad antes de
  SEC-02. AMON Shop se construye como producto multi-tenant seguro y listo
  para producción, sin atajos de demo.
- **Firestore**: ninguna modificación en reglas ni en esquemas. Cualquier
  cambio en reglas requiere un ticket aparte.
- **UI `/gastos`**: envuelta por `AdminGuard`; además, la llamada comprueba
  `auth.currentUser` y falla localmente si la sesión ya no está disponible.
  Las capturas muestran un registro exitoso, pero falta QA humano en DevTools
  del Bearer token y del rechazo negativo.

## Validación

Ejecutado contra el emulador local (`npm run dev:emulators`) desde el checkout:

- `npm --prefix apps/functions run build`: OK (tsc sin errores).
- `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit`: OK.
- `npx playwright test e2e/api/expenses.contract.spec.ts --config=playwright.config.ts`:
  **13/13 OK**, incluidos los 4 casos nuevos de autorización.
- `npx playwright test e2e/api/m6j-store-operation.contract.spec.ts --config=playwright.config.ts`:
  **19/19 OK** (regresión completa del cierre de caja).
- `npx playwright test e2e/api --config=playwright.config.ts`: **46/46 OK**
  (orders + expenses + m6j).
- `npx playwright test e2e/unit --config=playwright.config.ts`: **96/96 OK**.

Matriz de endpoints y permisos tras SEC-01:

| Endpoint             | Anónimo | Autenticado sin admin | Admin |
| -------------------- | ------- | --------------------- | ----- |
| `createOrder`        | 201     | 201                   | 201   |
| `getOrder`           | 200     | 200                   | 200   |
| `getStoreStatus`     | 200     | 200                   | 200   |
| `createPosSale`      | 201     | 201                   | 201   |
| `updateOrderStatus`  | 200     | 200                   | 200   |
| **`createExpense`**  | **401** | **403**               | **201** |
| `getStoreControl`    | 401     | 403                   | 200   |
| `setStoreOperation`  | 401     | 403                   | 200/201 |
| `updateStoreHours`   | 401     | 403                   | 200   |
| `updateStoreDateException` | 401 | 403               | 200   |
| `deleteStoreDateException` | 401 | 403               | 200   |
| `getCashCloseSummary` | 401    | 403                   | 200   |
| `closeCashSession`   | 401     | 403                   | 200/201 |

`createOrder`, `getOrder`, `getStoreStatus`, `createPosSale` y
`updateOrderStatus` siguen abiertos: están fuera del alcance de SEC-01 y se
tratan en SEC-02/SEC-03/SEC-04 del mismo sprint SECURE CORE.

## Riesgos y siguientes pasos

- **Riesgo residual:** `admin:true` global permite solicitar cualquier tenant.
  La autorización por membresía y rol queda bloqueante en SEC-BASE. No declarar
  QA humano completo hasta confirmar Bearer y rechazo negativo en DevTools.
- **Dependencia descubierta:** el test de cash close (`m6j`) hacía `createExpense`
  sin token. La actualización se incluyó aquí porque es consecuencia directa
  del cierre del endpoint.
- **Fuera de alcance de SEC-01 (tracked en Sprint 02 / 03 de la auditoría):**
  - `createPosSale`, `updateOrderStatus`, `createExpense` quedaban abiertos
    (SEC-02 y SEC-03 cubrirán los dos restantes).
  - `getOrder` expone PII; endurecer el acceso requiere ticket propio (SEC-04).
  - Claim admin global, no scoped-by-tenant: SEC-BASE bloquea SEC-02.
  - Falta `firestore.indexes.json` en el repo (Sprint 03, P03-03).
  - Sin alertas de presupuesto Firebase declaradas en código (Sprint 04, RG-02).
  - `cors: true` indiscriminado en todos los endpoints (sprint posterior).

## Siguiente paso

- Crear PR de SEC-01 y completar QA humano antes de solicitar aprobación de merge.
- Ejecutar SEC-BASE como siguiente ticket; SEC-02 queda bloqueado hasta que
  identidad, membresías por tenant, roles y trazabilidad tengan contrato y
  controles verificables. **No arrancar SEC-02 automáticamente.**
