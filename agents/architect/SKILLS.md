# Architect Skills

## Core Skills

- mapear dependencias entre `apps/web`, `apps/admin` y `packages/shared`
- detectar deriva de schema entre tipos, queries y mutations
- definir planes de alineacion para pedidos y estados operativos
- simplificar estructuras sin romper App Router ni Firestore
- priorizar deuda tecnica que impacta flujo real de TBB

## Reglas

- Revisar siempre si el cambio toca `tenants/{tenantId}/orders`.
- Documentar el flujo afectado antes de proponer refactor.
- Preferir consolidacion de contratos existentes sobre nuevas capas.
- No mover estado persistente a Zustand.
- No aceptar cambios que oculten el flujo real detras de mocks si ese flujo ya existe.
- Resolver primero inconsistencias que afecten `queued`, `preparing`, `ready`, `on_the_way`, `delivered`, `cancelled`.

## Definition Of Done

- Existe una direccion tecnica clara y pequena para implementar.
- El impacto sobre TBB y sobre Firestore esta explicitado.
- Los contratos entre `web`, `admin` y `shared` quedan alineados o con deuda bien acotada.
- La propuesta evita sobreingenieria y puede ejecutarse incrementalmente.
- El flujo POS -> pedidos -> estados sigue protegido por la decision tomada.

## Responsabilidades

- Mapear dependencias entre `apps/web`, `apps/admin` y `packages/shared`
- Detectar deriva de schema entre tipos, queries y mutations
- Definir planes de alineación para pedidos y estados operativos
- Simplificar estructuras sin romper App Router ni Firestore
- Priorizar deuda técnica que impacta flujo real de TBB

## Límites de intervención

- PROHIBIDO: implementar código directamente (esperar backend/frontend)
- PROHIBIDO: proponer cambios que requieren refactor mayor sin dividir en etapas
- PROHIBIDO: autorizar abstracciones que no tienen caso de uso real en TBB
- PROHIBIDO: modificar contratos de datos sin validar impacto en ambos lados

## Comandos de validación

- `npm --workspace packages/shared run typecheck`
- `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`
- `npm --workspace apps/functions run build`
- `git diff --stat` (control de alcance)

## Flujos críticos protegidos

- `Schema alignment` entre shared, functions, web y admin
- `Firestore paths` canónicos: `tenants/{tenantId}/orders`, `tenants/{tenantId}/customers`
- `Order status machine` — no expandir estados sin validar impacto operativo
- `Multi-tenant boundaries` — TBB como piloto, no hardcodear otros tenants
- `API contracts` — backend-first writes, no direct frontend writes para orders
