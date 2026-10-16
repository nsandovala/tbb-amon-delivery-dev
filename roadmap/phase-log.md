# Phase Log

## 2026-10-16 — Mini sprint: correcciones de revisión de fechas especiales

### Qué cambió
- El aviso público de hoy refleja apertura/cierre manual efectivo; deja de mostrar como vigente la decisión de calendario que el operador reemplazó.
- `getStoreControl` lista todas las excepciones futuras, sin recortar a 365 días ni a 100 resultados. `getStoreStatus` conserva su ventana pública de 90 días y máximo 12 fechas.

### Por qué cambió
- La revisión del PR #74 detectó que una apertura manual podía aceptar pedidos mientras el aviso seguía diciendo “Cerrado”.
- El backend aceptaba excepciones futuras que el panel dejaba de listar después de un año o al superar 100 registros.

### Archivos modificados
- `apps/web/src/components/store/store-special-dates.tsx`
- `apps/web/src/lib/api/orders.ts`
- `apps/web/src/lib/store-special-date-notice.ts`
- `apps/functions/src/repositories/firestore-store.repo.ts`
- `apps/functions/src/services/store-operation.service.ts`
- `e2e/api/m6j-store-operation.contract.spec.ts`
- `e2e/unit/m6j-public-special-dates.spec.ts`
- `docs/architecture/store-operation-contract.md`
- `roadmap/phase-log.md`
- `roadmap/sprint-special-date-review-fixes.md`

### Contratos afectados
- `getStoreStatus` tipa explícitamente `override.mode` en la respuesta pública; no expone actor ni motivo.
- El listado de `getStoreControl` cubre todas las fechas futuras persistidas. No cambia el esquema Firestore ni las reglas de aceptación de pedidos.

### Validación
- Build de Functions: OK.
- Typecheck y build de Web: OK.
- Unitarias del monorepo: 87/87 OK, incluyendo los cuatro casos nuevos del aviso público.
- `git diff --check`: OK.
- Se añadió prueba API con 101 excepciones futuras y una fecha a más de 365 días; pendiente de correr contra emuladores porque esta estación no tiene Firebase CLI y no hay emuladores activos.

### Riesgos y siguiente paso
- El listado administrativo puede crecer con el tiempo; la colección contiene como máximo una excepción por fecha. Si el volumen operativo aumenta mucho, añadir paginación como sprint independiente.
- Ejecutar la prueba API desde la Mac con emuladores activos antes de merge. No hacer deploy; el proyecto Firebase destino sigue sujeto a confirmación explícita.

## 2026-10-16 — Ajustes visuales tras QA local

### Qué cambió
- El modo claro usa un fondo nieve mate y superficies opacas más suaves; se oscurecieron los textos secundarios para que se lean mejor.
- Se amplió la columna del horario para que los controles de hora no queden cortados en escritorio.
- La sección de fechas especiales ahora pregunta directamente si la tienda abrirá y explica que la decisión debe guardarse por fecha y comunicarse a clientes.

### Contratos y comportamiento
- No se agregó persistencia de excepciones ni cambios a la aceptación de pedidos. La sección sigue siendo informativa y marca la capacidad como pendiente.
- El horario semanal continúa guardándose con formato de 24 horas (`HH:mm`). En este caso corresponde mostrar `17:30–22:30`; `22:30 p. m.` mezcla formatos y no es correcto.

### Validación
- Revisar en navegador local el modo claro, los controles de hora y el ancho móvil después de traer este commit.
- No desplegar hasta definir el proyecto Firebase piloto.

## 2026-10-16 — Revisión visual aprobada: Operaciones

### Qué cambió
- `/operacion` ahora identifica el tenant/local y ubicación leyendo el documento real `tenants/tbb`; identifica al operador con el correo de la sesión Firebase y el rol admin ya verificado por `AdminGuard`.
- Se añadió selector de modo claro/oscuro, con preferencia local persistida en el navegador y modo oscuro como valor inicial.
- Se reemplazó el eje horario que se superponía por una tabla semanal legible y adaptable, con apertura/cierre editables por día y estado explícito de cerrado.
- Caja queda compacta y plegada inicialmente; la bitácora está inmediatamente debajo, muestra cinco movimientos recientes y permite expandir hasta los 25 que entrega el endpoint actual.
- Fechas operacionales y de bitácora se presentan como `DD/MM/AAAA`; los contratos y valores internos ISO no cambian.
- Se añadieron estados vacíos explícitos para feriados/excepciones, proveedores y acciones por hacer. No se simulan registros que todavía no existen.

### Por qué cambió
- Nelson aprobó el mockup y pidió saber en todo momento qué tienda está operando y quién tiene la sesión activa.
- Las etiquetas de horas del eje anterior se solapaban en pantallas reales; la tabla expresa el horario sin una escala ilegible.
- La caja y la bitácora deben ocupar una columna compacta y el calendario debe ser la superficie principal.

### Archivos modificados
- `apps/admin/src/app/operacion/page.tsx`
- `apps/admin/src/app/globals.css`
- `apps/admin/src/components/operation/{store-panel,cash-panel,schedule-editor,audit-log}.tsx`
- `apps/admin/src/lib/{store-status,schedule}.ts`
- `e2e/unit/m6j-control-room.spec.ts`
- `roadmap/phase-log.md`
- `roadmap/sprint-operations-polish.md`

### Contratos afectados
- Ningún contrato de Functions, Firestore, autenticación, horario o cierre de caja cambia.
- `operationalDate` y `atLocal` conservan ISO en backend; solo cambia su formato de presentación.
- El tenant no contiene razón social separada: la UI muestra el nombre real del tenant y su comuna/ciudad; no inventa un nombre legal.
- No hay modelo persistente/API para feriados, proveedores ni tareas. Sus secciones quedan como estados vacíos honestos hasta diseñar esos módulos.
- El endpoint actual limita la bitácora a 25 eventos; expandir la UI revela ese máximo, no pagina histórico.

### Validación
```bash
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
npm --workspace apps/admin run build
npx playwright test e2e/unit/m6j-control-room.spec.ts e2e/unit/m6j-store-hours.spec.ts --config=playwright.config.ts
git diff --check
```

- Typecheck de Admin: OK.
- Build de Admin: OK.
- Unitarias de Operaciones/horario: 51/51 OK.
- Revisión visual de escritorio/móvil en navegador: pendiente.

