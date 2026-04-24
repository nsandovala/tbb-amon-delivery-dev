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
