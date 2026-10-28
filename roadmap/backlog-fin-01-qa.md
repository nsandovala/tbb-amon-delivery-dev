# Backlog — Hallazgos de QA humano de FIN-01 (28-10-2026)

**Origen:** QA humano sobre la rama `feat/fin-01-transfer-confirmation` (worktree `C:\Dev\tbb-amon-fin-01`), después de la ronda FIN-A01..A03.
**Estado:** registrado. FIN-QA-02 implementado (decisión D1); el resto sigue sin implementar. Sin commit, push, PR, merge ni deploy.

**Decisiones del 28-10-2026:**
- **D1:** FIN-QA-02 entra en FIN-01.
- **D2:** la transferencia Web sigue habilitada para QA en emuladores y para operación manual supervisada. CHECKOUT-PAY-01 etapa A es requisito antes del piloto Web público.
- **D3:** auditar el botón "Cerrar caja" antes de modificarlo (diagnóstico abajo).
- **D4:** registrar POS-UX-01, sin implementar.

## Resultados favorables del QA (sin acción)

- Pedido Web registrado, recibido por Admin y llevado hasta Entregado.
- Confirmaciones y reversiones de transferencias reflejadas en Pedidos, Métricas y Caja.
- Venta POS y transferencia pendiente identificadas correctamente.

## Clasificación

| ID | Prioridad | Destino | Bloquea |
|---|---|---|---|
| FIN-QA-02 | P1 | **Cierre de FIN-01** (aprobado D1, implementado) | Aceptación de FIN-01: la Operación debe ser coherente con el libro de pagos |
| CASH-CLOSE-UX-01 (D3) | P1 | Diagnóstico entregado; corrección pendiente de aprobación | Comprensión del cierre por el operador |
| CHECKOUT-PAY-01 | P0 | Sprint independiente (etapa A antes del piloto Web público, D2) | Piloto Web público. No bloquea el merge de FIN-01 |
| AUDIT-ORDER-01 | P1 | Sprint independiente (pequeño) | — |
| HIST-01 | P1 | Sprint independiente | — |
| SCHED-01 | P1 | Sprint independiente, solo contrato primero | — |
| POS-UX-01 (D4) | P2 | Sprint independiente, sin implementar | — |

**Criterio:** queda en FIN-01 lo que cierra la coherencia de las superficies que FIN-01 ya prometió (Web, POS, Operación, Métricas, Pedidos) usando datos que FIN-01 ya produce. Va a un sprint aparte lo que abre superficies nuevas (storefront público, configuración del tenant, almacenamiento de archivos), cambia el modelo de pedidos o no es un dato financiero.

**Orden sugerido:** FIN-QA-02 (hecho) → CASH-CLOSE-UX-01 → CHECKOUT-PAY-01 etapa A → POS-UX-01 → AUDIT-ORDER-01 → HIST-01 → SCHED-01.

---

## FIN-QA-02 — Pagos en la bitácora de Operación (P1 · cierre de FIN-01)

**Hallazgo.** La bitácora de Operación no muestra confirmaciones ni reversiones de transferencias.

**Evidencia.**
- `apps/admin/src/components/operation/audit-log.tsx` solo pinta `StoreEvent`.
- Los eventos vienen de `store-operation.service.ts`, que lee `storeEvents` ordenados por `at` y limitados a `RECENT_EVENTS_LIMIT = 25`.
- `paymentEvents` es una colección separada, legible solo con `payments.view` (`canViewPayments` en `firestore.rules`).

**Propuesta.**
- **Cronología unificada armada en el cliente.** Mezclar en memoria los `storeEvents` actuales con los `paymentEvents` de la jornada, ordenados por `at`.
- **Sin duplicar eventos financieros.** No se copian a `storeEvents`, no hay trigger ni escritura nueva. El libro sigue siendo la única fuente.
- **Lectura condicionada.** El listener de `paymentEvents` se monta solo si el rol tiene `payments.view`. Sin permiso la bitácora queda igual que hoy, sin consulta fallida ni hueco visible.
- **Datos mostrados:** tipo (confirmada o revertida), monto, pedido (código humano) y hora. No se muestran `reference`, `note` completa ni la clave de idempotencia. Esos detalles quedan en el control de pago del pedido.
- **Cota:** la consulta se acota a la jornada y a `MAX_PAYMENT_EVENTS_PER_DAY + 1`. Si el resultado está incompleto, se avisa en la propia bitácora, con el mismo criterio que FIN-A03.

