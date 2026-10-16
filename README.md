# TBB AMON Delivery Dev

Plataforma multi-tenant para pedidos y operación de comercios gastronómicos, construida con Next.js, Firebase y TypeScript.

El tenant piloto es **TBB — The Best Burger (Receta de la Abuela)**, en Valparaíso, Chile. El repositorio incluye la tienda para clientes, el panel Admin con POS y pedidos, una API en Firebase Functions y contratos/seeds compartidos.

## Estado del proyecto

- **Tienda web** (`apps/web`): storefront del tenant piloto.
- **Admin** (`apps/admin`): pedidos, POS y control de operación.
- **API** (`apps/functions`): validaciones y operaciones de negocio mediante Functions.
- **Datos compartidos** (`packages/shared`): tipos, contratos y seed local.
- **Desarrollo local**: emuladores de Authentication, Firestore y Functions.

La sección **Operación** tiene un ciclo de polish de UI aprobado para modo claro y oscuro. Incluye identidad de tienda/local y operador, horario semanal, excepciones de fechas configurables, estado de tienda, caja y bitácora. Las excepciones se guardan por fecha y se aplican al aceptar pedidos; no se precarga automáticamente un calendario nacional de feriados. Proveedores y tareas siguen pendientes. El agendamiento de pedidos por hora solicitada está en backlog.

El siguiente orden de producto acordado es: **Operaciones → Métricas → Home**. Las ventas del seed son datos de demostración. La revisión del diseño en navegador local forma parte de la validación del sprint; este repositorio no se despliega automáticamente a producción.

## Inicio rápido

Requiere Node.js/npm y Firebase CLI.

```bash
npm install
# Terminal 1: iniciar emuladores, tienda y Admin
npm run dev:all
```

En otra terminal, carga los datos de demostración con `npm run seed`. También puedes usar `npm run dev:reset` para iniciar el stack y ejecutar el seed cuando Firestore esté disponible. Para iniciar cada aplicación por separado, usa `npm run dev:web`, `npm run dev:admin` y `npm run dev:emulators` en terminales distintas.

## Direcciones locales

| Servicio | URL |
| --- | --- |
| Tienda web | `http://localhost:3000` |
| Admin | `http://localhost:3001` |
| Firebase Emulator Suite | `http://127.0.0.1:4000` |
| Firebase Authentication | `http://127.0.0.1:9099` |
| Cloud Functions | `http://127.0.0.1:5001` |
| Firestore | `http://127.0.0.1:8080` |

El usuario administrador de desarrollo se crea mediante el seed local. Usa las credenciales de desarrollo documentadas por el equipo; no reutilices esas credenciales fuera de los emuladores.

## Scripts principales

| Comando | Descripción |
| --- | --- |
| `npm run dev:web` | Inicia la tienda web. |
| `npm run dev:admin` | Inicia el panel Admin. |
| `npm run dev:emulators` | Compila Functions e inicia los emuladores. |
| `npm run seed` | Carga tenant y datos de demostración en los emuladores. |
| `npm run dev:all` | Inicia emuladores, tienda y Admin. |
| `npm run dev:reset` | Inicia el stack y carga el seed al estar disponible Firestore. |
| `npm run test:e2e` | Ejecuta todas las pruebas Playwright. |
| `npm run test:e2e:api` | Ejecuta las pruebas de contratos API. |

## Arquitectura

```text
apps/
  web/          Tienda para clientes (Next.js)
  admin/        Admin, POS, pedidos y operaciones (Next.js)
  functions/    API HTTP y Firebase Functions

packages/
  shared/       Tipos, schemas, contratos y seed
```

En operaciones críticas, el backend valida y persiste el estado en Firestore. El cliente envía solicitudes a Functions; el panel Admin consulta el estado operativo y presenta las acciones disponibles.

## Emuladores Firebase

| Emulador | Puerto |
| --- | ---: |
| Authentication | `9099` |
| Firestore | `8080` |
| Functions | `5001` |
| Emulator Suite UI | `4000` |

El seed contiene datos locales de demostración. No representa ventas reales.

## Documentación

| Tema | Archivo |
| --- | --- |
| Descripción y contexto del proyecto | `context/project-overview.md` |
| Arquitectura | `context/architecture.md` |
| Decisiones | `context/decisions.md` |
| Sprint actual | `context/current-sprint.md` |
| Contratos API | `contracts/api-contracts.md` |
| Colecciones Firestore | `contracts/firestore-collections.md` |
| Contrato de operación de tienda | `docs/architecture/store-operation-contract.md` |
| Flujo de estados de pedidos | `contracts/order-status.md` |
| Registro de fases | `roadmap/phase-log.md` |
| Polish de Operaciones | `roadmap/sprint-operations-polish.md` |
| Lista de verificación de release | `playbooks/release-checklist.md` |

## Licencia

MIT