### Riesgos y siguiente paso
- El modo claro se limita al área de Operaciones; la navegación global de Admin mantiene el tema existente.
- Feriados/excepciones, proveedores y tareas requieren contrato de datos/API antes de volverse editables.
- El cambio se publica en la rama de revisión autorizada para que Nelson haga QA visual local de ambos temas y anchos móvil/desktop. No desplegar: el proyecto Firebase destino sigue sin confirmarse.

## 2026-10-16 — Inicio del sprint de polish de Operaciones

### Qué cambió
- `/operacion`: primera pasada del editor de horario semanal. La escala ahora cubre 00:00–24:00, los campos de apertura/cierre quedan fuera de la barra de disponibilidad y los días cerrados desactivan sus campos sin borrar sus horas.
- Se redujeron los radios grandes de tarjetas y controles en la sala de operaciones para dar jerarquía más nítida a estado, horario, caja y bitácora.
- La validación visual rechaza horas fuera de rango, intervalos sin duración y avisos de cierre fuera de 0–120 minutos antes de llamar a Functions.
- Se alineó una expectativa de prueba de cierre de caja con el contrato vigente: pedidos web/WhatsApp activos también bloquean el cierre.

### Por qué cambió
- La vista anterior comenzaba a las 08:00 aunque el contrato acepta horas desde 00:00. Además, los campos de hora dentro de una barra corta podían quedar recortados.
- El usuario indicó que Operaciones requiere polish y que el calendario actual no satisface la expectativa. Métricas y Home siguen sin aprobación y están planificados para sprints posteriores.

### Archivos modificados
- `apps/admin/src/components/operation/schedule-editor.tsx`
- `apps/admin/src/components/operation/{store-panel,cash-panel,audit-log}.tsx`
- `apps/admin/src/app/operacion/page.tsx`
- `apps/admin/src/lib/schedule.ts` (nuevo)
- `e2e/unit/m6j-control-room.spec.ts`
- `e2e/unit/m6j-store-hours.spec.ts`
- `roadmap/sprint-operations-polish.md` (nuevo)
- `roadmap/phase-log.md`

### Contratos afectados
- Ninguno. Se preserva el endpoint `updateStoreHours`, el contrato de horario y la regla de no cruzar medianoche.
- Sin cambios a Firebase, seed, autenticación, ventas o despliegue.

### Validación
```bash
npm --workspace apps/admin run build
npx playwright test e2e/unit/m6j-control-room.spec.ts e2e/unit/m6j-store-hours.spec.ts --config=playwright.config.ts
git diff --check
```

- Build de Admin: OK.
- Pruebas de horario y sala de control: 51/51 OK.
- `git diff --check`: OK.
- El primer pase de pruebas detectó una expectativa obsoleta sobre pedidos web activos; se alineó con el bloqueo definido en el contrato y se volvió a ejecutar la suite.

### Riesgos y siguiente paso
- Falta una revisión visual real de `/operacion` en navegador, escritorio y móvil.
- Este es el primer incremento del sprint; revisar después la jerarquía de caja/bitácora. Métricas va después de cerrar Operaciones y Home después de Métricas.

## 2026-10-16 — Excepciones de fechas en Operaciones

### Qué cambió
- Se añadieron excepciones por fecha para permanecer cerrado, operar con el horario semanal o usar horas especiales, con mensaje opcional a clientes.
- Functions guarda las excepciones en `tenants/{tenantId}/storeExceptions/{YYYY-MM-DD}`, las audita y las aplica dentro del guard transaccional de pedidos Web y POS.
- El Admin permite crear, editar y eliminar excepciones de hoy y fechas futuras. La tienda informa la atención de hoy y las próximas fechas configuradas.
- Se documentó que feriados se ingresan manualmente por local; no hay importación automática del calendario nacional.

### Alcance de cierre
- Con esta capacidad queda cubierta la pasada funcional de calendario dentro de Operaciones. Proveedores y tareas quedan para después, según el orden acordado; el agendamiento de pedidos se mantiene en backlog.
- No se despliega a Firebase. Revisar el cambio local y confirmar el proyecto Firebase piloto antes de cualquier despliegue.

### Validación
- `npm --prefix apps/functions run build`: OK.
- `npm --workspace apps/admin run build`: OK.
- `npm --workspace apps/web run build`: OK.
- `npx playwright test e2e/unit/m6j-store-hours.spec.ts --config=playwright.config.ts`: 44/44 OK.
- `e2e/api/m6j-store-operation.contract.spec.ts`: no ejecutable en este entorno porque el emulador Firestore `127.0.0.1:8080` no estaba levantado; se dejó cobertura para auth, persistencia, respuesta pública y rechazo Web/POS.
- `git diff --check`: OK.

## Fase actual
M6J — horario operativo fail-closed, operación manual auditada y cierre de caja

## 2026-10-15 — M6J: horario operativo, apertura/cierre manual y cierre de caja

### Qué cambió
- Correcciones de revisión M6J: el cierre de caja ahora es una frontera financiera real; gastos y cambios de estado de pedidos leen `cashCloses/{operationalDate}` dentro de la misma transacción y se rechazan después del cierre. `getStoreStatus` público quedó en lectura pura, `resume_schedule` conserva su evento específico y la configuración acepta solo `America/Santiago`, único timezone soportado por la fecha operacional actual.
- Horario editable por día en `tenants/{tenantId}/settings/storeHours` (inicial TBB: 17:30–22:30, `America/Santiago`, DST real vía Intl).
- Evaluador puro `apps/functions/src/lib/store-hours.ts` con 6 estados (`scheduled_open`, `closing`, `manual_open`, `scheduled_closed`, `manual_closed`, `closed`) y fail-closed ante config ausente/inválida/no evaluable.
- `createOrder` y `createPosSale` validan el estado dentro de la misma transacción del correlativo → `409 STORE_CLOSED`. Un cierre manual bloquea de inmediato; no se cancelan pedidos ni cambia la máquina de estados.
- Override manual del día (`open` / `close` / `resume_schedule`) con motivo, actor y estados previo/nuevo en `storeEvents` (append-only). Cambios por horario se auditan con `source: "schedule"` al observarse.
- Cierre de caja separado del cierre de tienda: `cashCloses/{operationalDate}` inmutable e idempotente (`idempotencyKey`), con efectivo esperado/contado, transferencias, pendientes, gastos activos y diferencias. `pending` nunca es dinero recibido. Ventas POS activas o pagos pendientes bloquean salvo override auditado.
- Endpoints admin verifican ID token con claim `admin` (mismo claim que rules/AdminGuard).
- Admin: nueva sala de control `/operacion` (estado verde/ámbar/rojo, hora oficial de la tienda, próxima apertura/cierre, acción manual, horario semanal, bitácora, caja en zona separada) y franja de estado en `/pos` y `/pedidos`.
- Web: el checkout muestra “La tienda está cerrada” ante `STORE_CLOSED` (el backend sigue siendo quien decide).
- Seed crea `settings/storeHours` solo si no existe.
- Las suites API usan tenants fixture aislados (`e2e/support/emulator-fixtures.ts`); ya no escriben en `tbb`, salvo el test existente que verifica el tenant por defecto de `createExpense`.

