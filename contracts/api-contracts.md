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

## Validaciones de negocio

Backend debe validar:

- tenant válido
- productos válidos
- cantidades válidas
- transición de estado válida
- cálculo de totales desde datos confiables
- timestamps del servidor

## Documentos relacionados

- `contracts/order.schema.json`
- `contracts/order-status.md`
- `packages/shared/src/schemas/order.schema.ts`
- `packages/shared/src/constants/order-status.ts`