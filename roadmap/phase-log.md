# Phase Log

## Fase actual
Home público AMON Shop — Frontend

## 2026-05-27 — Home público AMON Shop

### Módulo
Home público (`/`) — frontend only.

### Archivos modificados
- `apps/web/src/app/page.tsx` — reconstruido como AMON Shop Home premium
- `apps/web/src/app/layout.tsx` — metadata actualizada a AMON Shop

### Decisión
AMON Shop es la marca y plataforma principal.
AMON Delivery queda como módulo logístico opcional, no como nombre de marca.

### Rutas relevantes
- `/` — Home público AMON Shop
- `/tienda/tbb` — tienda piloto The Best Burger
- `/pos` — panel operativo
- `/pedidos` — vista live de pedidos

### Contenido
- Hero con título AMON Shop, bajada de producto y microcopy geek.
- CTAs: Explorar tiendas (anchor #stores) y Ir al panel (/pos).
- Card principal: The Best Burger (Valparaíso, activa, con badges y link a /tienda/tbb).
- Cards secundarias: Sushi Zen y Forno Nero como Próximamente.
- Footer con referencia a /pedidos.

### Estética preservada
- Fondo oscuro `#0B0B0B`, verde AMON `#00FF9C`, cards `#141414`.
- Sin dependencias nuevas. Sin blanco puro. Responsive mobile/desktop.

### Contratos afectados
Ninguno. Cambio puramente frontend/UI. No toca backend, Firestore, schemas ni orders/customers.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro
(ver `roadmap/sprint-live-order-tracking.md` y `docs/architecture/live-order-tracking-contract.md`).

---

## Fase anterior
Backend-first stabilization

## 2026-05-08 — AMON Shop Backend/POS/Storefront Operational Phase

### Estado actual
- Backend de orders operativo.
- POS crea ventas reales.
- Storefront crea pedidos reales.
- `/pedidos` recibe stream en vivo.
- Delivery fee corregido bajo regla canónica:
  - `delivery = 1500`
  - `pickup = 0`
- Checkout storefront endurecido:
  - validación de nombre;
  - validación de teléfono chileno;
  - email opcional;
  - dirección requerida solo para delivery;
  - métodos visibles: efectivo y transferencia;
  - tarjeta deshabilitada como `Próximamente`.
- Cross-sell Papas Kaioken visible en carrito cuando corresponde.
- MVP de customers por teléfono implementado.
- Firestore guarda clientes en:
  - `tenants/tbb/customers/{customerId}`
- Firestore guarda pedidos en:
  - `tenants/tbb/orders/{orderId}`
- La fase queda pendiente de commit final porque el árbol actual no está limpio y existen cambios de código fuente sin commitear.

### Contratos de datos confirmados

Order:
- `customerId?: string`
- `customerPhoneNormalized?: string`
- `customer.name`
- `customer.phone`
- `customer.email?`
- `customer.address?`
- `customer.notes?`
- `fulfillmentType: "delivery" | "pickup"`
- `paymentMethod: "cash" | "transfer" | "card" | "pending"` según contrato actual real
- `totals.subtotal`
- `totals.delivery`
- `totals.total`
- `status`

Customer:
- `id / customerId` basado en teléfono normalizado
- `phoneNormalized`
- `name`
- `email` opcional
- `totalOrders`
- `totalSpent`
- `lastOrderAt`
- `lastPaymentMethod`
- `lastFulfillmentType`

### Regla de negocio canónica
- El teléfono chileno normalizado es la identidad mínima del cliente en marcha blanca.
- No existe login de cliente todavía.
- Firebase Auth no se debe introducir aún para clientes finales.
- SumUp queda fuera del MVP.
- Flow será la opción futura para pagos online, pero NO en esta fase.
- Tarjeta queda deshabilitada/`Próximamente` hasta integración Flow.
- El tracking público sin login será fase posterior mediante `trackingToken` seguro, no por búsqueda pública de teléfono/nombre.

### Validaciones técnicas
Estas validaciones deben quedar verdes:

```bash
npm --prefix packages/shared run typecheck
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

### Pendientes próximos
- Ver pedido en vivo sin login mediante `trackingToken`.
- Home AMON Shop pendiente de restaurar/levantar como fase separada.
- Métricas reales y reporting mejorado.
- Optimización UX POS.
- Clientes recurrentes en POS/storefront.
- Flow como integración futura de pagos online.
- Limpieza de artefactos build/tsbuildinfo antes de commit si aparecen.

## Hitos cerrados
- `packages/shared` compila
- `packages/shared` pasa typecheck
- `apps/functions` resuelve `@amon/shared`
- `apps/functions` compila limpio
- se inició migración de web/admin hacia HTTP clients
- se eliminaron mutaciones legacy críticas en parte del árbol
- service account fue movido fuera de la repo local visible

## Hallazgos clave
- el problema principal no era visual, era arquitectónico
- frontend estaba asumiendo responsabilidades de backend
- existía backend, pero parte del flujo no lo usaba
- `packages/shared/lib` contiene build output, no fuente editable
- la fuente de edición real está en `packages/shared/src`

## Hallazgos abiertos
- `apps/web` todavía tiene errores de typecheck
- queda al menos un write directo legacy en web por auditar/remover
- queries de catálogo/tenant en web tienen imports rotos (`../admin`)
- falta cerrar la migración completa del storefront al patrón backend-first

## Próximo objetivo inmediato
Dejar `apps/web` en verde y eliminar cualquier write directo restante a Firestore.

## Nota operativa
No endurecer Firestore Rules hasta que:
1. el flujo HTTP backend esté completo
2. el e2e esté validado
3. se confirme que frontend ya no depende de writes directos
