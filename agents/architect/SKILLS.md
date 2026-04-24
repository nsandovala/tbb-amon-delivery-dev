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