### Por qué cambió
- TBB necesita aceptar pedidos solo en horario operativo y poder cerrar antes sin depender del frontend.
- El cierre financiero debía registrarse sin confundir ventas creadas, pagos pendientes y dinero recibido.

### Archivos modificados
- Functions: `lib/store-hours.ts` (nuevo), `lib/cash-close.ts` (nuevo), `lib/admin-auth.ts` (nuevo), `lib/errors.ts`, `lib/firebase-admin.ts`, `repositories/firestore-store.repo.ts` (nuevo), `repositories/firestore-orders.repo.ts`, `services/store-operation.service.ts` (nuevo), `services/cash-close.service.ts` (nuevo), `services/orders.service.ts`, `services/pos.service.ts`, `routes/store.ts` (nuevo), `routes/orders.ts`, `routes/pos.ts`, `index.ts`
- Shared: `types/store-operation.ts` (nuevo), `data/tbb/store-hours.ts` (nuevo), `index.ts`, `seed.ts`
- Admin: `app/operacion/{layout,page}.tsx` (nuevos), `components/operation/*` (nuevos), `components/store-status-strip.tsx` (nuevo), `hooks/use-store-status.ts` (nuevo), `lib/api/store.ts` (nuevo), `lib/store-status.ts` (nuevo), `app/layout.tsx`, `app/pos/page.tsx`, `app/pedidos/page.tsx`
- Web: `lib/api/orders.ts`, `components/cart/cart-summary.tsx`
- Tests: `e2e/unit/m6j-store-hours.spec.ts`, `e2e/unit/m6j-control-room.spec.ts`, `e2e/api/m6j-store-operation.contract.spec.ts`, `e2e/support/emulator-fixtures.ts` (nuevos); `e2e/api/orders.contract.spec.ts`, `e2e/api/expenses.contract.spec.ts` (tenant fixture)
- Docs: `docs/architecture/store-operation-contract.md` (nuevo), `contracts/api-contracts.md`, `contracts/firestore-collections.md`, `docs/architecture/customer-order-contract.md`, `roadmap/phase-log.md`

### Contratos afectados
- Mutaciones posteriores a un cierre de caja retornan `409 CONFLICT` y no alteran la jornada cerrada. `getStoreStatus` ya no escribe `storeEvents` ni `settings/storeOperation`.
- `createOrder` / `createPosSale`: nuevo rechazo `409 STORE_CLOSED`. El payload y el documento de pedido no cambian.
- Nuevos paths Firestore: `settings/storeHours`, `settings/storeOperation`, `storeEvents`, `cashCloses`. Rules sin cambios.
- `AppError` acepta `details`; las rutas de orders/POS lo exponen en la respuesta de error.
- Shop → ERP (`contracts/financial-events.md`): sin cambios.

### Validación
```bash
npx playwright test e2e/unit --config=playwright.config.ts      # 78/78
npx playwright test e2e/api --config=playwright.config.ts       # 38/38 contra emulador
npm --workspace packages/shared run build                        # OK
npm --workspace packages/shared run typecheck                    # OK
npm --prefix apps/functions run build                            # OK
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit     # OK
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit       # OK
git diff --check                                                 # OK
```

Regresiones añadidas para los hallazgos P1/P2: endpoint público sin escrituras, timezone no soportado, auditoría de `resume_schedule` y bloqueo de gasto posterior al cierre.

### Riesgos restantes
- Despliegue sin `settings/storeHours` = tienda cerrada (fail-closed intencional). Crear el horario antes de desplegar.
- Los 7 días quedan activos por defecto; TBB debe confirmar los días de atención reales.
- No hay flujo para saldar pagos `pending`: cerrar caja con pendientes siempre requiere override.
- Endpoints existentes (`createPosSale`, `updateOrderStatus`, `createExpense`) siguen sin auth.
- Los eventos de horario se registran al observarse (polling admin/storefront), no en el segundo exacto del borde.
- QA visual en navegador pendiente (sin sesión admin en el emulador de Auth del navegador).
- La protección de `updateOrderStatus` usa el `operationalDate` persistido en cada pedido; los pedidos legacy sin ese campo no pueden asociarse a una jornada cerrada por esta barrera y requieren migración/normalización antes de producción.

### Próximo paso
- QA manual de `/operacion`, `/pos` y checkout con emulador y usuario admin (`tools/set-admin-claim.mjs`).
- Confirmar con operación los días activos de TBB y ajustar el horario desde `/operacion`.

## 2026-10-15 — Mini-sprint hardening M6J: cierre de caja y frontera temporal

### Correcciones de revisión del PR #73

- El contrato Admin incorpora `ACTIVE_OTHER_ORDERS` y lo presenta como “Pedidos web/WhatsApp activos”. Los pedidos activos de cualquier canal bloquean el cierre y no se pueden saltar con override; los pagos `pending` siguen siendo el único bloqueo anulable mediante motivo auditado.
- `createOrder` y `createPosSale` ahora reenvían el `capturedNow` del repositorio al guard de tienda. Así `operationalDate` y la evaluación de horario usan exactamente el mismo instante, incluso en los límites de horario o del corte de las 05:00.
- La documentación canónica de `docs/architecture/store-operation-contract.md` quedó alineada con el contrato real: bloqueo de todos los pedidos activos, excepción limitada a pagos pendientes y diagrama de la frontera temporal.

### Validación y Release Gate

- Validar en CI el typecheck/build de Functions, Admin y Web, además de las suites unitarias y API del PR #73.
- El emulador local existente no se reinicia durante este mini-sprint para preservar sus datos; la validación API definitiva debe ejecutarse con un proceso de Functions fresco.

## 2026-08-26 — M6H: QA checkout web + formulario cliente POS

### Qué cambió

