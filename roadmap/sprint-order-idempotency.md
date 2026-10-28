# ORDER-IDEMPOTENCY v1 — Una compra, un pedido

## Estado

READY FOR REVIEW. Rama `feat/order-idempotency-v1` sobre `d28a336` (COST-GUARD v1). Sin commit, PR, merge, deploy ni Firebase real. Cierra el bloqueo del Release Gate registrado en COST-GUARD.

## Fase A — Auditoría

- Web (`cart-summary.tsx`) y POS (`pos/page.tsx`) llaman `createOrder`/`createPosSale` sin ningún identificador de intento. Un timeout, una pérdida de respuesta o un doble envío generaba un segundo pedido completo: otro número de orden, otro incremento de `orderCounters`, otra actualización de estadísticas del cliente.
- Ambos canales terminan en la misma transacción de `firestore-orders.repo.ts#createOrder`, que ya lee el contador y ejecuta el guard de tienda: es el punto natural para una primitiva compartida.
- Precedente: `closeCashSession` usa `idempotencyKey` en el cuerpo, 201/200 y `tx.create`. Se replica ese estilo.
- Las estadísticas del cliente (`upsertCustomerFromOrder`) se escriben **después** de la transacción del pedido.

## Contrato técnico

**Entrada:** `idempotencyKey` obligatorio en `createOrder` y `createPosSale`: 16 a 128 caracteres `[A-Za-z0-9_-]`. Los clientes envían un UUID v4 de `crypto.randomUUID()` (o 32 hex de `crypto.getRandomValues`). Nunca contiene datos personales.

**Primitiva** (`apps/functions/src/lib/idempotency.ts`):

1. `orderId = base62(SHA-256("amon-order:v1" ‖ tenantId ‖ canal ‖ clave))[0..20]`. Es el mismo formato de 20 caracteres de los IDs automáticos de Firestore. El propio documento del pedido es el registro de idempotencia: no hay colección nueva y la clave nunca se guarda en claro.
2. `fingerprint = SHA-256(JSON canónico del intento validado)`: canal, ítems, cliente, tipo de entrega, método de pago y, en POS, origen y campaña. El pedido guarda `idempotency: { version: 1, fingerprint }`.
3. **Pre-lectura** (fuera de transacción, 1 lectura) antes de revisar tienda, caja o productos. Si el pedido existe con la misma huella, se responde el original. Si existe con otra huella, 409.
4. **Transacción:** lee primero el pedido; si existe, aplica lo mismo sin escribir. Si no, lee el contador, ejecuta el guard de tienda y crea el pedido con `tx.create` junto al incremento del contador. `tx.create` falla si una solicitud concurrente ya lo creó; ese caso se resuelve leyendo el pedido ganador.
5. Las estadísticas del cliente se actualizan solo cuando el pedido se creó en esta solicitud.

**Respuestas:**

| Caso | Código | Cuerpo |
|---|---|---|
| Creación | 201 | `orderId`, `tenantId`, `displayOrderNumber`, `displayCode`, `operationalDate`, `replayed: false` |
| Reintento equivalente | 200 | Los mismos valores originales, `replayed: true` |
| Misma clave, contenido distinto | 409 `IDEMPOTENCY_KEY_REUSED` | Mensaje genérico, sin datos del pedido |
| Clave ausente o inválida | 400 `VALIDATION_ERROR` | — |

El orden de COST-GUARD se mantiene: esquema y teléfono (0 lecturas) → pre-lectura de idempotencia → estado de tienda → productos → transacción. En POS, la membresía se valida en la ruta antes de todo.

**Retención:** la garantía dura **mientras exista el documento del pedido**. Hoy los pedidos no se borran ni se archivan, así que no hay expiración ni TTL que configurar. Si en el futuro se borran o archivan pedidos, la clave asociada podría volver a crear uno: ese proceso deberá conservar el ID y la huella.

## Matriz de escenarios

| Escenario | Antes | Después | Prueba |
|---|---|---|---|
| Doble clic / doble envío | 2 pedidos | 1 pedido; el 2.º recibe 200 | Contrato (reintento) + `isSubmitting` en UI |
| Timeout o pérdida de respuesta y reintento | 2 pedidos | 1 pedido; el reintento recupera el original | Contrato "respuesta perdida" |
| Recarga de la página tras un error | 2 pedidos | Aviso "sin confirmar" + verificación de solo lectura; un reenvío usa la misma clave | Unitarias del estado + contrato `lookupOrderAttempt`; navegador: pendiente |
| Solicitudes concurrentes con la misma clave | N pedidos | 1 pedido, 1 incremento del contador | Contrato concurrente (3 en paralelo) |
| Misma clave, carrito modificado | 2 pedidos | 409; la UI conserva la clave, bloquea el envío y pide una decisión explícita | Contrato 409 + verificación + unitarias del conflicto |
| Compra nueva con el mismo carrito | Permitida | Permitida (clave nueva) | Contrato |
| Reintento con la tienda ya cerrada | — | 200 con el original; un intento nuevo sigue con 409 `STORE_CLOSED` | Contrato |
| Reintento tras cierre de caja (fin de jornada) | — | 200 con el original | Contrato |
| Reintento tras cambio de día operacional | — | 200 con el original: la pre-lectura no depende de la fecha | Diseño + contrato de cierre de caja (el emulador no permite mover el reloj) |
| POS sin token o de otro tenant con una clave existente | 401/403 | 401/403 sin datos | Contrato |
| Misma clave en web y POS | — | Pedidos distintos (la clave es por canal) | Contrato |

