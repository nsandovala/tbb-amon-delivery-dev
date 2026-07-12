# Contrato de Eventos Financieros — AMON Shop → AMON ERP

**Versión de esquema de eventos:** `1.0.0`
**Estado:** Borrador revisado contra el contrato real de AMON Shop. **NO congelado.**
**Ubicación:** `contracts/financial-events.md` (en ambos repos, o repo compartido)
**Repos afectados:** `tbb-amon-delivery-dev` (emisor) · `tbb-finance` / AMON ERP (consumidor)
**Revisado:** 2026-07-12 contra `apps/functions/src/schemas/order.shared.ts`, `contracts/order.schema.json` y `contracts/order-status.md`

---

## 0. Alcance y reglas de integración (leer antes que nada)

1. **AMON Shop no escribe directo al ERP.** Nunca. Ni HTTP directo, ni escritura a su base,
   ni job compartido. AMON Shop emite hechos; el ERP los interpreta.
2. **La integración futura debe usar un event outbox.** El emisor persiste el evento en una
   colección `outbox` dentro de su propia transacción de negocio, y un despachador aparte lo
   entrega al ERP con reintentos. Sin outbox, un fallo de red = venta que no existe en la
   contabilidad. **El outbox no está implementado todavía y no forma parte de este contrato.**
3. **v1 cubre exactamente dos eventos:** `order.completed` y `order.cancelled`.
4. **`expense.recorded` queda fuera de alcance v1.** Los gastos ya se registran en
   `tenants/{tenantId}/expenses` vía la Function `createExpense` (M6C), pero **no** se emiten
   al ERP en v1. Entran en v1.1, con su propio contrato.

> Este documento es el borrador de arquitectura. Ninguna Function, ruta de Admin, POS ni
> Firestore rule se modificó para escribirlo.

---

## 1. Propósito

AMON Shop genera hechos comerciales. AMON ERP los transforma en verdad financiera.
Este contrato define los eventos que cruzan esa frontera. Ningún otro dato cruza.

Reglas madre:

1. **AMON Shop nunca escribe directo en el ERP.** Emite eventos; el ERP valida, registra y audita.
2. **El ERP nunca inventa valores.** Todo monto proviene del contrato del pedido real.
3. **Nada se borra.** Cancelación = reverso. La historia queda intacta.
4. **No nettear.** Ingresos brutos y gastos se registran por separado. El neto se calcula, no se persiste como venta.

---

## 2. Convenciones

| Convención | Regla |
|---|---|
| Moneda | CLP, **enteros**, sin decimales, sin floats. El emisor debe asegurar enteros: el schema de Shop usa `z.number()`, no `z.number().int()` |
| Fechas | ISO 8601 con offset de `America/Santiago`. El offset **varía por DST** (`-04:00` en invierno, `-03:00` en horario de verano). No hardcodear |
| Origen de `occurred_at` | La marca de la transición que dispara el evento (`statusChangedAt`), no `createdAt` |
| IDs de evento | `evt_as_<order_id>_<tipo>`, determinístico, único e inmutable |
| Idempotencia | `event_id` es clave única en el ERP. Evento repetido → ignorado y logueado, nunca duplicado. Al ser determinístico, un reintento del outbox produce el mismo `event_id` |
| Versionado | `schema_version` presente en todo evento. Cambios breaking → bump mayor |
| Estado que dispara `order.completed` | **Únicamente** la transición a `delivered` (ver §3.0) |

### 2.1 Mapeo de identidad

| Campo del evento | Fuente en AMON Shop | Nota |
|---|---|---|
| `order_id` | ID del documento en `tenants/{tenantId}/orders/{orderId}` | Es un auto-id de Firestore (20 chars, ej. `k7Fq2mXbN1pRw9dLcT4z`), **no** un correlativo tipo `AS-1048`. Si el ERP quiere un folio legible, lo genera él |
| `company_id` | `tenantId` (hoy: `tbb`) | Se emite el `tenantId` **verbatim**. El ERP mantiene la tabla `tbb → the-best-burger`. No inventamos un segundo espacio de identificadores en el emisor |
| `branch_id` | **No existe en AMON Shop** | v1: constante `"food-truck"`. Cuando exista multi-sucursal, sale del pedido |

---

## 3. Evento: `order.completed`

### 3.0 Disparador (corregido)

El borrador original decía: *"`delivered` (delivery) o `ready` retirado (pickup)"*.
**Ese estado no existe.** La máquina de estados de `contracts/order-status.md` es:

```
queued → preparing → ready → on_the_way → delivered
                                  ↓
                             cancelled
```