- Checkout web mantiene `Confirmar pedido` accionable para explicar validaciones y usa el proxy same-origin local por defecto en desarrollo cuando no hay Functions base URL explícita.
- Backend y shared rechazan con `400` un `createOrder` delivery sin dirección; teléfonos delivery inválidos ahora producen `ValidationError` (`400`) en vez de un error genérico (`500`).
- POS reemplaza la sincronización reactiva defectuosa del nombre por modos explícitos `counter`/`details`.
- Borrar nombre o teléfono en pickup ya no repone `Cliente mostrador` dentro del input ni bloquea la venta; el payload conserva un nombre operativo y solo envía teléfono en modo con datos.
- Se agregaron contratos E2E para los seis casos mínimos M6H.

### Por qué cambió

- M6F introdujo un efecto dependiente de `customerName` que reescribía el mismo estado al vaciar el campo.
- El checkout ocultaba el diagnóstico detrás de un botón nativamente deshabilitado.
- El contrato backend no aplicaba la regla de dirección obligatoria a delivery web, aunque la UI sí la previsualizaba.
- La selección del proxy local dependía enteramente de env y podía recaer en una URL cross-origin bloqueada por PNA/CORS.

### Archivos modificados

- `apps/web/src/components/cart/cart-summary.tsx`
- `apps/web/src/lib/api/orders.ts`
- `apps/admin/src/app/pos/page.tsx`
- `apps/functions/src/schemas/order.shared.ts`
- `apps/functions/src/services/orders.service.ts`
- `apps/functions/src/services/pos.service.ts`
- `packages/shared/src/schemas/order.schema.ts`
- `e2e/api/orders.contract.spec.ts`
- `docs/architecture/customer-order-contract.md`
- `roadmap/phase-log.md`
- `docs/agent-sessions/2026-08-26/codex-m6h-checkout-pos-form.md`

### Contratos afectados

- `createOrder`: delivery requiere nombre, teléfono y dirección; validaciones de cliente retornan `400`.
- `createPosSale`: pickup mostrador no requiere teléfono ni crea customer; delivery exige nombre, teléfono y dirección.
- Customer upsert POS: se mantiene únicamente cuando el teléfono normaliza.
- Order numbering: pedidos nuevos conservan `displayOrderNumber`, `displayCode` y `operationalDate` generados por backend.

### Validación

```bash
npm run build --workspace packages/shared   # OK
npm run build --prefix apps/functions       # OK
npm run build --workspace apps/admin        # OK
npm run build --workspace apps/web          # OK adicional
npm run test:e2e:api                        # OK, 22/22
node tools/test-rules-anon.mjs               # OK, 6/6
```

Smoke HTTP local: `/tienda/tbb`, `/pos`, `/pedidos`, `/gastos` y `/metricas` respondieron `200`.
Smoke por proxy same-origin: pedido web delivery `201` (`Pedido #009`), web pickup `201` (`#010`), POS mostrador `201` (`#011`) y `Cerrar venta` dejó la POS en `delivered`.

### Riesgos restantes

- El navegador integrado no estuvo disponible; queda pendiente repetir visualmente los ocho pasos. Los flujos HTTP/proxy equivalentes sí pasaron contra emulator.
- `startOfDay` del POS continúa congelado al montar el componente; no cambió en M6H.
- Firestore rules no fueron modificadas.
- 2MUCH, ERP/outbox, catálogo, clientes y configuración permanecieron congelados.

### Siguiente paso

- Ejecutar QA visual/manual con navegador disponible y aprobar commit M6H si los ocho pasos pasan.

## 2026-07-12 — R1/R2: cierre de venta presencial y máquina de estados

### Módulo
Preparación para congelar `contracts/financial-events.md`. No se implementó outbox ni ERP.

### Archivos modificados
- `contracts/order-status.md` — corrige la tabla de transiciones inválidas y declara `ILLEGAL_TRANSITIONS` (backend) como única fuente de enforcement.
- `apps/admin/src/app/pedidos/page.tsx` — botón "Cerrar venta" para órdenes `channel === "admin_pos"` en estado activo.
- `apps/admin/src/app/pos/page.tsx` — panel "Ventas sin cerrar" con contador y cierre de un clic.
- `contracts/financial-events.md` — cierra R1 (§3.0.1) y R2 (§4.2) en el checklist de congelamiento.

Sin cambios en Functions, `paymentStatus`, Firestore rules, `/gastos` ni `/metricas`.

### Hallazgo raíz
La máquina de estados vivía en **tres lugares que se contradecían**:

| Fuente | `delivered → cancelled` | `queued → delivered` |
|---|---|---|
| `order.shared.ts` (backend, el que valida) | legal | legal |
| `pedidos/page.tsx` (allowlist de UI) | bloqueado | bloqueado |
| `contracts/order-status.md` (doc) | "inválido" | "inválido" |

`ILLEGAL_TRANSITIONS.queued = []` significa que **cualquier salto hacia adelante ya era legal**.
El documento estaba equivocado, no el código.

### Decisión R1 — cierre manual, no auto-`delivered`
Se descartó que `createPosSale` cree la orden en `delivered`, porque: rompe la cola de cocina (el
POS alimenta `/pedidos`), el POS también crea pedidos `delivery` (marcaría como entregada comida
que no salió del camión), le rompe el significado a `occurred_at` para el ERP, y reconoce ingreso
antes de que el producto exista.

La modificación mínima resultó ser **solo de UI**: la transición ya era legal, faltaba el
afordance. Botón "Cerrar venta" en `/pedidos` y `/pos`, filtrado por `channel === "admin_pos"`
para que un pedido web no pueda cerrarse saltándose la cocina.

### Decisión R2 — solo documentación
`delivered → cancelled` ya era legal en el backend. Se corrigió el doc. **No** se agregó botón de
anulación: emitir `order.cancelled` no sirve hasta que exista el consumidor ERP.

### Contratos afectados
- `contracts/order-status.md` — corregido para reflejar el backend real (no cambia comportamiento).
- `contracts/financial-events.md` — R1/R2 cerrados; sigue **sin congelar** por R3.
- Sin cambios en el contrato de orders, schemas ni Functions.

### Validaciones ejecutadas
```bash
npm --workspace apps/admin run build   # OK (/pedidos 6.62 kB, /pos 8.09 kB)
npm --prefix apps/functions run build  # OK
npm run test:e2e:api                   # 16 passed
node tools/test-rules-anon.mjs         # 6/6
git diff --check                       # limpio
```
Verificado contra el emulador (no solo por lectura de código):
- `createPosSale` → orden `queued` / `admin_pos`
- `PATCH updateOrderStatus` `queued → delivered` → **200**, `statusChangedAt` estampado
- `delivered → cancelled` → **200** (confirma R2)
- `cancelled → preparing` → **409**