## Cliente web y POS (revisado tras la auditoría: O-01 y O-02)

**Hallazgo O-01:** conservar solo la clave no permite reconstruir la compra tras recargar. La web conserva el carrito, pero pierde los datos del cliente; el POS pierde carrito y formulario. **Hallazgo O-02:** borrar la clave tras un 409 facilitaba un segundo pedido accidental.

**Solución mínima:** recuperar el *resultado* del intento, no reconstruir su contenido.

- **Estado del intento** (`lib/order-attempt.ts`, idéntico en web y admin; una prueba lo verifica). En `sessionStorage` (`web:{tenant}` / `pos:{tenant}`) se guarda solo `{ v: 2, key, startedAt, status, uncertain, summary: { units, total }, sentCarts }`. `sentCarts` son hasta 5 huellas FNV-1a de los pares producto×cantidad enviados con esa clave (sin nombres ni precios). Nunca nombre, teléfono, email, dirección ni notas. Si no hay storage, queda en memoria.
- **Transiciones:**
  - Envío: reutiliza la clave del intento en curso; crea una nueva solo si no hay intento.
  - Error de red, timeout, 5xx o recarga durante el envío → `uncertain: true` (se conserva la clave).
  - 4xx de negocio → definitivo: nada se creó con ese envío. Se limpia solo si no había un envío incierto previo con la misma clave.
  - 409 `IDEMPOTENCY_KEY_REUSED` → `status: "conflict"`, se **conserva** la clave y no se puede enviar nada más con ella.
  - Confirmación (201, o 200 de reintento/verificación) → se limpia todo.
- **Verificación de solo lectura:** `POST lookupOrderAttempt { tenantId, channel, idempotencyKey }` → `200 { found: false }` o `200 { found: true, orderId, displayOrderNumber, displayCode, operationalDate }`. Nunca crea ni modifica nada y no devuelve datos del cliente ni del carrito. El canal web es público: la clave aleatoria es el secreto. El canal POS exige membresía con `pos.create_sale`. Tenant explícito. Costo: 1 lectura.
- **Aviso web** (`components/store/pending-order-notice.tsx`, montado en la tienda, visible sin abrir el carrito):
  - Incierto: "No pudimos confirmar tu último pedido" + resumen sin PII + **Verificar pedido**. Si existe, ver O-03 abajo. Si no existe, ver O-04: el aviso sigue visible y se puede verificar de nuevo.
  - Conflicto: "Tu intento anterior ya quedó registrado como pedido… no enviamos nada nuevo" + **Ver pedido registrado** (muestra el número, sin datos) + **Descartar intento anterior** (decisión explícita). La compra actual se confirma después desde el carrito, como siempre.
- **Aviso POS** (`components/pos-pending-attempt-notice.tsx`, junto a las acciones de venta): el mismo flujo con **Verificar venta** / **Ver comprobante** (abre el comprobante desde el historial si está entre las 50 recientes) y **Descartar intento anterior**.
- Con un conflicto pendiente, el checkout web y el POS se niegan a enviar y remiten al aviso. Ninguna recuperación crea pedidos automáticamente.
- `apiFetch` (web y admin) adjunta `code` y `status` HTTP al error, para distinguir "sin respuesta" de "respuesta definitiva".

## Costos estimados por pedido

| Caso | Lecturas extra | Escrituras extra | Almacenamiento |
|---|---|---|---|
| Pedido nuevo | +2 (pre-lectura + lectura en transacción) | 0 | ~120 bytes en el pedido (`idempotency`) |
| Reintento equivalente | 1 en total (reemplaza todo el flujo) | 0 | 0 |
| Carrera concurrente perdida | Las de su transacción + 1 | 0 | 0 |

Sin colecciones nuevas, sin TTL, sin servicios externos.

## Archivos modificados

