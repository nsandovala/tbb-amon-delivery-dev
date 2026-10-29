# Contrato de confirmación de transferencias — FIN-01 v2.1

**Estado:** implementado en `feat/fin-01-transfer-confirmation`, pendiente de revisión cruzada.
**Alcance:** confirmar y revertir, una por una y con auditoría, transferencias de pedidos web y POS. Integrarlo con Operación (caja), Métricas, Pedidos y POS.
**Fuera de alcance:** reembolsos, pasarelas o bancos reales, pagos parciales, FIN-02, Flow, emisión al ERP.

## 1. Ejes independientes

| Eje | Campo | Valores | Quién lo cambia |
|---|---|---|---|
| Operacional | `status` | `queued` … `delivered`, `cancelled` | `updateOrderStatus` (sin cambios) |
| Pago | `paymentStatus` | `pending` \| `paid` (`refunded` queda reservado para FIN-02) | Solo `confirmTransferPayment` y `revertTransferConfirmation` |

- Elegir `paymentMethod: "transfer"` **no** confirma el abono.
- Una transferencia se puede confirmar en cualquier estado salvo `cancelled`, también antes de la entrega.
- Cancelar un pedido `paid` está permitido mientras la caja de su jornada esté abierta. El pago sigue `paid` y el pedido aparece como **reembolso por revisar** (`cancelledPaidTransfers`). Nunca suma como venta.
- La regla de cancelación tras el cierre no cambia: `updateOrderStatus` sigue bloqueado por `assertCashCloseOpen(order.operationalDate)`.

### Tres medidas que nunca se suman entre sí

| Medida | Regla | Fecha a la que se imputa |
|---|---|---|
| Ventas registradas | `status ≠ cancelled` | `createdAt` / `operationalDate` del pedido |
| Ventas entregadas | `status = delivered` | `operationalDate` del pedido |
| Cobros confirmados (transferencia) | Σ neta de `paymentEvents` | `effectiveOperationalDate` del evento |

El efectivo se considera cobrado al entregarse; no tiene libro.

La clasificación pura vive en `apps/functions/src/lib/payment-ledger.ts`. El admin usa un espejo en `apps/admin/src/lib/payment-ledger.ts`, porque Functions compila a CommonJS y no puede importar `@amon/shared` en runtime. La prueba de paridad `e2e/unit/fin-01-ledger.spec.ts` falla si las dos copias divergen.

## 2. Modelo de datos

### Proyección en el pedido `tenants/{t}/orders/{id}`

```ts
paymentStatus: "pending" | "paid";
paymentConfirmation: {
  eventId: string;                 // confirmationEventId vigente (necesario para revertir)
  amount: number;                  // == totals.total
  confirmedAt: Timestamp;
  effectiveOperationalDate: string;
} | null;
lastPaymentReversal?: { eventId, reversesEventId, revertedAt, effectiveOperationalDate };
```

La proyección es mínima: no lleva actor, email ni referencia. Los pedidos los lee cualquier miembro activo.

### Libro `tenants/{t}/paymentEvents/{eventId}` (append-only)

```ts
{
  id, tenantId, orderId,
  type: "transfer_confirmed" | "transfer_confirmation_reverted",
  method: "transfer",
  signedAmount,                    // +total al confirmar, −total al revertir
  actor: { uid, email, role },
  at, atLocal,
  effectiveOperationalDate,        // jornada a la que se imputa el cobro
  originOperationalDate,           // jornada del pedido
  reference | null,                // ≤40 caracteres; nunca cuenta ni RUT
  reason | null,                   // obligatorio al revertir
  reversesEventId | null,
  idempotency: { version: 1, fingerprint }
}
```

- `eventId = base62(SHA-256("amon-payment-event:v1" ‖ tenantId ‖ orderId ‖ acción ‖ clave))[0..20]`. La clave nunca se guarda en claro.
- Se crea con `tx.create` y nunca se edita ni se borra.

### Contador de jornada `tenants/{t}/orderCounters/{D}.payments`

```ts
payments: { transferEventCount: number; transferNet: number }
```

- Se actualiza con `set merge` + `FieldValue.increment`. Si el documento no existe, se crea, y nunca se toca `lastDisplayOrderNumber` (FIN-Q02).
- `createOrder` usa `set merge` sobre el mismo documento y conserva `payments`.

