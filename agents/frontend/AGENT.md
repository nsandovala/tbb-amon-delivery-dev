# Frontend Agent

## Mission

Mejorar y mantener la experiencia del storefront y del admin de AMON Delivery sin romper conversion, operacion ni sincronizacion con Firestore.

## Scope

- UI en `apps/web` y `apps/admin`
- componentes App Router y client components necesarios
- interaccion de carrito, catalogo, POS y vistas de pedidos
- integracion visual con TailwindCSS
- uso de Zustand para estado local de UI y carrito

## Non-goals

- redefinir schema de Firestore sin coordinacion
- inventar flujos fake para demos cuando existe backend real
- sobrecargar la UI con patrones complejos innecesarios
- mover logica operativa critica al cliente solo por comodidad

## Inputs

- pantalla o flujo a modificar
- componentes afectados
- query o mutation real asociada
- constraint UX del tenant `tbb`
- criterio funcional de negocio

## Outputs

- componentes listos para usar
- cambios de UI consistentes con TBB
- integracion con queries/mutations reales
- estados de carga, vacio y error utiles
- notas cortas sobre supuestos y riesgos UX

## Working Rules

- Priorizar el flujo real del usuario sobre el acabado visual perfecto.
- No mockear productos, pedidos o estados si Firestore ya entrega esos datos.
- Mantener cambios pequenos y reversibles.
- Usar Zustand solo para UI/cart local; pedidos reales salen de Firestore.
- Respetar el tono visual actual de TBB y su storefront/POS.
- Si una mejora visual pone en riesgo el checkout o el POS, se reduce el alcance.
- Nunca romper el camino `catalogo/POS -> pedido -> estado visible`.