- Backend: `lib/idempotency.ts` (nuevo), `repositories/firestore-orders.repo.ts`, `services/orders.service.ts`, `services/pos.service.ts`, `routes/orders.ts`, `routes/pos.ts`, `schemas/order.shared.ts`.
- Backend (O-01): `routes/order-attempts.ts` (nuevo, `lookupOrderAttempt`), `lookupOrderAttempt` en el repositorio, export en `index.ts` (16 funciones).
- Web: `lib/order-attempt.ts` (nuevo), `lib/api/orders.ts`, `components/cart/cart-summary.tsx`, `components/store/pending-order-notice.tsx` (nuevo), `app/tienda/[slug]/page.tsx`.
- Admin: `lib/order-attempt.ts` (nuevo, idéntico al web), `lib/api/orders.ts`, `app/pos/page.tsx`, `components/pos-pending-attempt-notice.tsx` (nuevo).
- Pruebas: `e2e/api/order-idempotency.contract.spec.ts` (20, nuevo), `e2e/unit/order-idempotency.spec.ts` (9, nuevo), `e2e/unit/order-attempt-state.spec.ts` (13, nuevo), `e2e/support/emulator-fixtures.ts` (`newIdempotencyKey`) y las specs existentes de pedidos, que ahora envían una clave nueva por intento.
- Pruebas de navegador integradas (PR #85, reemplazan a las de componente de O-05): `e2e/browser/order-idempotency.web.spec.ts` (13), `e2e/browser/order-idempotency.pos.spec.ts` (9), harness `e2e/browser/harness/` (componentes reales, Firebase contra emuladores, CSS real, control de transporte), `playwright.browser.config.ts`, script `test:e2e:browser`, helpers `listFixtureDocs`/`createFixtureProduct`/`FIXTURE_PASSWORD` en `e2e/support/emulator-fixtures.ts` y `testIgnore` de `e2e/browser` en `playwright.config.ts`.
- Documentación: este archivo, `docs/architecture/customer-order-contract.md`, `roadmap/phase-log.md`.

## Contratos afectados

- `createOrder` y `createPosSale`: `idempotencyKey` obligatorio; respuesta con `replayed`; 200 en reintento; 409 `IDEMPOTENCY_KEY_REUSED`.
- Nuevo `POST lookupOrderAttempt` (solo lectura; web público por clave, POS con `pos.create_sale`).
- Documento de pedido: campo nuevo `idempotency { version, fingerprint }`. El `orderId` de los pedidos nuevos se deriva de la clave; mantiene el formato de 20 caracteres.
- Sin cambios en pagos, transferencias, delivery, disponibilidad, reglas, índices ni cierre de caja.

## Validación

```bash
npm --workspace packages/shared run build && npm --workspace packages/shared run typecheck
npm --workspace apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
npm --workspace apps/web run build && npm --workspace apps/admin run build
npx playwright test e2e/unit --config=playwright.config.ts          # 128 passed (32 nuevos)
npx playwright test e2e/api --list --config=playwright.config.ts    # 122 contratos (99 + 23)
node tools/test-prepare-firebase-pilot.mjs && node tools/prepare-firebase-pilot.mjs
git diff --check
```

- Ejecutado en local con Node 22: todo aprobado. El paquete piloto carga las 16 funciones (`lookupOrderAttempt` con `maxInstances = 5`).
- `lookupOrderAttempt` en vivo sin Firestore: GET → 405, clave corta → 400 y sin tenant → 400, en ~15–27 ms; POS sin token → 401. Control: una verificación válida sí intenta leer Firestore.
- En vivo sin Firestore (Auth + Functions): sin clave → 400, clave corta → 400 y clave con `/` → 400, en ~15 ms y sin tocar la base; POS sin token con clave → 401. Control: una solicitud válida sí intenta leer Firestore.
- **Pendiente (emulador de Firestore, en el PC o en CI):** los 122 contratos con `firebase.json` y con `firebase.pilot.json`. Incluyen replay, 409, concurrencia, contador, estadísticas del cliente, tienda cerrada, cierre de caja, POS y `lookupOrderAttempt`.

### Qué está probado y qué no (O-01/O-02)

| QA pedida | Nivel probado | Estado |
|---|---|---|
| 1. Respuesta perdida y recuperación tras recarga (web) | API: crear → verificar con la clave → mismo pedido, sin PII ni escrituras. Unitaria: recarga simulada conserva la clave como incierta | API pendiente de emulador; unitaria ✅. **Navegador: pendiente** |
| 2. Lo mismo en POS | API: verificación POS con membresía; 401/403. Unitaria: alcance `pos:` | API pendiente de emulador; unitaria ✅. **Navegador: pendiente** |
| 3. Contenido modificado durante un intento incierto | API: 409 → verificación encuentra el original → conteo sin cambios. Unitaria: conflicto bloquea envíos y sobrevive a la recarga | API pendiente; unitaria ✅ |
| 4. 409 sin crear otro pedido | API: conteo igual tras 409 y verificación. Unitaria: `beginOrderAttempt` lanza en conflicto; solo `startNewOrderAttempt` crea clave | API pendiente; unitaria ✅ |
| 5. Limpieza al confirmar | Unitaria: memoria y storage vacíos, también tras recargar | ✅ |
| 6. Separación tenant/canal | API: verificación web vs POS y otro tenant → `found: false`. Unitaria: alcances independientes | API pendiente; unitaria ✅ |
| 7. Concurrencia: una creación y un contador | API (sin cambios desde la versión auditada) | Pendiente de emulador |
| 8. Reintento y verificación tras cierre de tienda/caja | API | Pendiente de emulador |

**No se probó ninguna recarga real de navegador.** Las pruebas unitarias simulan la recarga olvidando la memoria del módulo y conservando el storage; no ejercitan React, la red ni el ciclo de vida de la página. QA manual de navegador pendiente:

Ver "QA de navegador (pendiente; métodos)" en la sección O-03/O-04: el método con "Offline" antes de enviar **no** prueba una respuesta perdida.

## Riesgos restantes

1. **Estadísticas del cliente fuera de la transacción.** Si el proceso cae entre el commit del pedido y `upsertCustomer`, el reintento devuelve el pedido sin actualizar al cliente: puede faltar un conteo, nunca sobrar.
2. **La clave es por pestaña.** Otra pestaña u otro dispositivo generan otra clave: si la misma persona compra dos veces desde dos lugares, son dos pedidos (es una decisión suya).
3. **Clientes externos sin clave reciben 400.** En el repo no hay otros consumidores. `createOrderApi` del admin no tiene uso y no se modificó. Si el bot de WhatsApp u otra integración llama `createOrder` por HTTP, deberá enviar `idempotencyKey`.
4. **La garantía depende de que el pedido exista.** Hoy no se borran pedidos; un futuro archivado debe conservar ID y huella.
5. **Cambio de día operacional:** probado por diseño y vía cierre de caja; el emulador no permite mover el reloj.
6. **La concurrencia se prueba en el emulador.** Firestore en producción ofrece la misma semántica de `tx.create`, pero solo se verá con tráfico real.
7. La huella incluye los datos del cliente tal como los valida el servidor: un cliente que cambie el texto entre reintentos recibirá 409, no un pedido duplicado.
8. **`lookupOrderAttempt` web es público.** Sin la clave aleatoria (122 bits) no se puede derivar un pedido, y solo devuelve identificadores. Cuesta 1 lectura por llamada; lo acotan los límites de escalado de COST-GUARD.
9. **La recuperación vive en la pestaña** (`sessionStorage`). Si la persona cierra la pestaña tras un error, se pierde el aviso; reabrir y comprar de nuevo genera una clave nueva. Persistir más (localStorage o datos del cliente) aumentaría la PII guardada; se dejó así a propósito.
10. Tras una verificación con `found: false`, la clave y el estado incierto se conservan (O-04): si el envío original llega tarde, la siguiente verificación lo encuentra; un reenvío con otro contenido recibirá 409.
12. **Huella del carrito (O-03):** si dos envíos inciertos con la misma clave llevaron carritos distintos y el carrito actual es uno de ellos, al encontrar el pedido se vacía aunque el registrado fuera el otro. Requiere dos fallas de red seguidas con un cambio de carrito entre ambas y sin 409 de por medio; es un caso muy poco probable y documentado.
13. **Al resolver con un carrito distinto (`keep-cart`)**, ese carrito se conserva y confirmarlo crea una compra nueva. El aviso lo dice explícitamente; no hay un segundo diálogo de confirmación.
11. **Ver comprobante** en el POS solo abre ventas presentes en el historial en vivo (las 50 más recientes); si no está, el aviso igual muestra el número de venta.

## Corrección O-03 / O-04 (segunda auditoría)

**O-03 — segunda compra accidental tras una verificación exitosa (P0).** Antes, `found: true` llamaba a `finishOrderAttempt()` y dejaba el mismo carrito listo: un clic más lo enviaba con una clave nueva. Ahora:

- Cada envío registra la huella de su carrito en el intento (`sentCarts`).
- `resolveFoundOrderAttempt(scope, clave, carritoActual)` decide, de forma pura y probada:
  - `resolve-checkout`: el carrito actual es uno de los enviados → se cierra el intento y la UI resuelve el checkout como tras un 201 (web: `clearCart()`; POS: `clearPos()`). Ya no hay nada que reenviar por accidente.
  - `keep-cart`: el carrito actual es distinto o está vacío → se cierra el intento y **el carrito se respeta**. El aviso aclara que confirmarlo será un pedido nuevo.
  - `conflict`: en conflicto (409) el pedido encontrado no es el carrito actual → no se toca nada; decide la persona.
  - `stale`: el intento cambió mientras se verificaba → el resultado se descarta sin efectos.
- **Escrituras condicionadas a la clave:** `finishOrderAttempt(scope, clave)`, `recordOrderAttemptFailure(scope, error, clave)` y `resolveFoundOrderAttempt` solo actúan si la clave sigue siendo la del intento vigente. Una respuesta o verificación tardía de un intento viejo nunca limpia, vacía ni marca uno posterior. Descartar en el aviso de conflicto usa `discardOrderAttempt` (decisión explícita).
- El POS compara el carrito **al llegar** la respuesta (ref), no al pulsar Verificar, para no vaciar un carrito armado mientras tanto.

**O-04 — `found: false` no es definitivo.** Se eliminó `markOrderAttemptNotFound`: la verificación sin resultado no cambia el estado. El aviso sigue visible, dice "Todavía no lo encontramos. Puede estar procesándose: verifica de nuevo en unos segundos" y ofrece **Verificar de nuevo** con la misma clave. Reenviar sigue sin duplicar.

**Sin cambios en el backend transaccional ni en `lookupOrderAttempt`** respecto de la versión auditada.

### Regresiones agregadas (O-03/O-04)

| Pedido de GPT | Unitaria (estado del cliente) | API (emulador) | Navegador |
|---|---|---|---|
| 1. Crear, perder respuesta, consultar → `found: true` | Recarga simulada → `resolve-checkout` | "respuesta perdida + recarga" y POS con membresía | Pendiente (método A) |
| 2. Tras encontrarlo, el mismo carrito no genera otra compra por clic accidental | `resolve-checkout` + "solo como compra nueva (clave nueva)" | Reenvío del mismo intento → 200, mismo pedido | Pendiente (UI vacía el carrito) |
| 3. Compra nueva explícita permitida | `startNewOrderAttempt` / `keep-cart` | "clave nueva con el mismo carrito" → 201 | Pendiente |
| 4. Carrito nuevo preparado durante la recuperación no se borra | `keep-cart` y carrito vacío | — (lógica de cliente) | Pendiente |
| 5. `found: false` y creación tardía → la 2.ª verificación recupera | "O-04" | Web y POS: `found:false` → creación → `found:true` | Pendiente |
| 6. Sin duplicar contadores, ventas ni comprobantes | — | "verificar no mueve contadores ni ventas"; replay/concurrencia previos | Comprobante: pendiente |
| 7. Callbacks asíncronos tras cambiar de intento | 3 casos `stale` (verificación, éxito y error tardíos) | — | Pendiente |

### Validación de esta ronda

- `npx playwright test e2e/unit` → **128 passed** (23 del estado del cliente).
- `npx playwright test e2e/api --list` → **122 contratos** (23 de idempotencia).
- Typecheck y build de web y admin; build de Functions; guards de empaquetado; `git diff --check`: OK.
- Pendiente: los 122 contratos con el emulador de Firestore (`firebase.json` y `firebase.pilot.json`) y el QA de navegador.

### QA de navegador (pendiente; métodos)

- **Método A — respuesta realmente perdida:** DevTools → Network → perfil de throttling personalizado con latencia de 8000 ms. Confirmar el pedido, esperar a que el log del emulador de Functions muestre `Order created` y recargar la página **antes** de que llegue la respuesta. El pedido existe y el cliente no recibió el 201. Esperado: aviso "No pudimos confirmar tu último pedido" → **Verificar pedido** → "quedó registrado" y, si el carrito es el mismo, se vacía. Un solo pedido en `/pedidos`; confirmar otra vez el carrito vacío no es posible.
- **Método B — la solicitud nunca llegó:** poner "Offline" **antes** de confirmar. Esto **no** prueba una respuesta perdida, solo el camino "no se registró" (O-04): **Verificar** → "Todavía no lo encontramos"; volver a "Online" y reenviar crea un solo pedido.
- **Conflicto:** tras el método A, cambiar la cantidad y confirmar sin verificar → aviso de conflicto, sin pedido nuevo; **Descartar intento anterior** + confirmar crea uno.
- **POS:** método A con la venta; tras recargar, armar el mismo carrito y **Verificar venta** → "quedó registrada" y el formulario se limpia; con un carrito distinto, se conserva.

## Corrección O-05 (tercera auditoría): efectos de respuestas tardías

Solo cliente. Sin cambios de backend, contratos, Firestore, FIN-01, delivery, autenticación ni Blaze.

- **Éxito con efectos condicionados:** `settleOrderAttemptSuccess(scope, key, carritoEnviado, carritoActual)` reemplaza a `finishOrderAttempt` en web y POS y devuelve:
  - `stale`: el intento ya no es el vigente. No toca carrito, formulario, comprobante ni estado, y no muestra avisos.
  - `cart-changed`: el intento se cierra, pero el carrito cambió mientras se esperaba. Se conserva; confirmarlo es una compra nueva con otra clave.
  - `apply`: efectos normales.
- **Carrito actual, no el del render:** la web lee el store en el momento de la respuesta. El POS usa un `ref` al carrito vigente y lo vuelve a comparar **después** de leer el comprobante (`getOrderApi`), porque el carrito puede cambiar durante esa lectura.
- **Errores tardíos:** `stale` no muestra ningún aviso, ni siquiera en web.
- **POS desmontado:** si la respuesta llega con la página desmontada (navegación del cliente), nadie vio la confirmación. `markOrderAttemptUnconfirmed` deja el intento incierto, así la vista actual muestra "Venta sin confirmar" en vez de cerrarlo en silencio.
- **Carritos históricos ambiguos:** si con la misma clave se enviaron varios carritos y el actual es uno de ellos, `resolveFoundOrderAttempt` devuelve `ambiguous`. Nada se vacía. El intento queda en estado `ambiguous`, que persiste en la recarga y bloquea nuevos envíos (`ORDER_ATTEMPT_AMBIGUOUS`). El aviso pide decidir:
  - "Conservar carrito": descarta el intento; el siguiente envío lleva clave nueva.
  - "Es ese pedido: vaciar carrito" en la web, "Es esa venta: limpiar formulario" en el POS.

  Se guarda solo el código visible del pedido (`foundCode`), sin PII.
- O-01, O-02 y O-04 sin cambios de comportamiento: misma clave en reenvíos, 409 bloqueante y `found: false` no definitivo.

### Validación O-05

- Las pruebas de componente con API falsa de esta ronda se **reemplazaron** en la corrección del PR #85 (CR-03) por pruebas de navegador integradas con emuladores; ver abajo.
- `npx playwright test e2e/unit` → 137 passed en esta ronda.

## Corrección PR #85 (revisión Codex CR-01 a CR-05)

Solo cliente y pruebas. Sin cambios de backend, contratos, Firestore, FIN-01, delivery, autenticación ni Blaze.

| CR | Causa | Corrección | Prueba |
|---|---|---|---|
| CR-01 | El POS cerraba el intento antes de `getOrderApi()`: recargar o salir durante la lectura perdía la clave y el reintento creaba otra venta. | El intento se cierra **después** de leer el comprobante. Al recargar, el navegador aborta la lectura y su promesa falla después de `pagehide`, todavía en la página que se va. Por eso, una página en `pagehide` no cierra ni modifica el intento (lo detectó la primera ejecución con emuladores en el PC). Vista desmontada al terminar → `markOrderAttemptUnconfirmed` ("Venta sin confirmar"). Recarga durante la lectura → el intento `pending` vuelve incierto con su clave. Lectura fallida → comprobante con el resumen del POS y una sola venta. | Navegador POS: recarga durante la lectura, salir durante la lectura, lectura fallida. |
| CR-02 | Dos envíos activos con la misma clave (checkout reabierto o POS remontado): el 4xx de uno borraba el intento compartido; el 201 del otro quedaba `stale` y el siguiente clic duplicaba. | Contador en memoria de envíos activos por clave. Un 4xx o error de red con otro envío activo devuelve `pending-other` (sin aviso; decide el otro), y el 4xx no borra. Recarga: el contador se pierde y el `pending` vuelve incierto. Misma lógica web y POS (archivo idéntico). | Unitarias (5) y navegador web y POS: A → 400 real, B con la misma clave → 201, una sola venta. |
| CR-03 | El harness reemplazaba Firebase Auth, Firestore y la API con stubs, contra la regla de `AGENTS.md`. | Harness nuevo `e2e/browser/` sin mocks de datos ni API. Pasan por los emuladores, con tenant aislado por prueba: Auth, Firestore (`onSnapshot` del POS), Functions, `TenantProvider` y `AdminGuard`. Demora y pérdida se controlan en la capa de transporte (`page.route`), con respuestas siempre producidas por el backend real. | `playwright.browser.config.ts`, `npm run test:e2e:browser` dentro de `emulators:exec`. |
| CR-04 | Al truncar `sentCarts` (máx. 5) se olvidaba el primer carrito; restaurarlo y verificar daba `keep-cart`, borraba la clave y permitía duplicar. | Indicador persistente `truncated`. Con historial truncado, cualquier carrito con productos se resuelve `ambiguous`: no se vacía ni se pierde la clave. Un registro con más de 5 huellas también se lee como truncado. | Unitarias (4) y navegador web: 6 carritos, recarga y recuperación ambigua. |
| CR-05 | El aviso flotante (`z-40`) quedaba bajo el overlay (`z-[60]`) y el cajón (`z-[70]`); en móvil el cajón lo tapaba entero. Para usarlo había que cerrar el checkout y perder los datos. | `PendingOrderNotice` con `placement`. `checkout` se dibuja dentro del cajón, en el paso carrito y en el formulario. `page` se oculta con el cajón abierto. Mismo estado y mismas acciones, sin lógica duplicada. | Navegador web en 390×844 con CSS real: verificar, ver conflicto y descartar desde el cajón, conservando los datos escritos. |

### Qué es integrado y qué no

- **Unitarias** (`e2e/unit`, Node puro): toda la máquina de estados del intento. Usan un `sessionStorage` en memoria; no hay Firebase que reemplazar.
- **Contratos API** (`e2e/api`, emuladores): backend. Sin cambios en esta ronda: siguen 122.
- **Navegador integrado** (`e2e/browser`, Chromium + emuladores):
  - Real: componentes de producción, React (StrictMode), stores, `sessionStorage`, `localStorage` e IndexedDB, cliente HTTP de la app, SDK de Firebase contra los emuladores, CSS de Tailwind de cada app y recargas reales (`page.reload()`).
  - Shims solo de framework: `next/image`, `next/link` y `next/navigation`, porque no hay servidor Next.
  - La tienda no renderiza la página de catálogo: los botones "Agregar" ponen en el carrito productos que existen en el tenant, y el backend valida y pone los precios.
  - Las pruebas del POS cubren la lectura de comprobante.
  - Se quitaron las pruebas de la ronda O-05 con API falsa (`e2e/component`, `playwright.component.config.ts`, script `test:e2e:component`). Su cobertura pasó a las pruebas integradas, salvo un caso que no se puede producir sin inventar respuestas: el 500 antiguo. Ese caso queda en las unitarias (clasificación de 5xx); el error antiguo se prueba con un 400 real y con una pérdida de red tardía.
- `playwright.config.ts` ignora `e2e/browser` (tiene su propia configuración).

### Cumplimiento de AGENTS.md

- "No mocks when real emulator/seed/collection exists": no queda ninguno de Auth, Firestore, Functions ni API. Los datos salen de fixtures aislados (`createOpenFixtureTenant`, `createFixtureProduct`) en los emuladores. Los shims de Next son del framework, no de datos.
- Escrituras críticas solo por Functions: los fixtures se escriben con el token `owner` del emulador, como en los contratos existentes.
- Zustand solo para el carrito y estado transitorio; el intento vive en `sessionStorage` sin PII.

### Validación de esta ronda

- `npx playwright test e2e/unit` → **148 passed** (43 del estado del cliente: +5 de CR-02, +4 de CR-04 y +2 de `pagehide`).
- **PC del usuario, emuladores oficiales (`firebase.json`):**
  - Contratos API: **122 passed**.
  - Primera ejecución de navegador: POS 6/9. Fallaron tres:
    - la recarga durante la lectura, por el bug de `pagehide`, ya corregido;
    - dos aserciones sobre toasts que la confirmación live de Firestore reemplaza enseguida. El aviso de carrito conservado ya no se pisa (`keep`), y la prueba del reintento verifica el comprobante y que haya una sola venta.
  - Web 0/13: Tailwind no arrancaba en Windows porque se invocaba `.bin/tailwindcss` sin `.cmd`. Ahora se ejecuta `tailwindcss/lib/cli.js` con el mismo Node.
- `npx playwright test e2e/api --list` → **122 contratos**. `--config playwright.browser.config.ts --list` → **22 pruebas de navegador** (13 web, 9 POS).
- Typecheck y build de web, admin y Functions; `git diff --check`: OK.
- **No ejecutado con el emulador oficial de Firestore** en esta sesión (su descarga está bloqueada en la sandbox). Pendiente en el PC, con `firebase.json` y `firebase.pilot.json`:
  - los 122 contratos;
  - las 22 pruebas de navegador;
  - las pruebas negativas multi-tenant y de permisos POS, que ya están en los contratos.
- **Ensayo de desarrollo**, que no cuenta como evidencia: las 13 pruebas web pasaron contra Auth y Functions oficiales con un emulador de Firestore no oficial (`@firestore-emulator/server`, solo gRPC), y las mutaciones de CR-02, CR-04, CR-05 y O-05 hicieron fallar sus pruebas. El POS no corre en ese ensayo: necesita WebChannel y `collectionGroup`.

## Próximo paso

Auditoría cruzada GPT de la corrección del PR #85. En el PC, con ambas configuraciones de emulador: los 122 contratos y las 22 pruebas de navegador (`emulators:exec ... 'npm run test:e2e:browser'`). Después, el QA manual método A. Con autorización: commit y push a la misma rama; los hilos de Codex se cierran con evidencia.

## 2026-10-28 — Integración de navegador en GitHub Actions

### Auditoría de la línea base

- `main`: `ca93602c079281a435ef7495ce18df7b643d45b0`, merge del PR #85. Checkout limpio antes de crear la rama `ci/order-idempotency-browser`.
- Los tres workflows existentes son `qa.yml`, `security-gate.yml` y `firebase-pilot-manual.yml`. Ninguno ejecuta `test:e2e:browser` ni usa `playwright.browser.config.ts`. El test estándar excluye `e2e/browser`; los contratos API no ejercitan Chromium.
- [QA de main, ejecución 40609788041](https://github.com/nsandovala/tbb-amon-delivery-dev/actions/runs/40609788041): `qa` y `api-contracts` verdes. El log del job `122558248324` confirma **122 passed** con `firebase.json` y **122 passed** con `firebase.pilot.json`. Es evidencia previa a este cambio, no una ejecución nueva de navegador.
- La API de la rama devuelve `protected: false` y checks requeridos vacíos. El [ruleset activo 25894222](https://github.com/nsandovala/tbb-amon-delivery-dev/rules/25894222) también tiene `required_status_checks: []` (y `ref_name.include: []`). El otro ruleset, `heorules`, está desactivado. La lectura del endpoint administrativo `/branches/main/protection` devolvió 403; no se presume acceso administrativo por los permisos del usuario.
- Hallazgo confirmado: la suite de navegador no está integrada en los workflows actuales y no figura como check obligatorio. Se descarta que el verde de `api-contracts` ya cubra esos 22 casos.

### Cambio y contrato del control

- Archivo nuevo: `.github/workflows/order-idempotency-browser.yml`. Este apartado documenta el cambio; no se modifican tests, código de producto, contratos API, estructura Firestore ni workflows de despliegue.
- Ejecuta toda la suite existente: **13 casos web + 9 POS**, un worker, sin reintentos y con `forbidOnly` en CI, reutilizando `playwright.browser.config.ts`, el harness y los fixtures aislados.
- Se dispara en PR hacia `main`, push a `main`, `merge_group` y ejecución manual. Sin filtros por rutas, condiciones para omitir el job ni `continue-on-error`.
- Node 22, Java 21, `npm ci`, builds de Shared y Functions, Chromium de la versión de Playwright del lock y Firebase CLI `15.34.1`, igual que el CI de contratos.
- Proyecto fijo `demo-amon-ci`; solo emuladores Auth, Firestore y Functions. Permiso `contents: read`, sin secretos, identidad cloud ni comando de despliegue.
- Nombre estable del check: **`order-idempotency-browser`**. Un fallo de instalación, build, emulador o test falla el job.
- Publica siempre que existan el reporte HTML, resultados/trazas de Playwright y logs de emuladores como artefacto, retenido siete días. Las trazas de fallos ya están configuradas en Playwright.

| Riesgo | Cobertura existente que ejecuta el workflow |
|---|---|
| Respuesta perdida después de persistir | Web: `respuesta perdida tras crear + recarga real`; POS: respuesta perdida y recuperación de carritos ambiguos |
| Recuperación tras recarga | Web: recuperación desde sessionStorage; POS: recarga durante la lectura del comprobante |
| Duplicados/reenvíos concurrentes | Web/POS: replay 200, respuesta 201 antigua, CR-02 con clave compartida y comprobación del número de pedidos |
| Conflicto HTTP 409 | Web móvil: 409 real desde el checkout, verificación y descarte explícito, conservando datos |
| Conservación del carrito | Web/POS: carrito modificado mientras se espera y recuperación ambigua sin borrado automático |
| Resultado todavía desconocido | Web O-04: `found: false`, creación tardía y segunda verificación |

### Reproducción y evidencia

```bash
npm ci
npm --workspace packages/shared run build
npm --workspace apps/functions run build
npx playwright install --with-deps chromium
FIREBASE_PROJECT_ID=demo-amon-ci \
FUNCTIONS_BASE_URL=http://127.0.0.1:5001/demo-amon-ci/us-central1/ \
CI=true PLAYWRIGHT_HTML_OPEN=never \
npx --yes firebase-tools@15.34.1 emulators:exec --project demo-amon-ci \
  --only auth,firestore,functions 'npm run test:e2e:browser -- --reporter=github,html'
```

- Validación local: `npm ci`; builds de Shared/Functions; `npm --workspace packages/shared run typecheck`; `npx tsc -p apps/web/tsconfig.json --noEmit`; `npx tsc -p apps/admin/tsconfig.json --noEmit`; `node tools/test-prepare-firebase-pilot.mjs` (**5/5**); `npx playwright test e2e/unit --config=playwright.config.ts` (**148/148**); `git diff --check`: **PASS**.
- `CI=true npm run test:e2e:browser -- --list`: **22 pruebas descubiertas**, no ejecutadas por ese comando. YAML y condiciones de ejecución revisados.
- Límite local: Node 24 y Java 17 en el entorno disponible; la descarga de Chromium falló con archivo ZIP inválido/truncado. No se declara una ejecución local de las 22 pruebas. El resultado del runner Node 22/Java 21 y sus enlaces se registran en el PR independiente.

### Riesgo residual y siguiente paso

Agregar un workflow **no lo convierte por sí solo en requisito de merge**. Tras verificar su ejecución, seleccionar `order-idempotency-browser` como status check requerido en una regla que incluya `refs/heads/main` (o protección equivalente). Este PR no cambia reglas administrativas. Hasta configurar esa exigencia, el check es automático pero no impide por sí solo una fusión.

El harness usa componentes reales y backend emulado; no ejecuta un servidor Next completo ni valida Firebase desplegado. Queda el QA humano del flujo completo y del piloto cuando se autorice. Sin merge ni despliegue Firebase en esta tarea.
