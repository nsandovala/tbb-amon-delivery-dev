# Marcha Blanca Checklist — AMON Shop / TBB

## Objetivo

Validar que el tenant piloto `tbb` (The Best Burger) está listo para operación controlada sin login de cliente, sin pagos externos y sin escrituras directas desde frontend.

---

## 1. Backend como fuente de verdad

- [x] `apps/functions/src/services/orders.service.ts` calcula totales desde precios Firestore.
- [x] `apps/functions/src/services/pos.service.ts` calcula totales desde precios Firestore.
- [x] Delivery fee se resuelve en backend por `fulfillmentType`:
  - `delivery` → 1500
  - `pickup` → 0
- [x] `customerId` y `customerPhoneNormalized` se derivan del teléfono normalizado en backend.
- [x] Customer upsert ocurre en backend (`upsertCustomerFromOrder`).
- [x] No quedan writes directos a Firestore desde `apps/web` ni `apps/admin` en flujos críticos.

## 2. Contratos compartidos

- [x] `packages/shared/src/schemas/order.shared.ts` define `createOrderSchema`, `createPosSaleSchema`, `updateOrderStatusSchema`.
- [x] Tipos `CreateOrderInput`, `CreatePosSaleInput`, `UpdateOrderStatusInput` exportados.
- [x] `orderSchema` incluye `customerId?`, `customerPhoneNormalized?`, `totals`, `fulfillmentType`.
- [x] `ILLEGAL_TRANSITIONS` documentado (no validado en runtime todavía, pero definido).

## 3. Storefront (`apps/web`)

- [x] Checkout envía payload mínimo a `createOrderApi`:
  - `items: { productId, qty }[]`
  - `customer: { name, phone, email?, address?, notes? }`
  - `fulfillmentType`
  - `paymentMethod`
- [x] No envía `totals`, `deliveryFee`, `subtotal` ni `total`.
- [x] Preview de totales en frontend es solo visual; backend recalcula.
- [x] Validación de nombre (>=3 chars), teléfono chileno, email opcional, dirección requerida solo para delivery.
- [x] Métodos de pago visibles: efectivo, transferencia. Tarjeta deshabilitada como "Próximamente".
- [x] No existe Firebase Auth para clientes finales.
- [x] No existe búsqueda pública por nombre/teléfono.

## 4. POS (`apps/admin/pos`)

- [x] Crea ventas reales vía `createPosSaleApi`.
- [x] No envía `totals`, `deliveryFee`, `subtotal` ni `total`.
- [x] Preview de totales en frontend es solo visual; backend recalcula.
- [x] Métodos de pago: efectivo, transferencia, pendiente. Tarjeta deshabilitada como "Próximamente".
- [x] `totalSalesToday` excluye órdenes `cancelled`.
- [x] `startOfDay` se congela al montar (riesgo conocido: reiniciar POS después de medianoche).

## 5. Pedidos en vivo (`apps/admin/pedidos`)

- [x] Lectura live desde Firestore (`onSnapshot`).
- [x] Cambio de estado usa `updateOrderStatusApi` (HTTP backend).
- [x] No hay escritura directa a Firestore.
- [x] KPIs de conteo por estado son live y reales.

## 6. Typecheck / Build

- [x] `npm --prefix packages/shared run typecheck` → limpio
- [x] `npm --prefix apps/functions run build` → limpio
- [x] `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` → limpio
- [x] `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit` → limpio

## 7. Riesgos abiertos aceptados para marcha blanca

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| `startOfDay` congelado en POS | KPIs del día anterior si POS abierto >24h | Reiniciar POS diariamente |
| Seed orders usan schema viejo (`deliveryFee` vs `delivery`) | Solo afecta seed antiguo | No re-seedar en producción; seed es bootstrap |
| HEO Chatbot no funcional | UX degradada | Es decorativo; no afecta pedidos |
| Rating/likes estáticos | UX degradada | Son datos reales de seed; no afecta operación |
| Firestore rules abiertas | Seguridad | Endurecer en fase post-marcha blanca |
| Cross-sell Papas Kaioken inexistente | Ingreso potencial menor | Feature gap; no bloquea operación |
| Cart drawer UX comprimido en mobile | Conversión | Recomendado rediseño post-marcha blanca |
| Nav items placeholder en admin | Navegación rota | Solo POS y Pedidos están operativos |

## 8. Pendientes post-marcha blanca

- [ ] Live Order Tracking sin login (`trackingToken` seguro).
- [ ] Endurecer Firestore Rules.
- [ ] Recalcular `startOfDay` periódicamente en POS.
- [ ] Implementar cross-sell Papas Kaioken.
- [ ] Integración Flow para pagos online (futuro).
- [ ] Firebase Auth para staff/admin (futuro).
- [ ] Métricas y reporting operativo avanzado.

## 9. Go / No-Go

**Estado: GO para marcha blanca controlada.**

Condiciones:
1. El tenant `tbb` ya puede recibir pedidos reales desde storefront.
2. El POS puede registrar ventas reales.
3. `/pedidos` refleja estados en tiempo real.
4. Backend es fuente de verdad para totales, delivery fee, customer identity y estados.
5. No hay escrituras críticas directas desde frontend.

---

*Última actualización: 2026-05-27*