No hay estado `picked_up` ni marca de "retirado". `ready` **no es terminal**: un pedido de
pickup en `ready` puede no haber sido retirado nunca. Emitir venta ahí sería reconocer plata
que quizá nadie pagó.

**Regla v1:** `order.completed` se emite **una sola vez**, en la transición a `delivered`,
tanto para `delivery` como para `pickup`.

> **Consecuencia operativa (bloqueante, ver Riesgos R1):** hoy toda orden nace en `queued`,
> incluidas las ventas POS al contado. Nadie las lleva a `delivered` automáticamente. Mientras
> eso no cambie, **una venta de foodtruck pagada en efectivo nunca emitiría `order.completed`.**
> Antes de congelar hay que decidir quién marca `delivered` en pickup/POS.

### 3.1 Payload

```json
{
  "schema_version": "1.0.0",
  "event_type": "order.completed",
  "event_id": "evt_as_k7Fq2mXbN1pRw9dLcT4z_completed",
  "occurred_at": "2026-07-11T18:42:00-04:00",
  "source": "amon-shop",
  "company_id": "tbb",
  "branch_id": "food-truck",
  "order_id": "k7Fq2mXbN1pRw9dLcT4z",
  "channel": "admin_pos",
  "fulfillment_type": "delivery",
  "payment_method": "transfer",

  "gross_amount": 18990,
  "discount_amount": 0,
  "delivery_charged_amount": 1500,
  "total_charged_amount": 20490,

  "platform_fee_amount": 0,
  "courier_fee_amount": 0,
  "courier_provider": "own",

  "merchant_net_amount": 20490
}
```

### 3.2 Campos de monto y su origen real

| Campo | Definición | Fuente en AMON Shop | Naturaleza contable |
|---|---|---|---|
| `gross_amount` | Productos a precio de lista. **NO incluye delivery** | `totals.subtotal` | Base de venta |
| `discount_amount` | Descuentos sobre productos | **No existe.** Constante `0` en v1 | Rebaja de venta |
| `delivery_charged_amount` | Lo cobrado **al cliente** por envío | `totals.delivery` (hoy: `1500` en delivery, `0` en pickup) | **Ingreso** |
| `total_charged_amount` | Lo que pagó (o deberá pagar) el cliente | `totals.total` | Ingreso total (venta ERP) |
| `platform_fee_amount` | Comisión de plataforma/pasarela | **No existe.** Constante `0` en v1 | **Gasto** financiero |
| `courier_fee_amount` | Lo que el courier cobra **al comercio** | **No existe.** Constante `0` en v1 | **Gasto** operacional |
| `courier_provider` | `own` \| `uber_direct` \| otro | **No existe.** Constante `"own"` en v1 (delivery propio) | Dimensión de análisis |
| `merchant_net_amount` | Neto informativo para conciliar | Derivado | **Derivado, nunca fuente de verdad** |
| `channel` | Origen comercial del pedido | `channel` (`web` \| `admin_pos` \| `whatsapp` \| …) | Dimensión de análisis |

Los campos marcados como constantes se mantienen en el payload **a propósito**: fijan la forma
del evento ahora, para que integrar Uber Direct o una pasarela mañana sea un cambio de valor y
no un cambio de esquema (que rompería al consumidor).

### 3.3 Invariantes (el ERP las valida al recibir; si fallan → evento rechazado)

```
INV-1:  total_charged_amount = gross_amount − discount_amount + delivery_charged_amount
INV-2:  merchant_net_amount  = total_charged_amount − platform_fee_amount − courier_fee_amount
INV-3:  todos los montos ≥ 0 y enteros
INV-4:  fulfillment_type = "pickup"  →  delivery_charged_amount = 0 y courier_fee_amount = 0
INV-5:  courier_provider = "own"     →  courier_fee_amount = 0
INV-6:  discount_amount = 0          (v1: AMON Shop no tiene descuentos; si llega > 0, es un bug del emisor)
```

INV-1 se cumple hoy de forma trivial: Shop calcula `total = subtotal + delivery` en el backend
desde precios de la base (`orders.service.ts`), y `discount_amount` es `0`.

> **Nota INV-5:** el costo del delivery propio (bencina, tiempo) no viaja en el pedido.
> Se registra como gasto operacional normal en el ERP. El pedido no lo conoce.

### 3.4 Asientos que genera el ERP por cada `order.completed`

| # | Movimiento | Monto | Tipo |
|---|---|---|---|
| 1 | Venta pedido `{order_id}` | `total_charged_amount` | Ingreso, a la cuenta según `payment_method` (ver §6) |
| 2 | Comisión plataforma | `platform_fee_amount` (si > 0) | Gasto financiero, vinculado al pedido |
| 3 | Fee courier | `courier_fee_amount` (si > 0) | Gasto operacional, vinculado al pedido |

