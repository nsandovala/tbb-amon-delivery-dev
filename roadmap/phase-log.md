# Phase Log

## Fase actual
Preparación marcha blanca controlada — Backend audit + fixes mínimos

## 2026-06-06 — Frontend/API wiring audit: fix UI → Functions Emulator

### Módulo
Auditoría de conexión UI → Firebase Functions Emulator. Diagnóstico y patch mínimo para `Failed to fetch` en Brave/Chromium.

### Archivos modificados
- `apps/web/next.config.ts` — agrega `rewrites` proxy same-origin a `/api/functions/:path*` → `http://127.0.0.1:5001/minerp-sentinel/us-central1/:path*`.
- `apps/admin/next.config.ts` — igual que web.
- `apps/web/src/lib/api/orders.ts` — `FUNCTIONS_BASE` usa `/api/functions` cuando `NEXT_PUBLIC_USE_EMULATOR=true`.
- `apps/admin/src/lib/api/orders.ts` — igual que web.

### Decisión
Los helpers frontend ya construían la URL correcta (`http://127.0.0.1:5001/minerp-sentinel/us-central1/...`) y los `.env.local` estaban bien configurados. El backend pasaba E2E y respondía correctamente a `curl` directo. El problema era que el navegador (Brave/Chromium) bloquea cross-origin requests a `127.0.0.1:5001` desde `localhost:3000/3001` por **Private Network Access (PNA)** / **Brave Shields**, causando `TypeError: Failed to fetch`. Los tests E2E no usan el navegador, por eso pasaban. El fix mínimo sin tocar backend es un proxy same-origin en Next.js (`rewrites` + ruta relativa `/api/functions`), evitando CORS y PNA por completo.

### Validaciones ejecutadas
```bash
npm --workspace apps/web run build     # OK
npm --workspace apps/admin run build   # OK
npm run test:e2e:api                   # 5 passed
```
Pruebas manuales vía proxy:
- `POST /api/functions/createOrder` → 201
- `POST /api/functions/createPosSale` → 201
- `PATCH /api/functions/updateOrderStatus?orderId=...` → 200

### Riesgos reales corregidos
1. `Failed to fetch` en storefront al confirmar pedido → corregido via proxy same-origin.
2. `Failed to fetch` en POS al confirmar venta → corregido via proxy same-origin.
3. `Failed to fetch` en `/pedidos` al cambiar estado → corregido via proxy same-origin.

### Riesgos abiertos aceptados
- El proxy solo se activa cuando `NEXT_PUBLIC_USE_EMULATOR=true`. En producción (Vercel) se mantiene `NEXT_PUBLIC_FUNCTIONS_BASE_URL` directo.
- `next.config.ts` rewrites requiere que el servidor Next.js esté corriendo para funcionar (no aplica a static export).

### Contratos afectados
- Ninguno. No se cambiaron schemas, services backend, ni lógica de negocio.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro.

---

## 2026-05-27 — Preparación marcha blanca controlada

### Módulo
Auditoría backend-first y correcciones mínimas para operación real de TBB.

### Archivos modificados
- `apps/admin/src/app/pos/page.tsx` — deshabilita `card` como método de pago (Próximamente); excluye `cancelled` de `totalSalesToday`.
- `apps/web/src/lib/firebase/queries/orders.ts` — completa tipo `AdminOrderCustomer` con `email?`.
- Eliminado `apps/web/src/hooks/use-cart.ts` (archivo muerto, 0 bytes).

### Decisión
El repo está listo para marcha blanca controlada. No se introducen cambios estructurales ni UI grandes. Solo fixes funcionales mínimos que evitan errores operativos.

### Validaciones ejecutadas
```bash
npm --prefix packages/shared run typecheck        # OK
npm --prefix apps/functions run build             # OK
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit    # OK
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit  # OK
```

### Riesgos reales corregidos
1. POS permitía `card` como método de pago activo → ahora deshabilitado como "Próximamente", coherente con storefront.
2. `totalSalesToday` en POS sumaba órdenes `cancelled` → ahora excluidas.
3. Tipo `AdminOrderCustomer` incompleto (`email` faltante) → corregido.
4. Archivo muerto `use-cart.ts` → eliminado.

### Riesgos abiertos aceptados
- `startOfDay` congelado en POS (reiniciar POS diariamente).
- Seed orders usan schema viejo (`deliveryFee` vs `delivery`) — solo afecta re-seed.
- HEO Chatbot decorativo/no funcional.
- Firestore rules abiertas.
- Cross-sell Papas Kaioken inexistente.
- Cart drawer UX comprimido en mobile.

### Contratos afectados
- `docs/operations/marcha-blanca-checklist.md` — creado.
- `playbooks/repo-rules.md` — actualizado con reglas de marcha blanca.
- `docs/architecture/customer-order-contract.md` — actualizado con validaciones.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro.

---

## Fase anterior
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

## Hallazgos abiertos (resueltos en fase marcha blanca)
- ✅ `apps/web` typecheck limpio.
- ✅ No quedan writes directos legacy en flujos críticos.
- ✅ Migración backend-first del storefront cerrada.

## Hallazgos abiertos actuales
- `startOfDay` congelado en POS (riesgo operativo bajo si reinicia diario).
- Seed orders usan schema viejo (`deliveryFee` vs `delivery`) — solo afecta re-seed.
- Cross-sell Papas Kaioken inexistente.
- Cart drawer UX comprimido en mobile.
- Firestore rules abiertas.

## Próximo objetivo inmediato
Live Order Tracking sin login mediante `trackingToken` seguro.

## Nota operativa
No endurecer Firestore Rules hasta que:
1. el flujo HTTP backend esté completo
2. el e2e esté validado
3. se confirme que frontend ya no depende de writes directos
