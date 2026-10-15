# API Contracts

## Regla principal

Frontend envía payload mínimo.  
Backend valida, enriquece, calcula, timestamp, persiste y responde.

## Source of truth

- Contratos compartidos: `packages/shared/src`
- Persistencia operativa: Firestore
- Escrituras críticas: solo backend HTTP / Functions

## Endpoints operativos actuales

### Crear pedido storefront
- Método: `POST`
- Handler backend: `createOrder`
- Origen esperado: `apps/web`

Payload esperado:
- `tenantId`
- `items[]` con:
  - `productId`
  - `qty`
- `customer`
  - `name`
  - `phone`
  - `address?`
  - `notes?`
- `fulfillmentType`
- `paymentMethod?`

El frontend **no** debe enviar:
- `subtotal`
- `delivery`
- `total`
- `unitPrice`

Respuesta esperada:
- `orderId`

---

### Crear venta POS
- Método: `POST`
- Handler backend: `createPosSale`
- Origen esperado: `apps/admin`

Payload esperado:
- `tenantId`
- `items[]` con:
  - `productId`
  - `qty`
- `customer`
  - `name`
  - `phone`
  - `address?`
  - `notes?`
- `paymentMethod?`

Respuesta esperada:
- `orderId`

---

### Actualizar estado de pedido
- Método: `PATCH`
- Handler backend: `updateOrderStatus`
- Origen esperado: `apps/admin`

Payload esperado:
- `status`

Parámetro requerido:
- `orderId`

Reglas:
- backend valida transición
- backend rechaza transiciones ilegales
- frontend no fuerza cambios fuera de contrato

Respuesta esperada:
- `orderId`
- `status`

---

### Horario operativo y cierre de caja (M6J)

`createOrder` y `createPosSale` validan en backend, dentro de la transacción de creación,
que la tienda acepte pedidos. Si no: `409 STORE_CLOSED` con estado, tipo de cierre
(`schedule` | `manual` | `system`), horario configurado y próxima apertura.

Endpoints nuevos: `getStoreStatus` (público), `getStoreControl`, `setStoreOperation`,
`updateStoreHours`, `getCashCloseSummary`, `closeCashSession` (admin, `Authorization: Bearer <ID token>`
con claim `admin`).

Detalle completo: `docs/architecture/store-operation-contract.md`.

## Validaciones de negocio

Backend debe validar:

- tenant válido
- productos válidos
- cantidades válidas
- transición de estado válida
- tienda aceptando pedidos (fail-closed si el horario falta o es inválido)
- cálculo de totales desde datos confiables
- timestamps del servidor

## Documentos relacionados

- `contracts/order.schema.json`
- `contracts/order-status.md`
- `packages/shared/src/schemas/order.schema.ts`
- `packages/shared/src/constants/order-status.ts`