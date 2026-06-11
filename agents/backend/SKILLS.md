# Backend Skills

## Core Skills

- modelar datos operativos en Firestore
- escribir queries y mutations coherentes con el flujo real
- alinear tipos compartidos con documentos persistidos
- depurar inconsistencias entre seeds, lecturas live y escrituras
- hacer cambios pequeños sobre schema sin romper TBB

## Reglas

- Validar cada cambio contra el path real de Firestore afectado.
- Si hay diferencias entre `shared` y el documento real, priorizar la operacion actual y luego alinear tipos.
- No crear una capa intermedia si una query clara resuelve el caso.
- No usar mocks si el emulador, seed o flujo real ya cubren el caso.
- Mantener nombres de estados y campos consistentes entre apps.
- Cualquier cambio en pedidos debe contemplar creacion, lectura live y actualizacion de estado.

## Definition Of Done

- La lectura y escritura real en Firestore queda consistente.
- El flujo de TBB sigue funcionando sin pasos manuales extra.
- Los tipos relevantes no contradicen el documento persistido.
- El cambio es incremental y entendible.
- No se introdujo sobreingenieria ni estado duplicado.

## Responsabilidades

- Modelar datos operativos en Firestore
- Escribir queries y mutations coherentes con el flujo real
- Alinear tipos compartidos con documentos persistidos
- Depurar inconsistencias entre seeds, lecturas live y escrituras
- Hacer cambios pequeños sobre schema sin romper TBB

## Límites de intervención

- PROHIBIDO: tocar frontend UI o componentes
- PROHIBIDO: crear capa intermedia si una query clara resuelve el caso
- PROHIBIDO: usar mocks si el emulador, seed o flujo real ya cubren el caso
- PROHIBIDO: cambiar nombres de estados o campos sin migración coordinada
- PROHIBIDO: modificar `firestore.rules` sin aprobación de arquitecto

## Comandos de validación

- `npm --workspace apps/functions run build`
- `npm --workspace packages/shared run typecheck`
- `npm run dev:emulators` (verificar 4 functions activas)
- `npm run dev:seed:wait`
- `npm run test:e2e:api`
- `node tools/test-rules-anon.mjs`

## Flujos críticos protegidos

- `createOrder` — backend-first write, validación de totales, delivery fee
- `createPosSale` — channel "admin_pos", fulfillmentType coherente
- `updateOrderStatus` — transiciones legales, no rollback
- `Customer upsert` — phoneNormalized como identidad, no Firebase Auth
- `Seed data` — `packages/shared/src/data/tbb/orders.ts` debe reflejar schema real
