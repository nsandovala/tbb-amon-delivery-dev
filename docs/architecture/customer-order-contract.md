# Customer / Order Contract

## Resumen

La fase operativa actual de AMON Shop / TBB usa backend como fuente de verdad para orders y un MVP de customers identificado por teléfono chileno normalizado. No existe login de cliente en esta etapa.

## Diagrama textual

```text
Storefront checkout
  -> POST createOrder
  -> orders.service.ts
  -> normalizeChileanPhone(customer.phone)
  -> createOrder() in tenants/{tenantId}/orders/{orderId}
  -> upsertCustomerFromOrder()
  -> firestore-customers.repo.ts
  -> tenants/{tenantId}/customers/{customerId}

POS sale
  -> POST createPosSale
  -> pos.service.ts
  -> normalizeChileanPhone(customer.phone)
  -> createOrder() in tenants/{tenantId}/orders/{orderId}
  -> upsertCustomerFromOrder()
  -> tenants/{tenantId}/customers/{customerId}
```

## Paths Firestore

- Orders: `tenants/{tenantId}/orders/{orderId}`
- Customers: `tenants/{tenantId}/customers/{customerId}`

## Campos principales

### Order

- `id`
- `tenantId`
- `status`
- `channel`
- `paymentMethod`
- `paymentStatus`
- `fulfillmentType`
- `customer`
- `customerId?`
- `customerPhoneNormalized?`
- `items`
- `totals.subtotal`
- `totals.delivery`
- `totals.total`
- `createdAt`
- `updatedAt`

### Customer

- `id`
- `phone`
- `phoneNormalized`
- `name`
- `email?`
- `addresses[]`
- `totalOrders`
- `totalSpent`
- `lastOrderAt`
- `lastPaymentMethod`
- `lastFulfillmentType`
- `createdAt`
- `updatedAt`

## Reglas operativas

- `customerId` es el teléfono chileno normalizado.
- Si el teléfono no se puede normalizar, la order igual se persiste y el upsert de customer se omite.
- `customerPhoneNormalized` debe persistirse en la order cuando exista normalización válida.
- El delivery fee se deriva exclusivamente de `fulfillmentType`:
  - `delivery = 1500`
  - `pickup = 0`
- Los totales finales se calculan en backend desde Firestore.
- El frontend puede previsualizar totales, pero nunca los envía en el payload de creación.
- `paymentMethod: "card"` está deshabilitado en storefront y POS hasta integración Flow.

## Validaciones técnicas (2026-05-27)

```bash
npm --prefix packages/shared run typecheck        # OK
npm --prefix apps/functions run build             # OK
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit    # OK
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit  # OK
```

- No quedan writes directos a Firestore desde frontend en flujos críticos.
- POS `totalSalesToday` excluye órdenes `cancelled`.
- Tipos `AdminOrderCustomer` incluyen `email?`.

## Reglas de privacidad

- No habilitar búsqueda pública de pedidos por nombre o teléfono.
- No introducir login de cliente en esta fase.
- No introducir Firebase Auth para customers sin aprobación explícita de nueva fase.
- El tracking público futuro debe resolverse con `trackingToken` seguro, no con datos personales.

## Próximas fases

- tracking público sin login mediante `trackingToken`
- clientes recurrentes mejor integrados en POS/storefront
- métricas y reporting real
- Flow para pagos online
- limpieza de artefactos de build antes de commit operativo final
