# TBB AMON Delivery

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)

> Backend-first multi-tenant ordering and operations platform for **AMON Delivery**.  
> Tenant piloto: **TBB — The Best Burger (Receta de la Abuela)**.

---

## Descripción

Plataforma de gestión de pedidos y operaciones para comercio gastronómico, construida sobre Firebase con arquitectura **backend-first**. El sistema abarca desde el storefront para clientes finales hasta un panel de administración con POS integrado.

## Características

- **Storefront** (`apps/web`) — Tienda online para clientes finales (Next.js)
- **Admin / POS** (`apps/admin`) — Panel de administración, gestión de pedidos y punto de venta (Next.js)
- **Backend API** (`apps/functions`) — API REST y lógica de negocio con Firebase Cloud Functions
- **Shared Contracts** (`packages/shared`) — Esquemas, tipos, seeds y utilidades compartidas

---

## Estado del Proyecto

### Funcionalidades Operativas

| Módulo | Estado |
|--------|--------|
| Storefront por tenant | Completado |
| Panel Admin / POS / Pedidos | Completado |
| Seeds para tenant `tbb` | Completado |
| Emuladores Firebase | Configurados |
| Arquitectura backend-first | Implementada |
| Contratos y playbooks | Documentados |

### En Desarrollo

- Migración de escrituras críticas desde frontend a Cloud Functions
- Fortalecimiento de reglas de seguridad de Firestore
- Consolidación de contratos compartidos
- Integración con bot de WhatsApp para gestión de pedidos

---

## Arquitectura

```
apps/
  web/          # Storefront cliente final (Next.js)
  admin/        # POS + pedidos + operaciones (Next.js)
  functions/    # Backend HTTP / Firebase Cloud Functions

packages/
  shared/       # Constantes, tipos, schemas, seeds, utilidades
```

### Principios de Diseño

| Principio | Descripción |
|-----------|-------------|
| **Firestore manda** | Firestore es la fuente de verdad. Zustand solo gestiona estado de UI/carrito. |
| **Backend-first** | Validación, reglas de negocio, cálculo y persistencia residen en el backend. |
| **No mocks innecesarios** | Si existe emulador, seed o colección real, no se crean mocks paralelos. |
| **Cambios incrementales** | Modificaciones pequeñas, reversibles y auditables. |
| **Single Firebase** | Desarrollo sobre `minerp-sentinel`, sin duplicar proyectos. |

---

## Flujo de Pedidos

```
storefront / POS / bot
  → Backend HTTP / Cloud Functions
  → Validación de payload
  → Escritura en Firestore
  → Lectura en tiempo real (admin)
  → Transición de estados
```

### Estados del Pedido

| Estado | Descripción |
|--------|-------------|
| `queued` | Pedido recibido, en cola |
| `preparing` | En preparación |
| `ready` | Listo para retiro/envío |
| `on_the_way` | En camino |
| `delivered` | Entregado |
| `cancelled` | Cancelado |

---

## Tenant Piloto: TBB

| Propiedad | Valor |
|-----------|-------|
| `tenantId` | `tbb` |
| `slug` | `tbb` |
| Moneda | CLP |
| Ciudad base | Valparaíso |
| Capacidades | pickup, delivery, assistant, addons, reviews |

---

## Quick Start

### Prerrequisitos

- Node.js >= 18
- npm >= 9
- Firebase CLI instalado globalmente

### Instalación

```bash
# Instalar dependencias
npm install
```

### Desarrollo

```bash
# Levantar emuladores + web + admin
npm run dev:all

# Solo emuladores Firebase
npm run dev:emulators

# Solo storefront
npm run dev:web

# Solo panel admin
npm run dev:admin

# Seed completo + stack
npm run dev:reset
```

### Seed del Tenant

```bash
# Insertar datos de prueba del tenant piloto
npm run seed
```

### Inicio Manual (Paso a Paso)

```bash
# 1. Emuladores Firebase
firebase emulators:start

# 2. Shared package
cd packages/shared && npm run typecheck && npm run build && npm run seed

# 3. Cloud Functions
cd apps/functions && npx tsc --noEmit && npm run build

# 4. Storefront
cd apps/web && npm run dev

# 5. Admin Panel
cd apps/admin && npm run dev
```

---

## Emuladores Firebase

| Emulador | Puerto |
|----------|--------|
| Firestore | `8080` |
| Auth | `9099` |
| UI Console | `4000` |

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev:web` | Inicia el storefront |
| `npm run dev:admin` | Inicia el panel admin |
| `npm run dev:emulators` | Inicia emuladores Firebase |
| `npm run dev:all` | Inicia emuladores + web + admin |
| `npm run dev:reset` | Ejecuta seed + stack completo |
| `npm run seed` | Inserta seed del tenant piloto |

---

## Reglas Operativas

> **Importante:** Las operaciones críticas **no** deben escribirse directamente desde el frontend.

Esto incluye:

- Creación de pedidos
- Ventas POS
- Cambios de estado de pedidos

**Flujo correcto:** El frontend envía un payload mínimo al backend, el cual valida, enriquece, calcula, persiste y responde.

---

## Documentación

| Tema | Archivo |
|------|---------|
| Project Overview | `context/project-overview.md` |
| Arquitectura | `context/architecture.md` |
| Decisiones | `context/decisions.md` |
| Sprint Actual | `context/current-sprint.md` |
| API Contracts | `contracts/api-contracts.md` |
| Firestore Collections | `contracts/firestore-collections.md` |
| Order Status Machine | `contracts/order-status.md` |
| Order JSON Schema | `contracts/order.schema.json` |
| Repo Rules | `playbooks/repo-rules.md` |
| Backend-first | `playbooks/backend-first.md` |
| Debugging Checklist | `playbooks/debugging-checklist.md` |
| Release Checklist | `playbooks/release-checklist.md` |
| Sprint Log | `roadmap/phase-log.md` |
| Backend Sprint | `roadmap/sprint-backend-1.md` |

---

## Licencia

Este proyecto está bajo la licencia MIT. Ver [LICENSE](LICENSE) para más detalles.
