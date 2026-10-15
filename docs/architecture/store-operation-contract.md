# Store Operation & Cash Close Contract (M6J)

## Resumen

AMON Shop controla cuándo TBB acepta pedidos nuevos (horario editable + override manual auditado) y registra el cierre financiero de caja por día operacional. El backend es la única fuente de enforcement y es **fail-closed**: si el horario falta, es inválido o no se puede evaluar, `createOrder` y `createPosSale` rechazan.

Cierre de tienda ≠ cierre de caja:

- **Cerrar tienda**: bloquea pedidos nuevos. No cuenta dinero, no cancela pedidos, no toca la máquina de estados.
- **Cerrar caja**: registra el arqueo inmutable de un día operacional. Si es el día en curso, la jornada queda `closed` y no se reabre hasta el próximo día operacional.

## Diagrama textual

```text
Storefront / POS
  -> POST createOrder | createPosSale
  -> service: valida payload, calcula totales
  -> createOrder() repo: runTransaction
       -> lee orderCounters/{operationalDate}
       -> guard: assertStoreAcceptingOrders(tx, capturedNow)
            ← usa el mismo instante para operationalDate y estado de tienda
            -> evaluateStoreStatus()  (lib/store-hours.ts, puro)
            -> !acceptingOrders → 409 STORE_CLOSED (nada se escribe)
       -> escribe counter + order

Admin /operacion (token Firebase con claim admin)
  -> setStoreOperation | updateStoreHours | closeCashSession
  -> transacción: evalúa estado previo, escribe override/config/cierre + storeEvents (append-only)

Lectura pública
  -> GET getStoreStatus → estado seguro (sin actor ni motivo)
     y registra transiciones de horario observadas (source "schedule")
```

## Paths Firestore (nuevos)

| Path | Contenido | Escritura |
|---|---|---|
| `tenants/{tenantId}/settings/storeHours` | Horario editable | `updateStoreHours`, seed (solo si no existe) |
| `tenants/{tenantId}/settings/storeOperation` | `override` vigente + `lastObservedState` | Functions |
| `tenants/{tenantId}/storeEvents/{eventId}` | Auditoría append-only (`tx.create`) | Functions |
| `tenants/{tenantId}/cashCloses/{operationalDate}` | Cierre de caja inmutable (`tx.create`) | `closeCashSession` |

`firestore.rules` **no cambió**: `settings` sigue legible solo por admin; `storeEvents` y `cashCloses` quedan bajo el deny global y se leen únicamente vía Functions admin. Los documentos de `orders` no cambian.

### `settings/storeHours`

```ts
{
  timezone: "America/Santiago",          // IANA válida
  closingWarningMinutes: 15,              // 0..120, ventana "closing"
  days: {
    monday:    { enabled: true, open: "17:30", close: "22:30" },
    // ... sunday..saturday, los 7 obligatorios
  },
  schemaVersion: 1,
  updatedAt: Timestamp,
  updatedBy: { uid, email }
}
```

Reglas: `HH:MM` 24h; apertura inclusiva, cierre exclusivo; `close > open` (no se admiten ventanas que crucen medianoche); día deshabilitado = sin atención.

### `settings/storeOperation.override`

```ts
{ mode: "open" | "closed", operationalDate: "YYYY-MM-DD", reason, actor: { uid, email }, at: "ISO local" } | null
```

Vale solo para su día operacional (corte 05:00 `America/Santiago`, igual que `displayOrderNumber`). Expira solo: el día siguiente vuelve el horario.

### `storeEvents/{eventId}`

```ts
{
  id, tenantId,
  type: "schedule_transition" | "store_opened" | "store_closed" | "store_reopened"
      | "schedule_resumed" | "hours_updated" | "cash_closed",
  source: "schedule" | "manual",
  actor: { uid, email } | null,     // null en eventos de horario
  reason: string | null,
  previousState, newState,          // StoreState
  reasonCode, operationalDate,
  metadata,                         // hours_updated guarda previousConfig y newConfig
  at: serverTimestamp,
  atLocal: "2026-10-15T19:02:11-03:00"
}
```

Nunca se actualizan ni se borran. Los eventos `schedule` se registran **al observarse** (primera lectura de `getStoreStatus`/`getStoreControl` tras el cambio), no exactamente en el borde horario.

### `cashCloses/{operationalDate}`

```ts
{
  operationalDate, timezone, status: "closed",
  countedCash, transfersConfirmed,          // ingresados por el responsable (CLP enteros)
  expectedCash, expectedTransfers,          // calculados por backend
  cashDifference = countedCash − expectedCash,
  transferDifference = transfersConfirmed − expectedTransfers,
  pendingSales: { count, total },           // NO es dinero recibido
  activeExpenses: { count, total },
  observation, override: { reason, blockers, actor } | null,
  summary,                                  // snapshot completo del cálculo
  closedBy, closedAt, closedAtLocal, idempotencyKey, storeStateBefore
}
```

## Estados operativos

| Estado | Acepta pedidos | Semáforo | Significado |
|---|---|---|---|
| `scheduled_open` | sí | verde | Dentro del horario |
| `closing` | sí | ámbar | Dentro del horario, últimos `closingWarningMinutes` |
| `manual_open` | sí | ámbar | Abierta por admin (dentro o fuera de horario) |
| `scheduled_closed` | no | rojo | Fuera de horario / día sin atención |
| `manual_closed` | no | rojo | Cerrada por admin |
| `closed` | no | rojo | Fail-closed (`CONFIG_MISSING`, `CONFIG_INVALID`, `OVERRIDE_INVALID`, `EVALUATION_ERROR`) o jornada cerrada en caja (`CASH_CLOSED`) |