En v1 solo se genera el movimiento 1: los otros dos son siempre `0`.
Los movimientos comparten `source_event_id` para trazabilidad y conciliación.
**No se registra la venta neta como ingreso.** El IVA débito se calcula sobre la venta, no sobre el neto.

### 3.5 Por qué el delivery va en dos campos

Con un solo `delivery_amount` es imposible saber si el delivery deja o pierde plata.
Con dos campos, el margen de envío es consultable:

```
margen_delivery = delivery_charged_amount − courier_fee_amount
```

Hoy el margen es siempre `+1500` (delivery propio, sin fee de courier). El día que entre
Uber Direct cobrando $3.100 mientras cobras $1.500 al cliente, el subsidio de $1.600 por pedido
será visible en vez de desaparecer en silencio.

---

## 4. Evento: `order.cancelled`

Se emite **solo** si un pedido ya emitió `order.completed`. Pedidos cancelados antes de
completarse **no generan evento financiero** (nunca fueron venta).

```json
{
  "schema_version": "1.0.0",
  "event_type": "order.cancelled",
  "event_id": "evt_as_k7Fq2mXbN1pRw9dLcT4z_cancelled",
  "occurred_at": "2026-07-11T21:10:00-04:00",
  "source": "amon-shop",
  "company_id": "tbb",
  "branch_id": "food-truck",
  "order_id": "k7Fq2mXbN1pRw9dLcT4z",
  "reverses_event_id": "evt_as_k7Fq2mXbN1pRw9dLcT4z_completed",
  "refund_amount": 20490,
  "refund_method": "transfer",
  "courier_fee_refunded": false
}
```

Reglas:

- `reverses_event_id` es **obligatorio** y debe existir en el ERP; si no existe → rechazo.
- El ERP crea movimientos de **reverso** (montos negativos vinculados a los originales). Jamás edita ni borra la venta original.
- `courier_fee_refunded = false` refleja la realidad: si el courier ya salió, ese gasto no se recupera aunque devuelvas la venta. El reverso NO incluye el fee del courier salvo que este campo sea `true`. En v1 es constante `false` (no hay fee de courier).

### 4.1 Origen de los campos de reverso (v1)

| Campo | Fuente en AMON Shop | Regla v1 |
|---|---|---|
| `refund_amount` | **No existe** | Constante: el `total_charged_amount` del evento reversado. **Solo reembolso total.** Reembolsos parciales quedan fuera de v1 |
| `refund_method` | **No existe** | Constante: el `payment_method` del evento reversado |
| `courier_fee_refunded` | **No existe** | Constante `false` |

### 4.2 Dependencia con la máquina de estados (contradicción a resolver)

Este evento requiere que `delivered → cancelled` sea una transición **legal**.

- El **código** (`order.shared.ts`, `ILLEGAL_TRANSITIONS.delivered`) sí la permite: bloquea volver
  a `queued`/`preparing`/`ready`/`on_the_way`, pero **no** bloquea `cancelled`.
- La **documentación** (`contracts/order-status.md`) dice lo contrario: *"`delivered` → any (except no-op) — Terminal state"*.

Código y documento se contradicen hoy, y este contrato depende de esa transición. Hay que
resolverlo (ver R2) antes de congelar: la postura propuesta es **mantener `delivered → cancelled`
legal** (es lo que hace posible el reverso) y corregir `contracts/order-status.md`.

---

## 5. Respuesta del ERP

Para todo evento recibido, el ERP responde:

```json
{
  "event_id": "evt_as_k7Fq2mXbN1pRw9dLcT4z_completed",
  "status": "accepted | duplicate | rejected",
  "movements_created": ["mov_5501"],
  "rejection_reason": null
}
```

- `duplicate` no es error: es idempotencia funcionando. Se loguea y sigue.
- `rejected` (invariante rota, reverso sin original, schema inválido) **debe ser visible en Sentinel**: un evento rechazado silenciosamente = plata invisible.

---

## 6. Enum `payment_method` (v1, alineado a AMON Shop)

El borrador original listaba `cash | transfer | compraqui | card | wallet`. **`compraqui` y
`wallet` no existen** en AMON Shop, y faltaba `pending`, que además es el **valor por defecto**
de `createOrder` y `createPosSale`. El enum real (`order.shared.ts`) es:

```
pending | cash | card | transfer
```

| Valor | Realidad en Shop | Tratamiento contable en el ERP |
|---|---|---|
| `cash` | Efectivo | Ingreso a cuenta caja |
| `transfer` | Transferencia | Ingreso a cuenta banco |
| `card` | En el enum, pero **deshabilitado en la UI** ("Próximamente") | Ingreso a cuenta pasarela (cuando exista) |
| `pending` | **Default.** El pedido se entregó sin registrar cómo se pagó | **Cuentas por cobrar**, no caja |