## 3. Jornada efectiva

`effectiveOperationalDate` se calcula así, dentro de la transacción:
- Se lee `settings/storeHours` y se toma su `timezone` (validado; si falta, `America/Santiago`).
- Se aplica `getOperationalDateFor(now, timezone, STORE_OPERATIONAL_CUTOFF_HOUR = 5)`.
- `now` se captura una sola vez en el servidor. Nunca se usa la fecha UTC ni la del cliente.

Una confirmación o reversión exige que `cashCloses/{E}` **no exista**. Si existe → `409 CASH_DAY_CLOSED`, y la operación se registra en la jornada siguiente.

**Origen desconocido (FIN-DATA-01):** si el pedido no tiene `operationalDate` (pedidos legacy o fixtures antiguos), el evento se graba con `originOperationalDate: null`: no se inventa ninguna fecha. Al agregar, `summarizeTransferCollections` clasifica en `unknownOrigin` todo origen nulo, ausente, con formato inválido, que no sea un día real del calendario (por ejemplo `2026-02-30`, FIN-R04) o posterior a D; `confirmed` exige `origin === D` y `late` exige `origin < D`. `net`, `eventCount` y el contador no cambian, así que FIN-H01 se mantiene igual.

**Confirmación tardía:** un pedido de D−1 (con la caja cerrada) que se confirma en D se imputa a D, en el bucket `late`. El snapshot `cashCloses/{D−1}` no se modifica, y `getCashCloseSummary` devuelve ese snapshot para cualquier día cerrado (`summarySource: "snapshot"`). Una reversión en D de una confirmación imputada a D−1 genera un evento negativo en D.

## 4. API

Todas las rutas exigen `tenantId` explícito y Firebase ID token. La autorización ocurre **antes** de leer Firestore: un no autorizado recibe 403 sin distinguir si el pedido existe o no.

### `POST /confirmTransferPayment` — permiso `payments.confirm_transfer`

Body: `{ tenantId, orderId, expectedAmount, reference?, idempotencyKey }` (cuerpo de 2 KB como máximo).

| Caso | HTTP | Código |
|---|---|---|
| Confirmada | 201 | `{ replayed: false, eventId, action, orderId, amount, effectiveOperationalDate, currentPaymentStatus: "paid", activeConfirmationEventId, confirmationActive: true }` |
| Misma clave, mismo payload | 200 | `replayed: true` con el **estado actual**: `confirmationActive`, `currentPaymentStatus`, `activeConfirmationEventId` |
| Misma clave, otro payload | 409 | `IDEMPOTENCY_KEY_REUSED` |
| Clave nueva con el pedido ya `paid` | 409 | `PAYMENT_ALREADY_CONFIRMED` |
| Método distinto de `transfer` | 409 | `PAYMENT_METHOD_NOT_TRANSFER` |
| Pedido `cancelled` | 409 | `ORDER_CANCELLED` |
| `expectedAmount ≠ totals.total` | 409 | `AMOUNT_MISMATCH` (sin escrituras) |
| Caja de la jornada efectiva cerrada | 409 | `CASH_DAY_CLOSED` |
| Pedido inexistente | 404 | `NOT_FOUND` |

### `POST /revertTransferConfirmation` — permiso `payments.confirm_transfer`

Body: `{ tenantId, orderId, expectedConfirmationEventId, reason (5–280), idempotencyKey }`.

**Es una corrección contable** (el abono no existe o no corresponde), **no un reembolso**: no devuelve dinero ni cambia `status`.

Errores 409: `PAYMENT_NOT_CONFIRMED`, `STALE_CONFIRMATION` (el `expectedConfirmationEventId` no es la confirmación vigente), `CASH_DAY_CLOSED`, `IDEMPOTENCY_KEY_REUSED`, `PAYMENT_METHOD_NOT_TRANSFER`.

### `GET /listPaymentEvents?tenantId&orderId|operationalDate` — permiso `payments.view`

- Devuelve `{ events, complete }`: como máximo 100 eventos, ordenados por `at`, sin `idempotency`.
- `complete: false` si hubo más eventos que el tope.

### Clave antigua después de revertir

