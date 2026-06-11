# Frontend Skills

## Core Skills

- construir vistas en Next.js App Router
- ajustar componentes con TailwindCSS sin rehacer toda la UI
- integrar carrito y estados locales con Zustand
- conectar UI a queries y mutations reales de Firestore
- cuidar conversion en tienda y claridad operativa en POS/admin

## Reglas

- Confirmar siempre si el dato ya viene de Firestore antes de crear estado local derivado.
- Mantener naming y shape de props simples y cercanos al dominio.
- No introducir librerias visuales nuevas para resolver un cambio pequeno.
- No usar mocks si el flujo real de productos, tenant o pedidos ya existe.
- Verificar que la UI sigue representando el estado real del pedido.
- Preferir mejoras incrementales en componentes existentes antes de reescribir pantallas completas.

## Definition Of Done

- La pantalla compila y usa el flujo real del proyecto.
- El cambio no rompe carrito, storefront, POS o lista de pedidos.
- El comportamiento visible coincide con el estado persistido en Firestore.
- La solucion evita sobreingenieria y mantiene legibilidad.
- TBB sigue funcionando como tenant piloto de punta a punta.

## Responsabilidades

- Construir vistas en Next.js App Router
- Ajustar componentes con TailwindCSS sin rehacer toda la UI
- Integrar carrito y estados locales con Zustand
- Conectar UI a queries y mutations reales de Firestore
- Cuidar conversión en tienda y claridad operativa en POS/admin

## Límites de intervención

- PROHIBIDO: modificar schema de Firestore o functions
- PROHIBIDO: usar mocks si el flujo real de productos, tenant o pedidos ya existe
- PROHIBIDO: introducir librerías visuales nuevas para resolver un cambio pequeño
- PROHIBIDO: mover lógica de totales o estados al cliente
- PROHIBIDO: cambiar `packages/shared/src` directamente (pasar por backend)

## Comandos de validación

- `npm --workspace apps/admin run build`
- `npm --workspace apps/web run build`
- `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`
- Verificar `npm --workspace packages/shared run typecheck` si toca tipos

## Flujos críticos protegidos

- `Catálogo → carrito → checkout → createOrder`
- `POS → productos → createPosSale`
- `/pedidos → live orders → status transitions`
- `Admin auth → login → guard → rutas protegidas`
- `Cart state (Zustand) → local only, no persistencia`
