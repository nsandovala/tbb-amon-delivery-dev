# Sprint Backend 1

## Objetivo

Cerrar el flujo crítico real de pedidos y ventas con backend operativo, eliminando escrituras críticas directas desde frontend.

## Alcance

- consolidar contratos en `packages/shared`
- dejar `apps/functions` compilando y usando contratos compartidos
- migrar `web` y `admin` a clientes HTTP para pedidos/ventas/estados
- eliminar writes directos a Firestore en flujos críticos
- validar typecheck completo del monorepo operativo
- preparar base para endurecer Firestore Rules

## Bloques

### Bloque 1 — Shared
- consolidar constants y schemas
- exportar desde `packages/shared/src/index.ts`
- mantener `src/` como única fuente editable
- actualizar contratos compartidos de order/customer para reflejar persistencia real de `customerId` y `customerPhoneNormalized` en orders

### Bloque 2 — Functions
- usar `@amon/shared`
- calcular totales desde backend
- validar estados y transiciones
- exponer handlers HTTP operativos
- derivar delivery fee exclusivamente desde `fulfillmentType`
- persistir `customerId` y `customerPhoneNormalized` al crear orders
- crear/actualizar customers por teléfono normalizado en `tenants/{tenantId}/customers`

### Bloque 3 — Web/Admin
- crear clientes HTTP
- reemplazar mutaciones directas a Firestore
- mantener lecturas permitidas donde corresponda
- corregir type errors restantes
- endurecer checkout storefront para operación real
- dejar POS creando ventas reales contra backend

### Bloque 4 — Validación
- grep de writes directos
- build/typecheck shared
- typecheck functions
- typecheck admin
- typecheck web
- test e2e manual del flujo crítico

## Criterio de Done

- no quedan writes críticos directos en frontend
- `shared`, `functions`, `admin`, `web` compilan
- pedido real puede crearse y mutar estado por backend
- documentación base alineada al estado real

## Estado de cierre

- [x] backend-first operativo para orders
- [x] delivery fee canónico por `fulfillmentType`
- [x] storefront creando pedidos reales
- [x] POS creando ventas reales
- [x] stream live operativo en `/pedidos`
- [x] MVP de customers por teléfono implementado
- [x] persistencia de `customerId` y `customerPhoneNormalized` en orders
- [x] contratos compartidos actualizados
- [x] typecheck limpio en `shared`, `functions`, `web`, `admin`
- [x] no quedan writes críticos directos en frontend
- [x] POS `card` deshabilitado como "Próximamente"
- [x] `totalSalesToday` excluye órdenes `cancelled`

## Resultado final

La fase cierra con backend operativo como fuente de verdad para creación de pedidos, cálculo de totales y delivery fee, y con customer identity mínima basada en teléfono chileno normalizado. El tenant `tbb` ya puede:

- crear pedidos reales desde storefront;
- crear ventas reales desde POS;
- ver pedidos en vivo desde admin;
- acumular historial básico de customers en Firestore sin introducir login de cliente;
- mantener contratos compartidos alineados con la persistencia real;
- operar sin writes directos desde frontend en flujos críticos.

El árbol fue limpiado de writes legacy y validado para marcha blanca controlada.

## Riesgos post-cierre

- deriva de contratos entre capas (mitigado: audits periódicos)
- lecturas legacy usando imports rotos (resuelto)
- payloads frontend con lógica de negocio antigua (resuelto: backend recalcula todo)
- artefactos compilados confundidos con fuente (documentado)
