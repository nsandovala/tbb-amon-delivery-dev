# TBB AMON Delivery Dev

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Backend-first multi-tenant ordering and operations platform for **AMON Delivery**.  
Tenant piloto actual: **TBB — The Best Burger (Receta de la Abuela)**.

Esta repo valida un flujo operativo real para comercio gastronómico sobre Firebase, con foco en:

- **Storefront** (`apps/web`)
- **Admin / POS / Pedidos** (`apps/admin`)
- **Backend Functions API** (`apps/functions`)
- **Contratos, schemas y seeds compartidos** (`packages/shared`)

---

## Estado actual

### Operativo hoy
- storefront por tenant: `apps/web`
- panel admin / POS / pedidos: `apps/admin`
- seeds compartidos para tenant `tbb`
- emuladores Firebase configurados
- base backend-first iniciada
- contratos, contexto y playbooks base

### En progreso
- mover escrituras críticas desde frontend a backend Functions
- endurecer reglas de Firestore después del flujo e2e
- consolidar contratos compartidos
- puente bot / WhatsApp → Firestore orders

---

## Quick Start

```bash
# instalar dependencias
npm install

# seed del tenant piloto en emulador
npm run seed

# levantar emuladores + web + admin
npm run dev:all

# solo emuladores
npm run dev:emulators

Arquitectura rápida
apps/
  web/          # Storefront cliente final (Next.js)
  admin/        # POS + pedidos + operaciones (Next.js)
  functions/    # Backend HTTP / Firebase Functions

packages/
  shared/       # Constantes, tipos, schemas, seeds, utilidades

  Principios clave
  | Principio                            | Qué significa                                                           |
| ------------------------------------ | ----------------------------------------------------------------------- |
| **Firestore manda**                  | Firestore es estado operativo real. Zustand solo UI/cart state.         |
| **Backend-first**                    | Validación, reglas de negocio, cálculo y persistencia viven en backend. |
| **No mocks si ya existe flujo real** | Si existe emulador, seed o colección real, no se inventa mock paralelo. |
| **Cambios incrementales**            | Cambios pequeños, reversibles y auditables.                             |
| **Un solo Firebase**                 | Se trabaja sobre `minierp-sentinel`, sin duplicar proyectos por ahora.  |

Flujo crítico

storefront / POS / bot
→ backend HTTP / Functions
→ validación
→ escritura en Firestore
→ lectura live en admin
→ transición de estados

Estados operativos
queued
preparing
ready
on_the_way
delivered
cancelled

Tenant piloto: TBB
tenantId: tbb
slug: tbb
moneda: CLP
ciudad base: Valparaíso
capacidades activas: pickup, delivery, assistant, addons, reviews

Emuladores Firebase

| Emulator  | Puerto |
| --------- | ------ |
| Firestore | `8080` |
| Auth      | `9099` |
| UI        | `4000` |

Scripts útiles

| Comando                 | Descripción                    |
| ----------------------- | ------------------------------ |
| `npm run dev:web`       | levanta web                    |
| `npm run dev:admin`     | levanta admin                  |
| `npm run dev:emulators` | levanta emuladores             |
| `npm run seed`          | inserta seed del tenant piloto |
| `npm run dev:all`       | emuladores + web + admin       |
| `npm run dev:reset`     | seed + stack completo          |

Mapa de documentación

| Tema                  | Archivo                              |
| --------------------- | ------------------------------------ |
| Project overview      | `context/project-overview.md`        |
| Architecture          | `context/architecture.md`            |
| Decisions log         | `context/decisions.md`               |
| Current sprint        | `context/current-sprint.md`          |
| API contracts         | `contracts/api-contracts.md`         |
| Firestore collections | `contracts/firestore-collections.md` |
| Order status machine  | `contracts/order-status.md`          |
| Order JSON schema     | `contracts/order.schema.json`        |
| Repo rules            | `playbooks/repo-rules.md`            |
| Backend-first         | `playbooks/backend-first.md`         |
| Debugging checklist   | `playbooks/debugging-checklist.md`   |
| Release checklist     | `playbooks/release-checklist.md`     |
| Sprint log            | `roadmap/phase-log.md`               |
| Backend sprint        | `roadmap/sprint-backend-1.md`        |

Regla operativa importante

Las operaciones críticas no deben escribirse directo desde frontend.

Eso incluye:

creación de pedidos
ventas POS
cambio de estado de pedidos

El frontend debe enviar payload mínimo al backend.
El backend valida, enriquece, calcula, persiste y responde.

Licencia

MIT