**Fuera de alcance.** No hay cambios de backend ni de reglas, ni cambios en el cierre de caja.

**Criterios de aceptación.**
1. Owner y admin ven confirmaciones y reversiones intercaladas con los movimientos de tienda y caja.
2. Un rol sin `payments.view` ve exactamente la bitácora actual.
3. La cronología no repite ningún evento.
4. Las pruebas cubren la mezcla, el orden, el permiso y el caso incompleto. El navegador sigue en verde.

**Estado:** aprobado (D1) e implementado en FIN-01. Detalle, archivos y pruebas en `roadmap/sprint-fin-01.md`, sección "FIN-QA-02".

---

## CHECKOUT-PAY-01 — Instrucciones de transferencia postpedido (P0 · sprint independiente)

**Hallazgo.** El cliente que elige transferencia no recibe datos bancarios ni instrucciones.

**Evidencia.**
- `apps/web/src/components/cart/cart-summary.tsx`: el único cierre del flujo es un `toast` con el código del pedido.
- La pantalla solo dice "Al confirmar, te contactaremos por WhatsApp para coordinar tu pedido".
- No existe una página persistente del pedido, ni configuración de datos bancarios por tenant.

**Por qué va en un sprint aparte.**
- Abre una superficie pública nueva.
- Agrega configuración por tenant (contrato y reglas nuevas).
- La pantalla persistente necesita una forma segura de volver a ella. Esa necesidad coincide con la fase recomendada de Live Order Tracking: token de seguimiento, sin login y sin búsqueda por teléfono.
- No cambia el modelo de confirmación de FIN-01.

**Propuesta por etapas.**
- **A · Instrucciones.**
  - Datos bancarios configurables por tenant, editables por owner y admin, y publicables solo los campos necesarios: titular, RUT, banco, tipo y número de cuenta, correo de comprobantes.
  - Pantalla postpedido con monto exacto (`totals.total` del servidor) y referencia (código humano del pedido).
  - Enlaces `wa.me` y `mailto:` con mensaje prellenado (pedido, monto, nombre). El archivo se adjunta manualmente.
- **B · Persistencia.** Acceso a la pantalla mediante token de seguimiento. Comparte el contrato con Live Order Tracking.
- **C · Carga Web del comprobante.** Solo evaluación, sin implementar. Hay que revisar:
  - almacenamiento privado;
  - validación de tipo y tamaño;
  - retención y datos personales;
  - abuso;
  - costos.
  Verificar si exige Blaze; si lo exige, queda bloqueada por la restricción vigente. No guardar archivos en Firestore.

**Invariantes.**
- Recibir o subir un comprobante nunca cambia `paymentStatus`. Solo `confirmTransferPayment`, de FIN-01, marca `paid`.
- No se exponen datos del cliente en URLs públicas.

**Riesgo mientras no exista.** Las transferencias Web dependen de que el local envíe los datos por WhatsApp.

**Decisión D2:** la transferencia Web sigue habilitada solo para QA en emuladores y para operación manual supervisada. La etapa A es requisito antes del piloto Web público. No se habilita almacenamiento facturable, y recibir un comprobante no marca el pedido como pagado.

**Entregables.** `docs/architecture/transfer-instructions-contract.md` y `roadmap/sprint-checkout-pay-01.md`.

---

## CASH-CLOSE-UX-01 — Botón "Cerrar caja" deshabilitado sin explicación (D3 · diagnóstico)

**Hallazgo del QA.** El botón "Cerrar caja" mostraba el cursor de prohibición y no permitía cerrar.

**Condición exacta** (`apps/admin/src/components/operation/cash-panel.tsx`):

