# FIN-01 — Confirmación individual y auditable de transferencias

## Estado

**FIN-01 FINAL CORRECTIONS VERIFIED (29-10-2026).** Pendiente de revisión humana. Ver [Correcciones del QA humano](#correcciones-del-qa-humano-29-10-2026).
- Rama `feat/fin-01-transfer-confirmation` sobre `09958d1` (post-#86), trabajada en un worktree aislado (`C:\Dev\tbb-amon-fin-01`). Último commit `e921b76`; las correcciones siguen sin commit.
- No hubo commit, push, PR, merge ni deploy. No se usaron Firebase real, Blaze ni bancos.
- Contrato aprobado: v2.1 (FIN-H01, FIN-H02, FIN-Q01, FIN-Q02). Detalle en `docs/architecture/payment-confirmation-contract.md`.

## Qué cambió

1. **Backend:**
   - Rutas `confirmTransferPayment`, `revertTransferConfirmation` y `listPaymentEvents`.
   - Libro append-only `paymentEvents` con IDs derivados de la clave.
   - Proyección `paymentStatus` / `paymentConfirmation` en el pedido.
   - Contador `orderCounters/{D}.payments`.
2. **Permisos:** `payments.view` y `payments.confirm_transfer`, para owner y admin.
3. **Reglas:** `canViewPayments` y `paymentEvents` con lectura restringida y escritura cerrada.
4. **Cierre de caja v2:**
   - Blocker `UNCONFIRMED_TRANSFERS` (se puede saltar con override).
   - Buckets `transferConfirmedSales`, `transferUnconfirmedSales`, `cancelledPaidTransfers` y `transferCollections`.
   - `collectionDifference`.
   - Verificación del libro contra el contador; error `PAYMENT_EVENTS_LIMIT`.
   - Los días cerrados se informan desde su snapshot.
5. **Admin:**
   - Componente `TransferPaymentControl` en el detalle de `/pedidos` y en "Ventas sin cerrar" de `/pos`.
   - Panel de caja con cobros confirmados, transferencias sin confirmar y reembolsos por revisar.
   - Métricas separa ventas registradas, ventas entregadas y cobros confirmados, con señal de datos incompletos.
6. **Corrección lateral (FIN-H02):** una membresía con rol o estado no reconocido ahora responde 403 en vez de 500 (`firestore-memberships.repo.ts`).

## Por qué

- Elegir "transferencia" no garantizaba que el abono hubiera llegado.
- Caja contaba esas ventas como esperadas, pero Métricas las mostraba como pendientes para siempre, porque `paymentStatus` nunca cambiaba.
- No había trazabilidad por pedido, actor ni fecha.

## Decisiones aplicadas

| ID | Decisión |
|---|---|
| D1 | Blocker `UNCONFIRMED_TRANSFERS` con override auditado y motivo |
| D2 | Confirmación tardía imputada a la jornada efectiva; no se tocan snapshots |
| D3 | `paymentEvents` solo vía Functions; lectura con `payments.view` |
| D4 | `payments.confirm_transfer` para owner y admin |
| D5 | Ventas registradas, ventas entregadas y cobros confirmados se muestran por separado |
| D6 | Reversión con motivo, actor, evento inmutable e idempotencia |

**Desviación del contrato:** el clasificador no vive en `packages/shared`. Ese paquete es ESM-only y Functions (CommonJS) no puede importarlo en runtime (mismo motivo que `order.shared.ts`). En su lugar hay un espejo en el admin, con una prueba de paridad que recorre todas las combinaciones.

## Archivos

**Nuevos:**
- `apps/functions/src/lib/payment-ledger.ts`
- `apps/functions/src/repositories/firestore-payments.repo.ts`
- `apps/functions/src/routes/payments.ts`
- `apps/functions/src/schemas/payment-confirmation.schema.ts`
- `apps/admin/src/lib/payment-ledger.ts` (espejo)
- `apps/admin/src/lib/api/payments.ts`
- `apps/admin/src/hooks/use-live-payment-events.ts`
- `apps/admin/src/components/payments/transfer-payment-control.tsx`
- `e2e/unit/fin-01-ledger.spec.ts`
- `e2e/api/fin-01-payments.contract.spec.ts`
- `e2e/api/fin-01-authz.spec.ts`
- `e2e/api/fin-01-concurrency.spec.ts`
- `e2e/support/fin-01-fixtures.ts`
- `docs/architecture/payment-confirmation-contract.md`
- `roadmap/sprint-fin-01.md`

**Modificados:**
- `apps/functions/src/`: `index.ts`, `lib/cash-close.ts`, `lib/idempotency.ts`, `lib/permissions.ts`, `repositories/firestore-store.repo.ts`, `repositories/firestore-memberships.repo.ts`, `schemas/order.shared.ts`, `services/cash-close.service.ts`
- `apps/admin/src/`: `app/metricas/page.tsx`, `app/pedidos/page.tsx`, `app/pos/page.tsx`, `components/operation/cash-panel.tsx`, `lib/api/store.ts`, `lib/firebase/queries/orders.ts`, `lib/metrics.ts`
- `packages/shared/src/schemas/order.schema.ts`
- `firestore.rules`
- `e2e/support/emulator-fixtures.ts` (exporta `encodeFields`)
- `e2e/unit/m6j-store-hours.spec.ts` (dos expectativas actualizadas por cambios aditivos aprobados)
- Documentación: `roadmap/phase-log.md`, `docs/architecture/store-operation-contract.md`, `contracts/financial-events.md`

`apps/functions/lib` y `packages/shared/lib` no están versionados; el build no deja cambios en Git.

## Contratos afectados

- **Pedido:** campos aditivos `paymentConfirmation`, `lastPaymentReversal`. `paymentStatus` pasa a usarse (`pending` / `paid`).
- **Colección nueva:** `tenants/{t}/paymentEvents`.
- **Campo nuevo:** `orderCounters/{D}.payments`.
- **`getCashCloseSummary`:** agrega `summarySource` y `ledger`; para días cerrados, `summary` es el snapshot.
- **`closeCashSession`:** agrega `summaryVersion`, `systemConfirmedTransfers`, `ledgerCounter`, `collectionDifference` y los errores `CASH_CLOSE_INCONSISTENT` y `PAYMENT_EVENTS_LIMIT`.
- **`CashCloseBlocker.code`:** agrega `UNCONFIRMED_TRANSFERS`.
- **`contracts/financial-events.md`:** R3 actualizado (`paymentStatus` ya no es un campo muerto).

## Matriz de QA v2.1 — resultado

| # | Caso | Prueba | Resultado |
|---|---|---|---|
| 1 | Confirmar `queued`: 201, `paid`, `status` intacto, evento y contador | API `confirmar antes de la entrega` | ✅ |
| 2 | Entregada cuenta en entregadas y en cobros, sin sumarse | Unit `resumen de caja v2` | ✅ |
| 3 | Misma clave y payload → 200 replayed, 0 eventos nuevos | API `ciclo completo` | ✅ |
| 4 | Misma clave, otro payload → `IDEMPOTENCY_KEY_REUSED` | API `ciclo completo` | ✅ |
| 5 | Clave nueva con el pedido `paid` → `PAYMENT_ALREADY_CONFIRMED` | API `ciclo completo` | ✅ |
| 6 | Confirmar → revertir → clave antigua: replay, `confirmationActive: false`, `pending` | API `ciclo completo` | ✅ |
| 7 | Reconfirmar con clave nueva; neto = total | API `ciclo completo` | ✅ |
| 8 | Reversión con id viejo → `STALE_CONFIRMATION` | API `ciclo completo` | ✅ |
| 9–10 | Concurrencia: confirmaciones + reversión + cierre (×30) | API `fin-01-concurrency` | ✅ |
| 11 | Concurrencia: `createPosSale` + cierre (×10) | API `fin-01-concurrency` | ✅ |
| 12 | Contador manipulado → `CASH_CLOSE_INCONSISTENT`, 0 escrituras | API `cierre de caja v2` | ✅ |
| 13 | D−1 cerrada confirmada en D: `late`, snapshot idéntico | API `confirmación tardía` | ✅ |
| 14 | Caja de la jornada efectiva cerrada → `CASH_DAY_CLOSED` | API `cierre de caja v2` | ✅ |
| 15 | Reversión en D de una confirmación de D−1 | API `confirmación tardía` | ✅ |
| 16 | Corte 04:59/05:00 local y días con cambio de horario | Unit `jornada efectiva` | ✅ |
| 17 | Confirmar y cancelar con la caja abierta → `cancelledPaidTransfers` | API | ✅ |
| 18 | Cancelar un pedido pagado de una jornada cerrada → 409 | API | ✅ |
| 19 | Pedido `cancelled`, `cash`, `pending` o `card` → 409 | API | ✅ |
| 20 | `AMOUNT_MISMATCH` sin escrituras (eventos, pedido y contador iguales) | API | ✅ |
| 21 | Owner de B sobre A: 403 en Functions y en reglas (incluye pedido inexistente) | API `fin-01-authz` | ✅ |
| 22 | Membresía revocada (REST + listener abierto → `permission-denied`) | API `fin-01-authz` | ✅ |
| 23 | Rol no reconocido → 403 en ambas capas | API `fin-01-authz` | ✅ (antes 500) |
| 24 | Escritura directa del cliente en el libro, `paymentStatus` o el contador (y borrado de evento) | API `fin-01-authz` | ✅ |
| 25 | Paridad de roles entre reglas y matriz de TypeScript | Unit | ✅ |
| 26 | Cierre con transferencias sin confirmar: 409; con override → auditado con `orderIds` | API `cierre de caja v2` | ✅ |
| 27 | Día cerrado → snapshot (`summarySource: "snapshot"`) | API `confirmación tardía` | ✅ |
| 28 | 501 eventos → `PAYMENT_EVENTS_LIMIT`; resumen incompleto | API + Unit | ✅ |
| 29 | Invariantes por pedido, tenant y jornada | Unit (propiedad ×200) + API | ✅ |
| 30 | Métricas y caja con el mismo clasificador (paridad) | Unit | ✅ |
| 31 | Replay de creación tras confirmar → mismo `orderId` | API `FIN-Q02` | ✅ |
| Q01 | Métricas: rango, filtro de canal y bandera de incompletitud | Unit | ✅ |
| Q02 | Contador inexistente creado por la confirmación; correlativo #001/#002 intacto | API `FIN-Q02` (2 casos) | ✅ |

Distribución observada en la concurrencia, corrida final (evidencia de que ambos lados de la carrera ocurren):
- Emulador habitual: confirmaciones `99 contadas / 21 rechazadas con CASH_DAY_CLOSED`, reversiones `27 / 3`, POS `1 / 9`.
- Paquete piloto: `110 / 10`, `29 / 1`, POS `3 / 7`.

En ambas corridas, en las 30 iteraciones: libro = contador = snapshot, y ninguna operación rechazada dejó evento.

## Validación

```bash
npm --workspace packages/shared run build && npm --workspace packages/shared run typecheck   # OK
npm --workspace apps/functions run build                                                      # OK
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit                                  # OK
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit                                    # OK
npm --workspace apps/admin run build && npm --workspace apps/web run build                    # OK
npx playwright test e2e/unit --config=playwright.config.ts                                     # 167/167
# API, emulador habitual y paquete piloto (proyecto demo-amon-ci, sin facturación): 146/146 en cada uno
FIREBASE_PROJECT_ID=demo-amon-ci FUNCTIONS_BASE_URL=http://127.0.0.1:5001/demo-amon-ci/us-central1/ \
  npx firebase-tools@15.34.1 emulators:exec --project demo-amon-ci --only auth,firestore,functions 'npm run test:e2e:api'
node tools/prepare-firebase-pilot.mjs && npm ci --omit=dev --ignore-scripts --prefix .firebase-pilot/functions --workspaces=false
FIREBASE_PROJECT_ID=demo-amon-ci ... emulators:exec --config firebase.pilot.json ... 'npm run test:e2e:api'
# Navegador (regresión POS/web):
... emulators:exec ... 'npm run test:e2e:browser'                                              # 22/22
```

`FIN01_CONCURRENCY_ITERATIONS` ajusta las repeticiones de la prueba de concurrencia (por defecto 30).

## Ronda de auditoría del parche (FIN-A01..A03)

| Hallazgo | Corrección | Pruebas |
|---|---|---|
| **A01 · Neto truncado.** Una suma parcial con reversiones fuera del límite no es un mínimo | Métricas: `net: null` cuando la lectura está incompleta y la tarjeta muestra "Incompleto" sin monto (se eliminó `≥ $X`). Caja: no calcula la diferencia de conciliación sobre un neto truncado ("no conciliable") | Unit: 500 confirmaciones dentro del tope + reversiones fuera (parcial 50.000 > real 0), tarjeta sin `$`/`≥`, diferencia `null`, snapshot v1 sin regresión |
| **A02 · Carga y cambio de tenant o rango** | `useLivePaymentEvents` etiqueta cada resultado con `tenantId\|sinceMs`; `selectCurrentResult` solo entrega la consulta vigente. La tarjeta muestra "…" mientras carga | Unit: sin snapshot no hay $0; cambio de tenant; cambio de rango; secuencia rápida A→B→A con snapshot tardío de B; error de la consulta anterior |
| **A03 · Historial parcial** | `TransferPaymentControl` conserva `complete` y muestra "Historial parcial…" | API: 101 eventos en un pedido dan `complete: false` y 100 eventos; un pedido normal da `complete: true`. Unit: texto del aviso |

**Sin cambios** en las transacciones de pagos ni en la coordinación del cierre: ninguna prueba mostró un defecto en ellas.

**Archivos de esta ronda:**
- Nuevos: `apps/admin/src/lib/payment-presentation.ts`, `e2e/unit/fin-01-audit-fixes.spec.ts`.
- Modificados: `apps/admin/src/hooks/use-live-payment-events.ts`, `apps/admin/src/lib/metrics.ts`, `apps/admin/src/app/metricas/page.tsx`, `apps/admin/src/components/operation/cash-panel.tsx`, `apps/admin/src/components/payments/transfer-payment-control.tsx`, `e2e/api/fin-01-payments.contract.spec.ts`, documentación.

**Validación de la ronda:** unitarias 177/177 · API emulador habitual 147/147 · API paquete piloto 147/147 · navegador 22/22 · builds y typechecks OK. Concurrencia ×30: habitual `107/13`, `29/1`, POS `1/9`; piloto `112/8`, `26/4`, POS `1/9`.

**Límite de las pruebas:** A02 se prueba sobre la lógica pura de selección (`selectCurrentResult`), no renderizando el hook de React con Firestore real.

## QA humano (28-10-2026)

Flujo Web → Admin → Entregado, confirmaciones y reversiones en Pedidos, Métricas y Caja, y POS con transferencia pendiente: favorables.

Los hallazgos están registrados como backlog trazable en [`backlog-fin-01-qa.md`](backlog-fin-01-qa.md):
- **Propuesto para el cierre de FIN-01:** FIN-QA-02 (pagos en la bitácora de Operación).
- **Sprints independientes:** CHECKOUT-PAY-01 (P0), AUDIT-ORDER-01, HIST-01 y SCHED-01.

Decisiones del 28-10-2026:
- **D1:** FIN-QA-02 entra en FIN-01 (implementado, ver abajo).
- **D2:** la transferencia Web sigue habilitada para QA y operación supervisada; CHECKOUT-PAY-01 etapa A es requisito antes del piloto Web público.
- **D3:** auditoría del botón "Cerrar caja" (diagnóstico en el backlog, sin cambios de código).
- **D4:** se registra POS-UX-01.

### FIN-QA-02 — Pagos en la bitácora de Operación

| Aspecto | Implementación |
|---|---|
| Cronología | `buildOperationTimeline` (`apps/admin/src/lib/operation-timeline.ts`) mezcla en memoria `storeEvents` y `paymentEvents`, de lo más reciente a lo más antiguo, sin repetir eventos |
| Autorización | La consulta solo se monta con `payments.view` (`canReadPaymentLedger`, a partir de los permisos que devuelve el servidor); las reglas `canViewPayments` la vuelven a exigir. Sin permiso, la bitácora queda igual que antes |
| Datos | Tipo, pedido (#código), importe con signo, fecha y actor. `reference`, `reason` e `idempotency` no llegan a la bitácora (lista blanca `toTimelinePayment`) |
| Límite | `orderBy(at desc)` + `limit(101)`. Con más de 100 eventos, aviso "Pagos parciales…" y marcador de corte |
| Sin cambios | Backend, transacciones, reglas y snapshots |

**Archivos:**
- Nuevos: `apps/admin/src/lib/operation-timeline.ts`, `apps/admin/src/hooks/use-order-codes.ts`, `e2e/unit/fin-qa-02-operation-timeline.spec.ts`.
- Modificados: `apps/admin/src/hooks/use-live-payment-events.ts` (`useRecentPaymentEvents`), `apps/admin/src/components/operation/audit-log.tsx`, `apps/admin/src/app/operacion/page.tsx`, `e2e/api/fin-01-authz.spec.ts`.

**Pruebas:**
- Unitarias (12): permiso contra la matriz del servidor; sin permiso, error y carga; orden; no duplicación; lista blanca; descarte fail-closed; límite con aviso y marcador.
- API (1): la consulta exacta de la bitácora funciona para admin y da `permission-denied` para el owner de otro tenant y para un rol no reconocido. `listMyMemberships` entrega `payments.view` al admin.

**Validación:** unitarias 189/189 · API emulador habitual 148/148 · API paquete piloto 148/148 · navegador 22/22 · builds y typechecks OK.
- La primera corrida en el emulador habitual tuvo un fallo intermitente en `order-idempotency` ("Transaction lock timeout" del emulador al preparar un fixture). La repetición pasó completa.

**Límite de las pruebas:** la bitácora no tiene prueba de navegador. El componente React se valida por typecheck y build, y su lógica por las pruebas unitarias.

## Correcciones del QA humano (29-10-2026)

GO de implementación correctiva con decisiones D1–D4. Detalle del diagnóstico en [`backlog-fin-01-qa.md`](backlog-fin-01-qa.md).

### Qué cambió

| Ítem | Cambio |
|---|---|
| **FIN-CLOSE-01** (D1) | `closeCashSession` exige `discrepancy {reason (10–280), acknowledged: true, cashDifference, collectionDifference}` cuando `cashDifference ≠ 0` o `collectionDifference ≠ 0`. Sin declaración: 422 `CASH_DIFFERENCE_REASON_REQUIRED`. Si las cifras declaradas no coinciden con las recalculadas: 409 `CASH_CLOSE_DIFFERENCE_STALE` con las cifras reales en `details`. Ningún rechazo escribe. `transferDifference` (operacional) no exige motivo. Se persiste `discrepancy` con actor; el evento `cash_closed` lleva `hasDiscrepancy` y `discrepancyReason` |
| **FIN-CLOSE-02** | El comprobante separa "Conciliación con libro de pagos" (financiera: Cuadra / Faltante / Sobrante) de "Diferencia operacional vs. entregadas" (referencial). Los cierres v1 muestran una sola fila, como se registraron |
| **FIN-DATA-01** | `computeTransferCollections` agrega el bucket `unknownOrigin` para eventos sin `originOperationalDate` válida o con origen futuro (antes se contaban como "confirmados de la jornada"). `net` y la verificación contra el contador no cambian. El seed estampa la jornada operacional (corte 05:00, zona de la tienda) en los pedidos demo |
| **CASH-CLOSE-UX-01** (D3) | El panel lista en `#cash-close-reasons` (con `aria-describedby` y `aria-live`) cada motivo por el que "Cerrar caja" está deshabilitado. Botón "Usar monto del libro" que solo copia la cifra: el operador debe marcar que la contrastó con el banco. Se persiste `transfersEntryMode: manual \| ledger_suggestion` y `ledgerSuggestion {suggestedAmount, bankVerified, actor}`. Sugerencia desactualizada: 409 `CASH_CLOSE_LEDGER_SUGGESTION_STALE` |
| **UX menores** (D4) | Campos CLP con unidad y eco formateado; separadores con tokens `--ops-divider` / `--metric-divider`; ayuda de Métricas como botón accesible con `role="tooltip"`; "Referencia bancaria (opcional)" con aviso de no ingresar datos personales |
| **Snapshots** (D2) | `summaryVersion` sigue en 2. Solo se agregan campos opcionales; los cierres v1/v2 históricos se leen sin cambios y no se reescriben |
| **Aislamiento de pruebas** | Proyectos Playwright `contracts` y `fin-h01-isolated`. `test:e2e:api` corre en dos fases (`--project=contracts`, luego `--project=fin-h01-isolated --no-deps`), porque un filtro de ruta no se aplica a dependencias y la versión de una sola fase ejecutaba también las unitarias |

**Backlog (sin implementar):** CASH-COUNT-01 (calculadora de arqueo) y PAGE-01 (paginación de eventos sobre 500).

### Archivos

- **Nuevos:**
  - `apps/functions/src/schemas/cash-close.schema.ts`
  - `apps/admin/src/lib/cash-close-presentation.ts`
  - `packages/shared/src/seed-orders.ts`
  - `e2e/unit/fin-01-corrections.spec.ts`
  - `e2e/api/fin-01-corrections.contract.spec.ts`
- **Modificados:**
  - Backend: `apps/functions/src/lib/{payment-ledger,cash-close}.ts`, `apps/functions/src/services/cash-close.service.ts`, `apps/functions/src/routes/store.ts`
  - Admin: `apps/admin/src/lib/{payment-ledger,api/store}.ts`, `apps/admin/src/components/operation/cash-panel.tsx`, `apps/admin/src/components/payments/transfer-payment-control.tsx`, `apps/admin/src/app/metricas/page.tsx`, `apps/admin/src/app/globals.css`
  - Shared: `packages/shared/src/seed.ts`
  - Pruebas: `e2e/api/{fin-01-concurrency,m6j-store-operation.contract}.spec.ts`, `e2e/support/fin-01-fixtures.ts`, `e2e/unit/fin-01-ledger.spec.ts`, `playwright.config.ts`, `package.json` (script `test:e2e:api`)
  - Docs: `docs/architecture/{payment-confirmation,store-operation}-contract.md`, `roadmap/backlog-fin-01-qa.md`, este archivo y `roadmap/phase-log.md`

### Contratos afectados

- `closeCashSession` (body y códigos 409/422 nuevos, orden de validación). Ver `docs/architecture/store-operation-contract.md`.
- `transferCollections.unknownOrigin` y la separación operacional/financiera. Ver `docs/architecture/payment-confirmation-contract.md`.
- Sin cambios en Firestore rules, índices, FIN-H01 (lectura de `orderCounters/{D}` en la transacción), FIN-H02 ni COST-GUARD.

### Pruebas nuevas

- **Unitarias (18):**
  - `unknownOrigin` y paridad entre functions y admin.
  - Fecha operacional del seed.
  - `evaluateDiscrepancy` y schema de entrada.
  - Filas y etiquetas v1/v2.
  - `cashCloseReadiness`.
- **API (8):**
  - Cierre sin diferencias.
  - 422 sin motivo, más cierre justificado con evento auditado.
  - Replay idempotente.
  - Cierres concurrentes.
  - Sugerencia del libro, y 409 cuando la sugerencia está desactualizada.
  - Evento legado sin origen, que va a `unknownOrigin`.
  - Lectura de snapshot v1.
- **Contrato m6j:** el override ahora recorre 422, luego 409 stale, luego 201 con la discrepancia persistida.
- **Carrera FIN-H01:** cada vez que el servidor rechaza la declaración (409/422), se vuelve a declarar con sus cifras, hasta 3 veces, y se verifica que no exista cierre parcial.

### Finalization gate (29-10-2026, Windows, `demo-amon-ci`, firebase-tools 15.34.1)

| Capa | Comando | Resultado |
|---|---|---|
| Builds y typechecks | `packages/shared` build y typecheck, `apps/functions` build, `tsc --noEmit` de admin y web, `next build` de web y admin | PASS (7/7) |
| Unitarias | `playwright test e2e/unit` | 207/207 |
| Paquete piloto | Gate de `qa.yml`: guard 5/5, `prepare-firebase-pilot`, `npm ci`, Zod 4.6.7, 19 exports | PASS |
| API, emulador habitual | `emulators:exec --config firebase.json … 'npm run test:e2e:api && npm run test:e2e:browser'` | `contracts` 154/154 · `fin-h01-isolated` 2/2 |
| Navegador | (misma corrida) | 22/22 |
| API, paquete piloto | `emulators:exec --config firebase.pilot.json … 'npm run test:e2e:api'` | `contracts` 154/154 · `fin-h01-isolated` 2/2 |

- **Sin señales de falla:** en ninguna corrida hubo 500, `ECONNRESET`, `Transaction is invalid`, `INVALID_ARGUMENT` ni `lock timeout`. Las únicas líneas `ERROR:` son pruebas negativas (membresía malformada y libro inconsistente). Localmente `retries: 0`.
- **Resultados de la carrera FIN-H01:**

  | Corrida | Confirmaciones contadas / rechazadas | Reversiones contadas / rechazadas | Cierres redeclarados | POS contadas / rechazadas |
  |---|---|---|---|---|
  | Habitual | 116 / 4 | 29 / 1 | 33 | 1 / 9 |
  | Piloto | 120 / 0 | 30 / 0 | 33 | 2 / 8 |

  En la habitual el cierre ganó parte de la carrera.
- **Preflight y postflight** con los scripts de `amon-emulator-verification` (main `1eef1f7`):
  - Preflight limpio antes de cada corrida.
  - Tras cada corrida quedó huérfano el emulador de Firestore: PID 9736 en la habitual y PID 20612 en la piloto.
  - El 9736 ya no existía al reinspeccionarlo con autorización, así que no hubo que detenerlo.
  - El 20612 tampoco existía cuando se autorizó su limpieza. No se ejecutó `cleanup-authorized.ps1`, y el postflight final quedó limpio y sin procesos `java.exe`.

### Correcciones finales de la auditoría cruzada (FIN-R04, FIN-R05)

| Ítem | Cambio |
|---|---|
| **FIN-R04** | En las dos copias de `payment-ledger.ts`, `isOperationalDate()` exige el formato YYYY-MM-DD y además un día real del calendario: rechaza 2026-02-30, 2026-13-45 y 2026-02-29, y acepta 2024-02-29. El helper queda exportado para probarlo. Una fecha imposible va a `unknownOrigin`; el neto, el conteo y la verificación contra el contador (FIN-H01) no cambian |
| **FIN-R05** | La ayuda (ⓘ) de Métricas pasa a `components/metrics/metric-help.tsx`, con su estado en `lib/metric-help.ts` (`open` y `dismissed`). El CSS reemplaza `:focus-within` por `.metric-help-button:focus-visible + .metric-help-tip`, y el hover y el foco no aplican con `data-dismissed`. Así, Escape oculta la ayuda aunque el foco o el puntero sigan encima. El segundo toque la cierra aunque el hover haya quedado pegado; salir con el puntero o con el foco la restablece |

- **Archivos nuevos:**
  - `apps/admin/src/lib/metric-help.ts`
  - `apps/admin/src/components/metrics/metric-help.tsx`
  - `e2e/browser/harness/metric-help-entry.tsx`
  - `e2e/browser/fin-r05-metric-help.spec.ts`
- **Archivos modificados:**
  - Las dos copias de `payment-ledger.ts`
  - `apps/admin/src/app/metricas/page.tsx` (usa `MetricHelp`)
  - `apps/admin/src/app/globals.css`
  - `e2e/unit/fin-01-corrections.spec.ts`
  - `e2e/browser/harness/{build,page}.ts`, con el nuevo tipo `metric-help`: componente y CSS reales del admin, sin emuladores
- **Pruebas:**
  - **FIN-R04, unitarias (3):**
    - Fechas válidas, incluidos los bisiestos 2024 y 2000.
    - Fechas imposibles (02-30, 13-45, 04-31, 1900-02-29), mal formadas, null, undefined y número.
    - Clasificación con una fecha imposible, null o futura: va a `unknownOrigin` con el neto intacto y paridad entre Functions y Admin.
  - **FIN-R05, unitarias (3):** las secuencias del reducer.
  - **FIN-R05, en Chromium (3):**
    - Teclado: Tab muestra, Escape oculta con el foco puesto, Enter o Espacio reabren, Tab sale y Shift+Tab vuelve.
    - Hover: entrar y salir; Escape oculta con el puntero encima.
    - Toque: abrir, cerrar, reabrir y tocar fuera.
  - **Control negativo:** con la regla CSS anterior, la prueba de teclado falla en "Escape oculta" (sigue visible). Se restauró el archivo y se verificó por hash.
- **Validación:**
  - Unitarias: 213/213.
  - FIN-R05 en navegador: 3/3. El `--list` del navegador da 25 = 22 + 3.
  - Build de Functions, typecheck de Admin y `next build` de Admin: OK.
- **No se repitieron** los contratos API, las carreras FIN-H01 ni las 22 pruebas de navegador anteriores. FIN-R04 no altera ningún neto ni conteo, y el cambio al harness no modifica los entries `web` ni `pos`. La evidencia del gate sigue vigente.

## Riesgos residuales

- **El emulador no es producción.** La serialización depende de un choque de lectura y escritura sobre `orderCounters/{D}`, una garantía documentada de Firestore que no depende de bloqueos de rango. Aun así, la prueba de concurrencia solo ejercita el emulador.
- **Punto de contención por jornada.** `orderCounters/{D}` recibe creación de pedidos, confirmaciones y reversiones. A la escala del piloto (decenas por día) no debería notarse.
- **Más de 500 eventos de pago en una jornada bloquea el cierre** (`PAYMENT_EVENTS_LIMIT`). Falla cerrado; requeriría paginar en una versión futura.
- **Reembolsos fuera de alcance.** Los pedidos cancelados con pago confirmado quedan como "reembolso por revisar" sin flujo para resolverlos (FIN-02).
- **Saldar un `pending`** (cambiar el método) sigue fuera de alcance; esos días siguen necesitando override.
- **Métricas no filtra cobros por canal**, porque los eventos no tienen canal: con filtro de canal muestra "No aplica".
- **`updateOrderStatus` sigue sin registrar actor** (hallazgo de la Fase A, fuera de este sprint).
- **Pedidos de jornadas cerradas reciben escrituras en la proyección de pago** al confirmarse tarde. Es una excepción explícita: `status` y `totals` siguen bloqueados y el snapshot de caja no cambia.
- **Firestore rules todavía nombran `cashCloseSessions` y `auditEvents`**, colecciones que no existen. Es un desfase documental previo, no corregido en este sprint.
- **`roadmap/phase-log.md` versionado empieza con dos líneas de salida de herramienta pegadas** ("Warning: truncated output…"). Es previo a este sprint y no se modificó.
- **En Windows, `emulators:exec` deja huérfano el proceso Java del emulador de Firestore** (puertos 8080/9150) al terminar. Se reprodujo en cada corrida local del 29-10-2026. Se registra con el pre y postflight de `amon-emulator-verification` y solo se detiene por PID con autorización. En CI (Linux) no se ha observado.
- **500 `Transaction is invalid or closed` del emulador** cuando la carrera FIN-H01 compartía el emulador con otros archivos en paralelo. También lo reproduce el backend baseline. Mitigado aislando la carrera; la causa raíz sigue abierta (ticket aparte, toca FIN-H01).
- **La rama "el cierre gana la carrera" depende del azar del scheduler.** No se fuerza; `CASH_DAY_CLOSED` está cubierto por contratos deterministas.
- **El motivo de la discrepancia es texto libre** (10–280). Puede contener datos personales si el operador los escribe; el panel no lo filtra.
- **Un ECONNRESET aislado** en la carrera POS (sesión del 29-10, emulador compartido), sin repetir ni investigar.

## Pendientes registrados (28-10-2026)

- **QA visual de FIN-QA-02:** revisar en navegador la bitácora de Operación (intercalado, aviso de pagos parciales, rol sin `payments.view`).
- **CASH-CLOSE-UX-01:** implementado el 29-10-2026 (ver correcciones). Falta QA visual humano.
- **CHECKOUT-PAY-01 etapa A:** requisito antes del piloto Web público (D2).
- **Fallo intermitente `Transaction lock timeout`:** lo dio el emulador de Firestore en un fixture de `order-idempotency` cuando corría en paralelo con `fin-01-concurrency`. La repetición pasó. Desde el 29-10-2026 la suite de concurrencia corre aislada en el proyecto `fin-h01-isolated`.

## Siguiente paso

Revisión cruzada del diff y aprobación humana. Después: commit, PR y CI (QA, API contracts habitual y piloto, navegador). Más adelante: FIN-02 (reembolsos y saldar `pending`) y auditoría de actor en `updateOrderStatus`.