Precedencia: config inválida/ausente → caja cerrada del día → override manual del día → horario.

## Endpoints

| Función | Método | Auth | Uso |
|---|---|---|---|
| `getStoreStatus?tenantId=` | GET | pública | Estado seguro para storefront/POS/cocina |
| `getStoreControl?tenantId=` | GET | admin | Estado completo, config, `defaultConfig`, últimos 25 eventos |
| `setStoreOperation` | POST | admin | `{ action: "open" \| "close" \| "resume_schedule", reason? }` |
| `updateStoreHours` | POST/PUT | admin | `{ config, reason? }` → 400 si es inválido |
| `getCashCloseSummary?tenantId=&operationalDate=` | GET | admin | Resumen del día (default: día en curso) |
| `closeCashSession` | POST | admin | `{ countedCash, transfersConfirmed, idempotencyKey, operationalDate?, observation?, override?: { reason } }` |

Auth admin: `Authorization: Bearer <Firebase ID token>` con claim `admin: true` (el mismo que `isAdmin()` en rules y `AdminGuard`). Sin token → `401`; sin claim → `403`.

### Rechazo de pedidos

`createOrder` y `createPosSale` responden `409`:

```json
{
  "ok": false,
  "error": {
    "code": "STORE_CLOSED",
    "message": "La tienda no está recibiendo pedidos (cierre manual). Cerrada manualmente. Abre mañana 17:30. Horario de hoy: 17:30–22:30 (America/Santiago).",
    "details": {
      "state": "manual_closed", "reasonCode": "MANUAL_CLOSE",
      "closure": "manual",            // "schedule" | "manual" | "system"
      "timezone": "America/Santiago", "localNow": "…", "today": { … },
      "nextOpenAt": "2026-10-16T17:30:00-03:00",
      "schedule": { "monday": { … }, … }   // null si la config es inválida
    }
  }
}
```

### Otros códigos

| Código | HTTP | Cuándo |
|---|---|---|
| `STORE_CONFIG_INVALID` | 409 | Acción manual con horario ausente/inválido |
| `CASH_ALREADY_CLOSED` | 409 | Reabrir tras cierre de caja del día, o segundo cierre con otra `idempotencyKey` |
| `CASH_CLOSE_BLOCKED` | 409 | Hay pedidos activos o pagos `pending` sin el override permitido |
| `VALIDATION_ERROR` | 400 | Payload inválido, decimales, fecha futura |

### Idempotencia

- `setStoreOperation`: repetir la misma acción → `200 { changed: false }`, sin evento nuevo.
- `closeCashSession`: misma `idempotencyKey` → `200 { replayed: true }` con el cierre original; otra clave → `409 CASH_ALREADY_CLOSED`. `tx.create` impide dos cierres concurrentes.

## Reglas de caja

- Solo las ventas `delivered` son dinero recibido (alineado con `contracts/financial-events.md` §3.0).
- `paymentMethod = "pending"` nunca suma a efectivo ni a transferencias; se informa como "ventas pendientes".
- `cancelled` no suma en ninguna parte.
- Efectivo esperado = ventas entregadas en efectivo − gastos activos pagados en efectivo.
- Todo pedido activo (`queued`, `preparing`, `ready` o `on_the_way`) bloquea el cierre, sin importar si proviene de POS, web o WhatsApp.
- Los pedidos activos son bloqueos no anulables: deben llegar a un estado terminal (`delivered` o `cancelled`) antes de cerrar la caja.
- Los pagos `pending` bloquean el cierre, pero pueden superarse con un override administrativo con motivo de al menos 5 caracteres; el override queda auditado.
- Un pedido web/WhatsApp activo se muestra como bloqueo explícito, no como una simple advertencia.
- El día se toma de `order.operationalDate` (pedidos legacy sin ese campo no se incluyen) y los gastos por `occurredAt` dentro de `[día 05:00, día+1 05:00)` local.

## Timezone

Toda la aritmética usa `Intl` con la timezone configurada (DST real de Chile): nunca la del proceso ni la del navegador. Las horas se devuelven como ISO con offset (`-03:00` verano, `-04:00` invierno). La UI admin corrige el reloj del dispositivo con el `localNow` del servidor.

## Validación

```bash
npx playwright test e2e/unit --config=playwright.config.ts          # 78 OK (incluye 49 M6J)
npx playwright test e2e/api --config=playwright.config.ts           # 38 OK contra emulador
npm --workspace packages/shared run build && npm --workspace packages/shared run typecheck
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
git diff --check
```

## Riesgos y límites conocidos

- **Rollout**: un entorno sin `settings/storeHours` queda cerrado. Antes de desplegar, correr el seed (crea sin sobrescribir) o usar "Crear horario 17:30–22:30" en `/operacion`.
- Los 7 días quedan activos por defecto: TBB debe desactivar los días sin atención.
- No hay ventanas que crucen medianoche.
- No existe flujo para saldar un `pending`: todo día con pagos pendientes requiere override para cerrar caja.
- `createPosSale`, `createOrder`, `createExpense` y `updateOrderStatus` siguen sin auth (sin cambio en M6J); solo los endpoints nuevos de control exigen admin.
- `updateOrderStatus` sigue fijo al tenant `tbb`.
- No hay fondo de caja inicial: el efectivo contado debe excluirlo o anotarlo en la observación.
