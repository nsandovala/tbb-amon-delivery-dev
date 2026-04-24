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

### Bloque 2 — Functions
- usar `@amon/shared`
- calcular totales desde backend
- validar estados y transiciones
- exponer handlers HTTP operativos

### Bloque 3 — Web/Admin
- crear clientes HTTP
- reemplazar mutaciones directas a Firestore
- mantener lecturas permitidas donde corresponda
- corregir type errors restantes

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

## Riesgos

- deriva de contratos entre capas
- lecturas legacy usando imports rotos
- payloads frontend con lógica de negocio antigua
- artefactos compilados confundidos con fuente