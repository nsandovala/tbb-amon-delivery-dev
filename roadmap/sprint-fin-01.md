# FIN-01 — Confirmación individual y auditable de transferencias

## Estado

**IMPLEMENTED — READY FOR REVIEW.**
- Rama `feat/fin-01-transfer-confirmation` sobre `09958d1` (post-#86), trabajada en un worktree aislado (`C:\Dev\tbb-amon-fin-01`).
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
- **En Windows, `emulators:exec` puede dejar huérfano el proceso Java del emulador de Firestore** (puerto 8080). Se detectó y detuvo tras cada corrida local; en CI (Linux) no aplica.

## Pendientes registrados (28-10-2026)

- **QA visual de FIN-QA-02:** revisar en navegador la bitácora de Operación (intercalado, aviso de pagos parciales, rol sin `payments.view`).
- **CASH-CLOSE-UX-01:** corregir el botón "Cerrar caja" según el diagnóstico de `backlog-fin-01-qa.md`. Pendiente de aprobación.
- **CHECKOUT-PAY-01 etapa A:** requisito antes del piloto Web público (D2).
- **Fallo intermitente `Transaction lock timeout`:** lo dio el emulador de Firestore en un fixture de `order-idempotency` cuando corría en paralelo con `fin-01-concurrency`. La repetición pasó; falta revisarlo y evaluar aislar la suite de concurrencia en CI.

## Siguiente paso

Revisión cruzada del diff y aprobación humana. Después: commit, PR y CI (QA, API contracts habitual y piloto, navegador). Más adelante: FIN-02 (reembolsos y saldar `pending`) y auditoría de actor en `updateOrderStatus`.