### Riesgos restantes
- **El operador puede olvidar cerrar la venta.** Es el costo de elegir cierre manual: una venta sin
  cerrar es plata que la contabilidad nunca verá. El panel ámbar con contador lo hace difícil de
  ignorar, no imposible. La alerta Sentinel *"órdenes `admin_pos` activas > N horas"* queda como
  **condición bloqueante** para congelar el ERP.
- El cierre de un clic salta `preparing`/`ready`, así que esos contadores en `/pedidos` dejan de
  representar el trabajo real del camión.
- El backend permite `queued → delivered` para cualquier canal vía API directa (no hay ruta de UI).
  Es el status quo, no un riesgo nuevo.
- **R3 abierto:** `paymentStatus` sigue muerto (se escribe `"pending"` al crear y nada lo actualiza).
  `delivered` prueba entrega, no cobro.

### Siguiente paso
Cerrar R3 y la alerta Sentinel antes de congelar el contrato ERP.

## 2026-07-12 — M6C: pantalla admin `/gastos`

### Módulo
Registro de gastos operativos TBB/Foodtruck en `apps/admin`. Cierra el frontend del
endpoint `createExpense` entregado en `23fc424`.

### Archivos modificados
- `apps/admin/src/lib/api/expenses.ts` — nuevo. `createExpenseApi` contra la Function `createExpense`, con el mismo patrón emulator/`NEXT_PUBLIC_FUNCTIONS_BASE_URL` que `lib/api/orders.ts`.
- `apps/admin/src/lib/firebase/queries/expenses.ts` — nuevo. Tipo `AdminExpense` + labels de categoría y método de pago.
- `apps/admin/src/hooks/use-live-expenses.ts` — nuevo. Lectura live de `tenants/tbb/expenses`.
- `apps/admin/src/app/gastos/layout.tsx` — nuevo. Protege la ruta con `AdminGuard`.
- `apps/admin/src/app/gastos/page.tsx` — nuevo. Formulario (category, description, amount, paymentMethod, occurredAt opcional, notes opcional) + listado de últimos gastos.
- `apps/admin/src/app/layout.tsx` — activa el link real "Gastos" en el nav.

### Decisión
El formulario **no escribe directo a Firestore**: llama a la Function `createExpense`,
que es el único write path (las rules niegan writes de cliente sobre `expenses`).
El listado **sí lee directo** Firestore, porque las rules ya restringen `read` a admin.
El listado ordena por `occurredAt` y no por `createdAt`, porque el operador puede
backdatear un gasto que registra tarde y `createdAt` no reflejaría la línea de tiempo real.

Sin hard delete, sin anulación y sin dashboard de métricas: quedan fuera de M6C.

### Contratos afectados
- Ninguno nuevo. Consume el contrato existente de `createExpense` (`apps/functions/src/schemas/expense.schema.ts`) sin modificarlo.
- Sin cambios en Firestore rules, schemas, Functions, storefront, POS ni pedidos (salvo el link de navegación).

### Validaciones ejecutadas
```bash
npm --workspace apps/admin run build   # OK (/gastos 4.83 kB)
npm --prefix apps/functions run build  # OK
npm run test:e2e:api                   # 16 passed (orders + expenses)
node tools/test-rules-anon.mjs         # 6/6
git diff --check                       # limpio
```

### Hallazgo de entorno (no es bug de código)
La primera corrida de `test:e2e:api` falló 9/16: **todos** los tests que escriben en
Firestore colgaban ~60s, mientras los de validación (400/405) pasaban. Causa: la
instancia del emulador Firestore había quedado trabada en el arranque (aceptaba TCP en
8080 pero no servía; `firestore-debug.log` en 0 bytes). No es Java 25 — el JAR corre
bien standalone con los mismos args. Se resolvió matando el stack de emuladores y
reiniciando limpio + `npm run seed` (los tests de orders necesitan catálogo sembrado).
Si `test:e2e:api` vuelve a fallar solo en los happy-path, sospechar primero del emulador.

### Riesgos restantes
- `apiFetch` quedó duplicado entre `lib/api/orders.ts` y `lib/api/expenses.ts`. No se
  extrajo a un helper común para no tocar el path de POS/pedidos en esta fase.
- La lista está capada a 50 gastos y sin filtro por fecha/categoría: suficiente para
  marcha blanca, insuficiente cuando el volumen crezca.
- No hay edición, anulación ni borrado de gastos: un gasto mal cargado solo se puede
  corregir desde backend.

### Siguiente paso
Validación manual de Nelson en `/gastos` con sesión admin (claim `admin: true`).

## 2026-06-11 — Catálogo TBB sincronizado con menú de marcha blanca

### Módulo
Seed de catálogo TBB (`packages/shared/src/data/tbb`) para storefront y POS.

### Archivos modificados
- `packages/shared/src/data/tbb/products.ts` — sincroniza productos, combos, promociones y precios con el menú final de marcha blanca.
- `packages/shared/src/data/tbb/categories.ts` — agrega categoría de combos y renombra categorías visibles manteniendo IDs operativos.

### Decisión
La fuente comercial final de TBB debe quedar en el seed de Firestore, porque storefront y POS leen productos desde `tenants/tbb/products`. No se tocó lógica de Functions, Admin, Web, reglas ni estilos.

### Contratos afectados
- Catálogo seedado de productos y categorías para `tenants/tbb/products` y `tenants/tbb/categories`.
- Sin cambios en contrato de orders, customers, estados, delivery fee ni reglas.

### Validaciones ejecutadas
```bash
npm --prefix packages/shared run build  # OK
npm run seed                            # OK contra emulator
npm run test:e2e:api                    # 7 passed
node tools/test-rules-anon.mjs          # 4/4
```

### Riesgos restantes
- `packages/shared/src/data/tbb/modifiers.ts` mantiene `papas-kaioken-addon` en 1500; no se modificó porque esta fase se acotó a `products.ts` y `categories.ts`.
- Los pedidos demo en `packages/shared/src/data/tbb/orders.ts` mantienen precios históricos; no afectan el cálculo backend de pedidos nuevos.

### Siguiente paso
Validación manual de Nelson en `/tienda/tbb`, `/pos` y `/pedidos` tras seed local.

## 2026-06-06 — Frontend/API wiring audit: fix UI → Functions Emulator

### Módulo
Auditoría de conexión UI → Firebase Functions Emulator. Diagnóstico y patch mínimo para `Failed to fetch` en Brave/Chromium.

