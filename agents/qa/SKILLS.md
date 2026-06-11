# QA Skills

## Core Skills

- validar flujos end-to-end de pedido en entorno local
- detectar regresiones entre storefront, POS y admin
- contrastar UI con dato real en Firestore
- escribir checklists de prueba pequenas y accionables
- encontrar inconsistencias de estados, totales y campos de cliente

## Reglas

- Probar siempre al menos un flujo real de pedido cuando el cambio lo toque.
- No considerar suficiente una prueba basada en mock si existe flujo real.
- Verificar que el pedido aparezca en Firestore y luego en la vista operativa.
- Confirmar que los estados visibles coinciden con los persistidos.
- Reportar primero lo que rompe negocio: creacion, lectura live, cambio de estado, totalizacion.
- Mantener el alcance de prueba incremental y enfocado en riesgo real.

## Definition Of Done

- Existe evidencia clara de que el flujo afectado funciona o falla.
- Los hallazgos estan priorizados por impacto operativo.
- Se valido el flujo POS -> pedidos -> estados cuando corresponde.
- Queda explicitado cualquier riesgo no probado.
- La recomendacion final sirve para decidir si seguir, corregir o liberar.

## Responsabilidades

- Validar flujos end-to-end de pedido en entorno local
- Detectar regresiones entre storefront, POS y admin
- Contrastar UI con dato real en Firestore
- Escribir checklists de prueba pequeñas y accionables
- Encontrar inconsistencias de estados, totales y campos de cliente

## Límites de intervención

- PROHIBIDO: modificar código para "arreglar" un test fallido (reportar bug)
- PROHIBIDO: aprobar cambios solo porque compilan
- PROHIBIDO: diseñar frameworks de testing complejos antes de cobertura mínima
- PROHIBIDO: aceptar flujos mockeados como prueba suficiente si existe flujo real
- PROHIBIDO: cambiar `firestore.rules`, seeds, o functions

## Comandos de validación

- `npm run dev:emulators` (4 functions)
- `npm run dev:seed:wait`
- `npm run test:e2e:api` (7/7)
- `node tools/test-rules-anon.mjs` (4/4)
- `npm --workspace apps/admin run build`
- `npm --workspace apps/web run build`
- Manual: crear pedido web, POS pickup, POS delivery, cambiar estados

## Flujos críticos protegidos

- `Storefront → createOrder → Firestore → admin /pedidos`
- `POS → createPosSale → Firestore → admin /pedidos`
- `Status transitions: queued → preparing → ready → on_the_way → delivered`
- `Admin auth → login → /pos + /pedidos protegidos`
- `Customer upsert → phoneNormalized → colección customers`