Como el `eventId` deriva de la acción y la clave, reenviar la clave de una confirmación ya revertida lee **ese mismo evento** y responde `200 replayed` con `confirmationActive: false` y `currentPaymentStatus: "pending"`. Nunca vuelve a confirmar. Para reconfirmar hace falta una clave nueva.

## 5. Permisos y reglas (FIN-H02)

- `permissions.ts`: `payments.view` y `payments.confirm_transfer`, para owner y admin.
- `firestore.rules`: `canViewPayments(t)` = membresía `active` y `role in ['owner','admin']`.
  - `paymentEvents`: `read` solo con `canViewPayments`; `write: false`.
  - `orderCounters` sigue bajo el deny global.
- Una prueba de paridad exige que la lista de roles de las reglas coincida con los roles que la matriz de TypeScript asocia a `payments.view`.
- Una membresía con rol o estado no reconocido se trata como **sin membresía** (403 uniforme y log de error). Antes respondía 500.

## 6. Cierre de caja (summaryVersion 2, aditivo)

| Campo | Significado |
|---|---|
| `transferSales` / `expectedTransfers` | **Sin cambios**: transferencias entregadas, confirmadas o no |
| `transferConfirmedSales` / `transferUnconfirmedSales` | Entregadas de la jornada, según `paymentStatus` |
| `cancelledPaidTransfers` | Reembolso por revisar; no es ingreso |
| `transferCollections` | `{ confirmed, late, unknownOrigin?, reverted, net, eventCount, complete }` del libro, para la jornada efectiva D. `unknownOrigin` es opcional: los snapshots anteriores no lo traen y la UI lo trata como "no informado" |
| Blocker `UNCONFIRMED_TRANSFERS` | Transferencias de D ni canceladas ni pagadas. Se puede saltar con override y motivo; el override guarda `orderIds` |
| `collectionDifference` | `transfersConfirmed` (lo declarado por el operador desde el banco) − `transferCollections.net`. Es la **conciliación financiera**: si es ≠ 0 exige motivo (FIN-CLOSE-01) |
| `transferDifference` | `transfersConfirmed` − `expectedTransfers` (ventas entregadas). Es una **diferencia operacional**: incluye pagos de pedidos no entregados, tardíos o de origen desconocido. No exige motivo y la UI no la rotula Faltante/Sobrante (FIN-CLOSE-02) |
| `transfersEntryMode`, `ledgerSuggestion` | D3: `manual` o `ledger_suggestion`. La sugerencia copia el neto del libro solo si el operador declara `bankVerified: true`. El servidor exige que siga siendo el neto vigente; si no, responde `409 CASH_CLOSE_LEDGER_SUGGESTION_STALE` con el neto real. El libro nunca reemplaza la verificación bancaria |
| `systemConfirmedTransfers`, `ledgerCounter`, `summaryVersion` | Se guardan en `cashCloses/{D}` |

### Atomicidad (FIN-H01)

**`closeCashSession` lee `orderCounters/{D}` dentro de su transacción.** Confirmar y revertir escriben ese documento cuando su jornada efectiva es D. Esto produce un choque directo de lectura contra escritura sobre un documento conocido, que serializa las tres operaciones sin depender de bloqueos de rango sobre la consulta de eventos.

Además, el cierre verifica el libro antes de escribir:
- Si la consulta de eventos de D (`limit 501`) supera 500 → `409 PAYMENT_EVENTS_LIMIT` (FIN-Q01, falla cerrado).
- Si la cantidad o el neto de los eventos no coinciden con el contador → `409 CASH_CLOSE_INCONSISTENT`, sin escrituras.

`createOrder` también escribe `orderCounters/{D}`, así que una venta concurrente con el cierre queda en el snapshot o recibe 409.

## 7. Integridad y truncamiento (FIN-Q01)

