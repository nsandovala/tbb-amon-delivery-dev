# AMON Delivery - Project Overview

## Resumen

AMON Delivery es una plataforma de pedidos para restaurantes y locales de comida.

En esta repo, el tenant piloto es `tbb` (`The Best Burger - Receta de la Abuela`), usado como entorno real de validación operativa para storefront, POS, panel operativo y flujo de pedidos.

La repo está organizada como monorepo con:

- `apps/web`: storefront de cliente final en Next.js App Router
- `apps/admin`: panel operativo y POS en Next.js
- `apps/functions`: backend HTTP/Cloud Functions para operaciones críticas
- `packages/shared`: contratos, constantes, schemas, seeds y utilidades compartidas

## Stack actual

- Next.js App Router
- React 19
- Firebase Firestore
- Firebase Functions / HTTP backend
- Zustand
- TailwindCSS
- Firebase Web SDK
- Firebase Admin SDK (solo backend)
- TypeScript
- Zod

## Fuente de verdad operativa

Firestore es la fuente de verdad operativa del sistema.

Eso implica:

- productos, tenants y pedidos viven en Firestore
- el frontend no debe ser la fuente de verdad de precios, estados ni totales
- Zustand se usa para UI state y estado efímero, no para reemplazar persistencia real
- `packages/shared` define contratos reutilizables entre frontend y backend
- seeds y stubs sirven para bootstrap o entorno controlado, no para reemplazar flujos reales

## Regla crítica actual

Las escrituras críticas del negocio deben pasar por backend.

Eso incluye:

- creación de pedidos desde storefront
- creación de ventas desde POS
- cambios de estado operativos

El frontend puede leer datos públicos o operativos según corresponda, pero no debe escribir directamente en Firestore en flujos críticos.

## Flujo crítico a preservar

`storefront / POS / bot -> backend HTTP -> validación -> escritura en Firestore -> lectura operativa live -> actualización de estados`

Secuencia objetivo:

1. El cliente o operador genera una intención de pedido/venta
2. El frontend envía payload mínimo al backend
3. El backend valida, enriquece, calcula y persiste
4. Firestore guarda el documento final
5. Web/admin consumen el estado real persistido
6. Los cambios de estado posteriores también pasan por backend

## Estados operativos

Estados válidos observables:

- `queued`
- `preparing`
- `ready`
- `on_the_way`
- `delivered`
- `cancelled`

No se deben introducir variantes paralelas del mismo concepto en otras capas.

## Tenant piloto TBB

Contexto útil:

- `tenantId`: `tbb`
- `slug`: `tbb`
- moneda: `CLP`
- ciudad base: Valparaíso
- capacidades activas: pickup, delivery, assistant, addons, reviews

TBB es el entorno de referencia para validar arquitectura, POS, storefront y operación real.

## Principios de implementación

- backend-first en flujos críticos
- cambios incrementales sobre flujo vivo
- no introducir mocks donde ya existe flujo real
- no duplicar contratos entre `web`, `admin`, `functions` y `shared`
- no mover lógica de negocio al frontend
- no editar artefactos compilados de `packages/shared/lib`
- fuente de edición: `packages/shared/src`

## Regla de capas

- `apps/web` y `apps/admin`: UI + fetch HTTP + lecturas permitidas
- `apps/functions`: validación, reglas, cálculo, persistencia
- `packages/shared`: constantes, tipos, schemas y contratos compartidos

## Límites prácticos para agentes

Antes de tocar un flujo de pedido:

1. revisar `packages/shared`
2. revisar `apps/functions`
3. revisar consumidores en `apps/web` y `apps/admin`

Antes de agregar un campo:

- validar si existe en Firestore
- validar si rompe schemas o lecturas
- validar si debe calcularlo backend

Antes de mockear:

- verificar si ya existe backend, emulador o datos reales que permitan probar el flujo