```ts
const blocked = Boolean(summary?.blockers.length);
const overrideValid = !blocked || (useOverride && overrideReason.trim().length >= 5);
const canSubmit = !!summary && countedParsed?.ok === true && transfersParsed?.ok === true && overrideValid && !busy;
// <button disabled={!canSubmit} className="… disabled:cursor-not-allowed disabled:opacity-40">
```

**Causas, separadas como pidió D3:**

| Causa | ¿Deshabilita el botón? | ¿Se explica hoy al operador? |
|---|---|---|
| **Campos requeridos vacíos.** "Efectivo contado" y "Transferencias confirmadas" son obligatorios. Con el campo vacío el valor es `null`, no `ok`. Aunque no haya transferencias hay que escribir `0`, y `parseCountedClp` sí acepta `0` | Sí | **No.** Solo se ve un mensaje si el texto es inválido; si está vacío no aparece nada |
| **Monto inválido** (decimales, negativo, texto) | Sí | Sí, mensaje rojo bajo el campo |
| **Bloqueos financieros** (`PENDING_PAYMENTS`, `UNCONFIRMED_TRANSFERS`, nuevo en FIN-01) | Sí, mientras no se marque el override | Parcial. Los bloqueos se listan en rojo, pero nada dice que el botón depende del override |
| **Override sin motivo o con menos de 5 caracteres** | Sí | Parcial. Solo el placeholder "mín. 5 caracteres"; no hay contador ni mensaje |
| **Override no autorizado** | No: el cliente no distingue roles. Todo rol con `cash.close_session` (owner y admin) puede usar override | — |
| **Bloqueos no anulables** (`ACTIVE_POS_SALES`, `ACTIVE_OTHER_ORDERS`) | **No.** El cliente ofrece el override y habilita el botón | **Inconsistencia:** el servidor los rechaza igual (`CASH_CLOSE_BLOCKED`, "el override no puede dejar pedidos atrapados"). El operador marca el override, escribe el motivo, confirma y recibe un error |
| **Libro inconsistente o truncado** (`ledger.consistent = false`, `complete = false`) | No | Hay un aviso rojo, pero el botón sigue habilitado y el servidor rechaza (`CASH_CLOSE_INCONSISTENT` / `PAYMENT_EVENTS_LIMIT`) |
| **Jornada ya cerrada** | No aplica: el formulario no se muestra, aparece el comprobante del cierre | Sí ("Cerrada") |
| **Carga o error de lectura** | Sin resumen no se muestra el formulario. Con un error de recarga se mantiene el último resumen y el botón puede quedar habilitado | Sí ("Cargando" / mensaje de error) |
| **Envío en curso** (`busy`) | Sí | Sí ("Cerrando…") |

**Causa probable en el QA:**
1. Campo "Transferencias confirmadas" vacío, o
2. un bloqueo `PENDING_PAYMENTS` / `UNCONFIRMED_TRANSFERS` sin override.

El QA registró una venta POS con transferencia pendiente. Además, el POS inicia cada venta con `paymentMethod = "pending"` (`apps/admin/src/app/pos/page.tsx`, estado inicial y reinicio), lo que genera `PENDING_PAYMENTS` con facilidad (relación con POS-UX-01).

**Propuesta (sin implementar; requiere aprobación):**
1. **Función pura `cashCloseReadiness(...)`.** Devuelve `{ canSubmit, reasons[] }` con un motivo legible por cada condición. Va con pruebas unitarias para cada caso de la tabla.
2. **Motivos visibles bajo el botón** ("Para cerrar falta: …"), enlazados con `aria-describedby`. Ejemplos:
   - "Ingresa el efectivo contado".
   - "Ingresa las transferencias verificadas (0 si no hubo)".
   - "Hay pagos pendientes: marca el override y escribe el motivo (faltan N caracteres)".
3. **Alinear el cliente con el servidor sin quitar controles:**
   - Con `ACTIVE_POS_SALES` / `ACTIVE_OTHER_ORDERS`, no ofrecer override y mostrar "Lleva estos pedidos a un estado terminal".
   - Con libro inconsistente o truncado, deshabilitar el botón con su motivo.
   - El servidor sigue siendo la autoridad. No cambia ninguna regla de cierre ni de override.
