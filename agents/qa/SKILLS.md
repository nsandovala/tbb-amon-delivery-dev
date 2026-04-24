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