### Archivos modificados
- `apps/web/next.config.ts` — agrega `rewrites` proxy same-origin a `/api/functions/:path*` → `http://127.0.0.1:5001/minerp-sentinel/us-central1/:path*`.
- `apps/admin/next.config.ts` — igual que web.
- `apps/web/src/lib/api/orders.ts` — `FUNCTIONS_BASE` usa `/api/functions` cuando `NEXT_PUBLIC_USE_EMULATOR=true`.
- `apps/admin/src/lib/api/orders.ts` — igual que web.

### Decisión
Los helpers frontend ya construían la URL correcta (`http://127.0.0.1:5001/minerp-sentinel/us-central1/...`) y los `.env.local` estaban bien configurados. El backend pasaba E2E y respondía correctamente a `curl` directo. El problema era que el navegador (Brave/Chromium) bloquea cross-origin requests a `127.0.0.1:5001` desde `localhost:3000/3001` por **Private Network Access (PNA)** / **Brave Shields**, causando `TypeError: Failed to fetch`. Los tests E2E no usan el navegador, por eso pasaban. El fix mínimo sin tocar backend es un proxy same-origin en Next.js (`rewrites` + ruta relativa `/api/functions`), evitando CORS y PNA por completo.

### Validaciones ejecutadas
```bash
npm --workspace apps/web run build     # OK
npm --workspace apps/admin run build   # OK
npm run test:e2e:api                   # 5 passed
```
Pruebas manuales vía proxy:
- `POST /api/functions/createOrder` → 201
- `POST /api/functions/createPosSale` → 201
- `PATCH /api/functions/updateOrderStatus?orderId=...` → 200

### Riesgos reales corregidos
1. `Failed to fetch` en storefront al confirmar pedido → corregido via proxy same-origin.
2. `Failed to fetch` en POS al confirmar venta → corregido via proxy same-origin.
3. `Failed to fetch` en `/pedidos` al cambiar estado → corregido via proxy same-origin.

### Riesgos abiertos aceptados
- El proxy solo se activa cuando `NEXT_PUBLIC_USE_EMULATOR=true`. En producción (Vercel) se mantiene `NEXT_PUBLIC_FUNCTIONS_BASE_URL` directo.
- `next.config.ts` rewrites requiere que el servidor Next.js esté corriendo para funcionar (no aplica a static export).

### Contratos afectados
- Ninguno. No se cambiaron schemas, services backend, ni lógica de negocio.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro.

---

## 2026-05-27 — Preparación marcha blanca controlada

### Módulo
Auditoría backend-first y correcciones mínimas para operación real de TBB.

### Archivos modificados
- `apps/admin/src/app/pos/page.tsx` — deshabilita `card` como método de pago (Próximamente); excluye `cancelled` de `totalSalesToday`.
- `apps/web/src/lib/firebase/queries/orders.ts` — completa tipo `AdminOrderCustomer` con `email?`.
- Eliminado `apps/web/src/hooks/use-cart.ts` (archivo muerto, 0 bytes).

### Decisión
El repo está listo para marcha blanca controlada. No se introducen cambios estructurales ni UI grandes. Solo fixes funcionales mínimos que evitan errores operativos.

### Validaciones ejecutadas
```bash
npm --prefix packages/shared run typecheck        # OK
npm --prefix apps/functions run build             # OK
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit    # OK
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit  # OK
```

### Riesgos reales corregidos
1. POS permitía `card` como método de pago activo → ahora deshabilitado como "Próximamente", coherente con storefront.
2. `totalSalesToday` en POS sumaba órdenes `cancelled` → ahora excluidas.
3. Tipo `AdminOrderCustomer` incompleto (`email` faltante) → corregido.
4. Archivo muerto `use-cart.ts` → eliminado.

### Riesgos abiertos aceptados
- `startOfDay` congelado en POS (reiniciar POS diariamente).
- Seed orders usan schema viejo (`deliveryFee` vs `delivery`) — solo afecta re-seed.
- HEO Chatbot decorativo/no funcional.
- Firestore rules abiertas.
- Cross-sell Papas Kaioken inexistente.
- Cart drawer UX comprimido en mobile.

### Contratos afectados
- `docs/operations/marcha-blanca-checklist.md` — creado.
- `playbooks/repo-rules.md` — actualizado con reglas de marcha blanca.
- `docs/architecture/customer-order-contract.md` — actualizado con validaciones.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro.

---

## Fase anterior
Home público AMON Shop — Frontend

## 2026-05-27 — Home público AMON Shop

### Módulo
Home público (`/`) — frontend only.

### Archivos modificados
- `apps/web/src/app/page.tsx` — reconstruido como AMON Shop Home premium
- `apps/web/src/app/layout.tsx` — metadata actualizada a AMON Shop

### Decisión
AMON Shop es la marca y plataforma principal.
AMON Delivery queda como módulo logístico opcional, no como nombre de marca.

### Rutas relevantes
- `/` — Home público AMON Shop
- `/tienda/tbb` — tienda piloto The Best Burger
- `/pos` — panel operativo
- `/pedidos` — vista live de pedidos