4. Opcional: tras un error de recarga, deshabilitar el cierre hasta tener un resumen fresco.

---

## POS-UX-01 — Ocultar "Pendiente" del selector habitual del POS (D4 · sin implementar)

**Hallazgo.** El selector de cobro del POS ofrece "Pendiente", y además es el valor inicial de cada venta (`useState<…>("pending")` y el reinicio tras vender, en `apps/admin/src/app/pos/page.tsx`).

**Propuesta.**
- Quitar "Pendiente" del selector habitual y exigir elegir efectivo o transferencia antes de cobrar. Eso obliga a cambiar el valor inicial: sin método elegido, sin venta.
- Mantener la compatibilidad:
  - `paymentMethod: "pending"` sigue siendo válido en el backend y en el esquema compartido;
  - las ventas históricas siguen mostrando "Pendiente";
  - el cierre de caja conserva el bloqueo `PENDING_PAYMENTS`.
- Decidir si "Pendiente" queda como acción excepcional (por ejemplo, detrás de una opción secundaria) o desaparece de la UI.

**Relación.** Reduce los bloqueos `PENDING_PAYMENTS` del cierre (CASH-CLOSE-UX-01). Saldar un `pending` sigue en FIN-02.

---

## AUDIT-ORDER-01 — Actor en cambios de estado operacional (P1 · sprint independiente)

**Hallazgo.** `updateOrderStatus` (`apps/functions/src/repositories/firestore-orders.repo.ts`) persiste `status`, `statusChangedAt` y `updatedAt`, pero no quién hizo el cambio. El log tampoco registra el actor.

**Separación.** No es un evento financiero. No se registra en `paymentEvents` ni reutiliza su contrato.

**Propuesta.**
- Registro append-only de transiciones con actor (uid y rol), estado anterior y nuevo, y hora del servidor.
- Se escribe en la misma transacción del cambio.
- Hay que decidir el destino: subcolección del pedido o `storeEvents`. Esto afecta la bitácora (FIN-QA-02) y la estructura de Firestore, así que requiere aprobación.

**Entregable.** Contrato y pruebas de autorización y concurrencia.

---

## HIST-01 — Historial global de pedidos (P1 · sprint independiente)

**Hallazgo.** El historial POS (`apps/admin/src/app/pos/page.tsx`) filtra `channel == "admin_pos"` con `POS_HISTORY_LIMIT = 50`. Por diseño no muestra pedidos Web y no hay un historial global.

**Propuesta.**
- Historial global en Pedidos con filtros por canal, fecha y estado, búsqueda y paginación por cursores (`startAfter`). Consulta por página, sin listener ilimitado.
- La búsqueda se limita a código del pedido y a campos ya presentes en el pedido, sin exponer teléfono o correo completos.
- El historial POS se mantiene para las ventas de mostrador.

**Pendiente.** Definir los índices compuestos necesarios y el costo de lectura por página antes de implementar.

---

## SCHED-01 — Hora comprometida de retiro (P1 · solo contrato)

**Hallazgo.** La Web no permite elegir una hora de retiro. El cliente solo puede indicarla en observaciones.

**Propuesta.** Preparar solo el contrato, sin implementarlo en FIN-01. Debe cubrir:
- validación contra `settings/storeHours` y sus excepciones;
- anticipación mínima;
- capacidad por franja y cómo se reserva sin sobreventa (transacción sobre un contador por franja);
- zona horaria y corte de jornada (`getOperationalDateFor`);
- qué ocurre si el local cierra o cambia el horario después de comprometer una hora;
- visibilidad en Pedidos y POS.

**Entregable.** `docs/architecture/pickup-scheduling-contract.md`.

---

## Restricciones vigentes para todo el backlog

- Sin bancos reales, pasarelas, Firebase productivo ni recursos facturables. No activar Blaze.
- Sin commit, push, PR, merge ni deploy sin aprobación humana.
- Conservar el worktree y los resultados de validación de FIN-01 para completar el QA humano y la auditoría final.
