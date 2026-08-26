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
  -> optional normalizeChileanPhone(customer.phone)
  -> reserve displayOrderNumber in tenants/{tenantId}/orderCounters/{operationalDate}
  -> createOrder() in tenants/{tenantId}/orders/{orderId}
  -> upsertCustomerFromOrder() only when phone exists and normalizes
  -> tenants/{tenantId}/customers/{customerId}
```

## Paths Firestore

- Orders: `tenants/{tenantId}/orders/{orderId}`
- Customers: `tenants/{tenantId}/customers/{customerId}`
- Daily order counter: `tenants/{tenantId}/orderCounters/{operationalDate}`

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
- `displayOrderNumber?`
- `displayCode?`
- `operationalDate?`
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
- Storefront exige nombre y teléfono válido; si `fulfillmentType === "delivery"`, también exige dirección no vacía.
- El botón de confirmación del storefront permanece accionable para mostrar la causa exacta cuando la validación frontend falla; solo se deshabilita durante el envío.
- En desarrollo, el cliente web usa el proxy same-origin `/api/functions` si no existe una base URL explícita, evitando depender de un env local para sortear PNA/CORS.
- POS pickup puede persistir una venta con `customer.phone` vacío cuando opera en modo explícito `Cliente mostrador`.
- El modo POS con datos de cliente conserva inputs controlados: borrar nombre o teléfono no repone texto automáticamente ni bloquea una venta pickup.
- En POS pickup sin nombre se persiste `Cliente mostrador` como fallback operativo; sin teléfono normalizable no se crea customer.
- POS delivery exige nombre, teléfono chileno válido y dirección.
- En POS pickup, si el teléfono no existe o no se puede normalizar, la order igual se persiste y el upsert de customer se omite.
- `customerPhoneNormalized` debe persistirse en la order cuando exista normalización válida.
- `displayOrderNumber` se asigna en backend por tenant y por día operacional.
- `displayCode` es la versión humana del correlativo (`padStart(3, "0")`).
- `operationalDate` usa corte operacional `05:00` en `America/Santiago`.
- El delivery fee se deriva exclusivamente de `fulfillmentType`:
  - `delivery = 1500`
  - `pickup = 0`
- Los totales finales se calculan en backend desde Firestore.
- El frontend puede previsualizar totales, pero nunca los envía en el payload de creación.
- `paymentMethod: "card"` está deshabilitado en storefront y POS hasta integración Flow.

## Validaciones técnicas (2026-08-26 — M6H)

```bash
npm run build --workspace packages/shared              # OK
npm run build --prefix apps/functions                  # OK
npm run build --workspace apps/admin                   # OK
npm run build --workspace apps/web                     # OK adicional
npm run test:e2e:api                                   # OK, 22/22
node tools/test-rules-anon.mjs                          # OK, 6/6
```

- `createOrder` delivery válido retorna `201` y conserva `displayOrderNumber`/`displayCode`.
- `createOrder` delivery sin teléfono o sin dirección retorna `400`.
- `createPosSale` pickup mostrador retorna `201` sin `customerId`.
- `createPosSale` delivery sin dirección retorna `400`.
- `createPosSale` con teléfono normalizable retorna `201` y persiste identidad normalizada.
- QA visual quedó pendiente porque el navegador integrado no estaba disponible; las rutas locales respondieron `200` por smoke HTTP.
- Smoke same-origin contra Next.js rewrites confirmó: web delivery `201` (`displayCode 009`), web pickup `201` (`010`), POS mostrador `201` (`011`) y cierre POS `delivered`.

## Validaciones técnicas (2026-07-13)

```bash
npm run build --workspace packages/shared
.\node_modules\.bin\tsc -p packages/shared/tsconfig.json --noEmit
npm run build --prefix apps/functions
npm run build --workspace apps/admin
.\node_modules\.bin\playwright test e2e/api --config=playwright.config.ts
node tools/test-rules-anon.mjs
git diff --check
```

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