**Regla clave:** `payment_method = "pending"` **no bloquea** la emisión de `order.completed`.
La venta se reconoce al entregar (devengo); el método de pago solo determina **a qué cuenta**
entra. Registrar un `pending` como caja sería inventar plata que no está.

> **No usar `paymentStatus` como señal de cobro.** El campo existe en el pedido con enum
> `pending | paid | failed | refunded`, pero el backend lo escribe como `"pending"` al crear y
> **ningún código lo actualiza jamás**. Es un campo muerto. El ERP no debe leerlo hasta que
> AMON Shop tenga un flujo real de conciliación de pagos (ver R3).

Ampliar el enum requiere bump de versión menor y actualización en ambos repos.

---

## 7. Fuera de alcance v1 (explícitamente)

- **`expense.recorded`** → v1.1. Los gastos ya se persisten en `tenants/{tenantId}/expenses` (M6C), pero **no** se emiten al ERP en v1.
- **Event outbox** → no implementado. Es requisito de la integración, no de este contrato.
- Descuentos / promociones (`discount_amount` > 0) → cuando existan en Shop
- Propinas (`tip_amount`) → v1.1 cuando exista en Amon Shop
- Reembolsos parciales → v1 solo soporta reverso total
- Liquidaciones batch de pasarelas → F2.1 adaptador
- Multi-moneda → no aplica
- IVA desglosado por línea → el ERP lo deriva; el evento no lo transporta
- Multi-sucursal real (`branch_id` dinámico) → constante en v1

---

## 8. Checklist de congelamiento

- [ ] **R1:** decidir quién marca `delivered` en pickup/POS. Sin esto, las ventas de foodtruck no emiten evento
- [ ] **R2:** resolver la contradicción `delivered → cancelled` entre `order-status.md` y `ILLEGAL_TRANSITIONS`
- [ ] **R3:** confirmar que el ERP trata `payment_method = "pending"` como cuentas por cobrar y **no** lee `paymentStatus`
- [ ] Confirmar el mapeo `tenantId → company_id` en el ERP (`tbb` → `the-best-burger`)
- [ ] Revisar nombres de campos contra `contracts/order.schema.json` (el pedido usa `camelCase`, el evento financiero usa `snake_case`; el mapeo está en §2.1 y §3.2)
- [ ] Commit de este archivo en ambos repos
- [ ] Fixtures de contrato (ver §9) verdes en el consumidor
- [ ] Sentinel: alerta "pedidos `delivered` sin evento en ERP > N"

---

## 9. Checklist de fixtures futuros

Fixtures que el **consumidor (ERP)** debe tener verdes antes de aceptar tráfico real.
Ninguno existe todavía; ninguno se creó en esta fase.

**Válidos (deben ser `accepted`):**

- [ ] `completed_pickup_cash` — pickup, efectivo, `delivery_charged_amount = 0`
- [ ] `completed_delivery_transfer` — delivery propio, `delivery_charged_amount = 1500`, `courier_fee_amount = 0`
- [ ] `completed_pending_payment` — `payment_method = "pending"` → debe ir a cuentas por cobrar, no a caja
- [ ] `cancelled_after_completed` — reverso total con `reverses_event_id` válido

**Idempotencia:**

- [ ] `completed_duplicate` — mismo `event_id` dos veces → `accepted` y luego `duplicate`, **un solo** movimiento

**Inválidos (deben ser `rejected`, uno por invariante):**

- [ ] `inv1_total_mismatch` — `total_charged_amount ≠ gross − discount + delivery`
- [ ] `inv2_net_mismatch` — `merchant_net_amount` mal calculado
- [ ] `inv3_negative_amount` — monto negativo o decimal
- [ ] `inv4_pickup_with_delivery_charge` — `pickup` con `delivery_charged_amount > 0`
- [ ] `inv5_own_courier_with_fee` — `courier_provider = "own"` con `courier_fee_amount > 0`
- [ ] `inv6_unexpected_discount` — `discount_amount > 0` en v1
- [ ] `cancelled_without_original` — `reverses_event_id` que no existe → rechazo
- [ ] `unknown_payment_method` — `compraqui` / `wallet` → rechazo (no están en el enum v1)
- [ ] `bad_schema_version` — `schema_version` mayor desconocida → rechazo

---

*Borrador revisado el 2026-07-12 contra el contrato real de AMON Shop. **Pendiente de congelar**: cerrar R1, R2 y R3 primero.*
*Dirección: Nelson alias Vito (humano director) · Arquitectura: Claude · Ejecutores: según asignación*