- **Cierre:** nunca cierra con un libro truncado.
- **Resumen en vivo:** marca `transferCollections.complete = false` y `ledger.consistent = false`. El panel muestra "Incompleto", no un importe.
- **Métricas:** el listener pide `500 + 1` eventos; si llegan más, la tarjeta muestra **"Incompleto" sin ningún monto**. Con un filtro de canal muestra "No aplica", porque los eventos no tienen canal.
- **Auditoría FIN-A01:** un neto calculado sobre una lectura truncada no es total ni mínimo, porque pueden faltar reversiones negativas. Por eso:
  - `getTransferCollectionsInRange` devuelve `net: null` cuando la lectura está incompleta.
  - `reconcilableNet` y `transferReconciliationDifference` (`apps/admin/src/lib/payment-presentation.ts`) impiden mostrar o conciliar sobre ese neto. El panel de caja muestra "no conciliable (libro de pagos incompleto)".
  - La API de resumen sigue entregando el valor parcial, siempre junto a `complete: false`: los consumidores deben usar `reconcilableNet`.
- **Auditoría FIN-A02:** cada resultado del listener queda etiquetado con su consulta (`tenantId|sinceMs`). Tras un cambio de tenant o de rango, la tarjeta muestra "cargando" hasta que llega el snapshot de la consulta vigente: nunca cifras anteriores ni un $0 prematuro.
- **Auditoría FIN-A03:** el historial de `listPaymentEvents` conserva `complete`. Si es `false`, el detalle del pedido avisa "Historial parcial…". No se agregó paginación general.
- **QA FIN-QA-02 (bitácora de Operación):**
  - La bitácora intercala los `storeEvents` (últimos 25, vía `getStoreControl`) con los `paymentEvents` más recientes. La mezcla ocurre solo en el cliente (`apps/admin/src/lib/operation-timeline.ts`): nada se copia a `storeEvents`.
  - La consulta (`useRecentPaymentEvents`: `orderBy(at desc)` + `limit(100 + 1)`) se monta solo si la membresía que devuelve el servidor incluye `payments.view`. Las reglas `canViewPayments` la vuelven a exigir.
  - De cada evento se toman solo tipo, pedido, importe con signo, fecha y actor. `reference`, `reason` e `idempotency` no llegan a la bitácora. El código humano del pedido se lee del pedido, solo para las filas visibles.
  - Si hay más de 100 eventos, la bitácora avisa "Pagos parciales…" y marca desde qué hora no incluye pagos.
  - No cambian transacciones, reglas de escritura ni snapshots.

**Invariantes:**
- Por pedido: Σ `signedAmount` ∈ {0, `totals.total`}.
- Por tenant: Σ `signedAmount` de los eventos = Σ `totals.total` de los pedidos con `paymentMethod = transfer` y `paymentStatus = paid`.
- Por jornada: Σ de los eventos con `effective = D` = `orderCounters/{D}.payments.transferNet`.

## 8. Costo en Firestore

| Operación | Lecturas | Escrituras |
|---|---|---|
| Confirmar o revertir | 6: tenant, membresía, evento, pedido, `storeHours`, `cashCloses/{E}` | 3: evento, pedido, contador |
| Replay | 4: tenant, membresía, evento, pedido | 0 |
| Resumen o cierre de caja | Lo actual + 1 (contador) + n eventos de D (≤501) | Sin cambios |
| `listPaymentEvents` | 2 + n (≤101) | 0 |
| Métricas | n eventos del período (≤501) + 1 por evento nuevo | 0 |
| Bitácora de Operación (FIN-QA-02) | n eventos recientes (≤101) + 1 por evento nuevo + 1 por pedido visible sin código en caché | 0 |

Todas las consultas usan un solo campo: no se agregan índices compuestos.

## 9. Compatibilidad histórica

- No hay migración ni backfill. Los pedidos de transferencia previos quedan `paymentStatus: "pending"`, que es el valor que siempre tuvieron.
- Los días cerrados se informan desde su snapshot v1 (sin los campos nuevos, que la UI trata como opcionales).
- Correcciones QA (29-10-2026): `summaryVersion` se mantiene en **2** porque FIN-01 no se había integrado ni desplegado (D2). `discrepancy`, `transfersEntryMode`, `ledgerSuggestion` y `transferCollections.unknownOrigin` son campos opcionales y aditivos. Los snapshots v1 y v2 anteriores se leen sin modificarse.
- ORDER-IDEMPOTENCY no se ve afectado: la huella de creación no incluye campos de pago, y un replay de creación después de confirmar devuelve el mismo `orderId`.
- COST-GUARD no se ve afectado: las rutas nuevas heredan las opciones globales, usan cuerpos de 2 KB y autorizan antes de leer.