### Contenido
- Hero con título AMON Shop, bajada de producto y microcopy geek.
- CTAs: Explorar tiendas (anchor #stores) y Ir al panel (/pos).
- Card principal: The Best Burger (Valparaíso, activa, con badges y link a /tienda/tbb).
- Cards secundarias: Sushi Zen y Forno Nero como Próximamente.
- Footer con referencia a /pedidos.

### Estética preservada
- Fondo oscuro `#0B0B0B`, verde AMON `#00FF9C`, cards `#141414`.
- Sin dependencias nuevas. Sin blanco puro. Responsive mobile/desktop.

### Contratos afectados
Ninguno. Cambio puramente frontend/UI. No toca backend, Firestore, schemas ni orders/customers.

### Siguiente fase recomendada
Live Order Tracking sin login mediante `trackingToken` seguro
(ver `roadmap/sprint-live-order-tracking.md` y `docs/architecture/live-order-tracking-contract.md`).

---

## Fase anterior
Backend-first stabilization

## 2026-05-08 — AMON Shop Backend/POS/Storefront Operational Phase

### Estado actual
- Backend de orders operativo.
- POS crea ventas reales.
- Storefront crea pedidos reales.
- `/pedidos` recibe stream en vivo.
- Delivery fee corregido bajo regla canónica:
  - `delivery = 1500`
  - `pickup = 0`
- Checkout storefront endurecido:
  - validación de nombre;
  - validación de teléfono chileno;
  - email opcional;
  - dirección requerida solo para delivery;
  - métodos visibles: efectivo y transferencia;
  - tarjeta deshabilitada como `Próximamente`.
- Cross-sell Papas Kaioken visible en carrito cuando corresponde.
- MVP de customers por teléfono implementado.
- Firestore guarda clientes en:
  - `tenants/tbb/customers/{customerId}`
- Firestore guarda pedidos en:
  - `tenants/tbb/orders/{orderId}`
- La fase queda pendiente de commit final porque el árbol actual no está limpio y existen cambios de código fuente sin commitear.

### Contratos de datos confirmados

Order:
- `customerId?: string`
- `customerPhoneNormalized?: string`
- `customer.name`
- `customer.phone`
- `customer.email?`
- `customer.address?`
- `customer.notes?`
- `fulfillmentType: "delivery" | "pickup"`
- `paymentMethod: "cash" | "transfer" | "card" | "pending"` según contrato actual real
- `totals.subtotal`
- `totals.delivery`
- `totals.total`
- `status`

Customer:
- `id / customerId` basado en teléfono normalizado
- `phoneNormalized`
- `name`
- `email` opcional
- `totalOrders`
- `totalSpent`
- `lastOrderAt`
- `lastPaymentMethod`
- `lastFulfillmentType`

### Regla de negocio canónica
- El teléfono chileno normalizado es la identidad mínima del cliente en marcha blanca.
- No existe login de cliente todavía.
- Firebase Auth no se debe introducir aún para clientes finales.
- SumUp queda fuera del MVP.
- Flow será la opción futura para pagos online, pero NO en esta fase.
- Tarjeta queda deshabilitada/`Próximamente` hasta integración Flow.
- El tracking público sin login será fase posterior mediante `trackingToken` seguro, no por búsqueda pública de teléfono/nombre.

### Validaciones técnicas
Estas validaciones deben quedar verdes:

```bash
npm --prefix packages/shared run typecheck
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

### Pendientes próximos
- Ver pedido en vivo sin login mediante `trackingToken`.
- Home AMON Shop pendiente de restaurar/levantar como fase separada.
- Métricas reales y reporting mejorado.
- Optimización UX POS.
- Clientes recurrentes en POS/storefront.
- Flow como integración futura de pagos online.
- Limpieza de artefactos build/tsbuildinfo antes de commit si aparecen.

## Hitos cerrados
- `packages/shared` compila
- `packages/shared` pasa typecheck
- `apps/functions` resuelve `@amon/shared`
- `apps/functions` compila limpio
- se inició migración de web/admin hacia HTTP clients
- se eliminaron mutaciones legacy críticas en parte del árbol
- service account fue movido fuera de la repo local visible

## Hallazgos clave
- el problema principal no era visual, era arquitectónico
- frontend estaba asumiendo responsabilidades de backend
- existía backend, pero parte del flujo no lo usaba
- `packages/shared/lib` contiene build output, no fuente editable
- la fuente de edición real está en `packages/shared/src`

## Hallazgos abiertos (resueltos en fase marcha blanca)
- ✅ `apps/web` typecheck limpio.
- ✅ No quedan writes directos legacy en flujos críticos.
- ✅ Migración backend-first del storefront cerrada.

## Hallazgos abiertos actuales
- `startOfDay` congelado en POS (riesgo operativo bajo si reinicia diario).
- Seed orders usan schema viejo (`deliveryFee` vs `delivery`) — solo afecta re-seed.
- Cross-sell Papas Kaioken inexistente.
- Cart drawer UX comprimido en mobile.
- Firestore rules abiertas.

## Próximo objetivo inmediato
Live Order Tracking sin login mediante `trackingToken` seguro.

## Nota operativa
No endurecer Firestore Rules hasta que:
1. el flujo HTTP backend esté completo
2. el e2e esté validado
3. se confirme que frontend ya no depende de writes directos

## 2026-07-13 — M6F números humanos + menos fricción operativa

### Qué cambió
- Orders web y ventas POS ahora persisten `displayOrderNumber`, `displayCode` y `operationalDate` desde Functions.
- El correlativo humano se genera por tenant y por día operacional con corte `05:00`, sin depender del frontend.
- `/pedidos`, `/pos`, `/metricas` y el checkout web muestran `Pedido #NNN` como identificador principal; el Firestore ID queda secundario.
- POS agrega modo rápido `Cliente mostrador` para ventas pickup sin teléfono, sin crear customer falso.
- `/gastos` precarga `occurredAt` en la hora actual y agrega CTA `Hoy / Ahora`.
- `/metricas` aclara ventas POS abiertas con copy explícito para `0` y para pendientes.

### Por qué cambió
- El ID técnico no sirve para cocina ni entrega.
- Repetir datos en POS ralentizaba la operación presencial.
- Gastos requerían fricción innecesaria para registrar el caso más común: “ahora”.
- El dashboard debía advertir mejor qué ventas POS siguen abiertas.

### Archivos modificados
- `apps/functions/src/lib/operational-order.ts`
- `apps/functions/src/repositories/firestore-orders.repo.ts`
- `apps/functions/src/services/orders.service.ts`
- `apps/functions/src/services/pos.service.ts`
- `apps/functions/src/routes/orders.ts`
- `apps/functions/src/routes/pos.ts`
- `apps/functions/src/schemas/order.shared.ts`
- `apps/functions/src/schemas/create-order.schema.ts`
- `apps/functions/src/schemas/create-pos-sale.schema.ts`
- `packages/shared/src/schemas/order.schema.ts`
- `apps/admin/src/app/pedidos/page.tsx`
- `apps/admin/src/app/pos/page.tsx`
- `apps/admin/src/app/gastos/page.tsx`
- `apps/admin/src/app/metricas/page.tsx`
- `apps/admin/src/lib/orders.ts`
- `apps/admin/src/lib/api/orders.ts`
- `apps/admin/src/lib/firebase/queries/orders.ts`
- `apps/web/src/components/cart/cart-summary.tsx`
- `apps/web/src/lib/orders.ts`
- `apps/web/src/lib/api/orders.ts`
- `apps/web/src/lib/firebase/queries/orders.ts`
- `e2e/api/orders.contract.spec.ts`

### Contratos afectados
- Order Firestore:
  - `displayOrderNumber?: number`
  - `displayCode?: string`
  - `operationalDate?: string`
- POS input:
  - `pickup` permite `customer.phone` vacío
  - `delivery` mantiene `customer.phone` y `customer.address` obligatorios
- Customer upsert:
  - solo se ejecuta si hay teléfono normalizable

### Validación
```bash
npm run build --workspace packages/shared
.\node_modules\.bin\tsc -p packages/shared/tsconfig.json --noEmit
npm run build --prefix apps/functions
npm run build --workspace apps/admin
.\node_modules\.bin\playwright test e2e/api --config=playwright.config.ts
node tools/test-rules-anon.mjs
git diff --check
git status --short
```

### Riesgos restantes
- El correlativo diario depende de `orderCounters` por tenant y no corrige pedidos legacy ya existentes sin `displayCode`.
- `git diff --check` queda verde, pero en Windows Git sigue avisando conversión futura `LF -> CRLF` en varios archivos.
- La validación pedida vía `npm run typecheck --workspace packages/shared` y `npm run test:e2e:api` chocó con el sandbox del runner; se validó con los comandos equivalentes directos del repo.

### Próximo paso
- QA manual sobre emulator para confirmar:
  - número humano visible en web y POS
  - cierre de venta POS intacto
  - gasto nuevo con fecha actual
  - copy final de métricas con `0` y con pendientes

## 2026-10-15 — M6I integridad CLP + comandas operativas

### Qué cambió
- `/gastos`: el monto se interpreta con `parseClpAmount` (nuevo `apps/admin/src/lib/clp.ts`). Acepta `12000`, `12.000`, `1.200.000`; rechaza decimales/ambiguos (`12,50`, `12.5`), vacío, cero y negativos. El input pasó de `type="number"` a `type="text"` con `inputMode="numeric"`, con previsualización `Se registrará $12.000`.
- `/pedidos`: la tarjeta muestra bloque "Preparar" con cada producto y cantidad (snapshot `item.productName`, luego catálogo, luego `productId`) y `customer.notes` como "Obs". El panel lateral usa el mismo resolvedor de nombres.
- `/pos`: "Ventas sin cerrar" muestra el resumen de artículos en una línea.

### Por qué cambió
- QA manual: `12.000` se registró como `$12`. Causa: `<input type="number">` + `Number("12.000") === 12`; el backend persiste fielmente lo que recibe (`z.number().positive()`).
- QA manual: la tarjeta solo decía `3 ítems`; el operador debía abrir el panel lateral para saber qué preparar.

### Archivos modificados
- `apps/admin/src/lib/clp.ts` (nuevo)
- `apps/admin/src/components/order-items-summary.tsx` (nuevo)
- `apps/admin/src/lib/orders.ts`
- `apps/admin/src/app/gastos/page.tsx`
- `apps/admin/src/app/pedidos/page.tsx`
- `apps/admin/src/app/pos/page.tsx`
- `e2e/unit/m6i-clp-ordercards.spec.ts` (nuevo, sin emulador)
- `docs/agent-sessions/2026-10-15/codex-m6i-clp-ordercards.md`

### Contratos afectados
- Ninguno. Sin cambios en API, Functions, shared, Firestore, rules, máquina de estados ni Shop → ERP. Montos persistidos siguen siendo enteros CLP.
- Gastos históricos mal registrados (p. ej. `$12`) NO se corrigen automáticamente.

### Validación
```bash
npx playwright test e2e/unit --config=playwright.config.ts
npm run build --workspace packages/shared
npm run build --prefix apps/functions
npx next build            # en apps/admin y apps/web
node tools/test-rules-anon.mjs
git diff --check
```

### Riesgos restantes
- El backend de `createExpense` sigue aceptando decimales (`z.number().positive()`); la integridad CLP entera hoy depende del frontend.
- No existe estructura de modificadores por ítem persistida; solo se muestran `customer.notes`.
- QA visual/manual pendiente (sin sesión admin en emulador de Auth).

### Próximo paso
- M6J: auditoría de métricas, cierre de caja y distinción venta creada vs dinero recibido.

## 2026-10-15 — M6I follow-up P2: etiquetas de pedidos terminales

### Qué cambió
- `OrderItemsSummary` recibe el estado del pedido.
- Las tarjetas activas (`queued`, `preparing`, `ready`, `on_the_way`) mantienen el encabezado `Preparar`.
- Las tarjetas `delivered` y `cancelled` muestran `Detalle del pedido` para no sugerir preparación duplicada o desperdicio.
- Se añadió una regresión que cubre estados activos y terminales.

### Por qué cambió
- La revisión de PR #70 detectó que la vista `/pedidos` podía mostrar `Preparar` para pedidos ya entregados o cancelados cuando se usaban filtros amplios o terminales.
- El encabezado debe describir la acción operativa real del estado visible.

### Archivos modificados
- `apps/admin/src/components/order-items-summary.tsx`
- `apps/admin/src/app/pedidos/page.tsx`
- `e2e/unit/m6i-clp-ordercards.spec.ts`
- `roadmap/phase-log.md`

### Contratos afectados
- Ninguno. No cambian la máquina de estados, los documentos Firestore, los endpoints ni los flujos de cierre financiero.
- Es una corrección de presentación basada en el estado ya persistido del pedido.

### Validación
```bash
npx playwright test e2e/unit/m6i-clp-ordercards.spec.ts --config=playwright.config.ts
git diff --check
```

- Resultado: 29/29 pruebas aprobadas y `git diff --check` OK.
- `npm --workspace apps/admin run build` quedó inconcluso por falta de salida del proceso; no reportó error antes de ser interrumpido. La validación CI de la PR queda como fuente adicional.

### Riesgos restantes
- El build local de `apps/admin` debe repetirse si CI reporta una regresión de compilación.
- El copy `Preparar` sigue dependiendo de que el estado del pedido sea válido; un estado desconocido usa el comportamiento activo por compatibilidad.

### Próximo paso
- Esperar revisión y checks de PR #71; solicitar aprobación explícita antes de fusionar.
- Después del cierre, iniciar M6J: cierre de caja y horario fail-closed en `America/Santiago`.
- Mini-sprint de hardening post-M6J: el cierre de caja bloquea todos los pedidos activos (web, WhatsApp y POS) para no dejar órdenes atrapadas después de una jornada inmutable; `createOrder` comparte el mismo instante capturado entre `operationalDate` y el guard de tienda; el cierre rechaza fechas calendario imposibles; y una actualización de horario conserva un cierre existente aunque la configuración anterior estuviera inválida. Pendiente validar en CI y abrir PR antes del Release Gate.
