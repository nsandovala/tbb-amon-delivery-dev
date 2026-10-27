# COST-GUARD v1 — Límites de costo en endpoints públicos

## Estado

READY FOR REVIEW. Rama `fix/cost-guard-public-endpoints` sobre `a998ccd` (SEC-04). Sin commit, PR, merge, deploy ni cambios de facturación. **COST-GUARD no autoriza Blaze ni garantiza una factura máxima.**

## Fase A — Matriz de riesgos y costos

Lecturas por solicitud medidas sobre el código. `S` = lecturas del estado de tienda: `storeHours` + `storeOperation` + consulta de excepciones de 9 días (mínimo 1 lectura, máximo 9 documentos) + `cashCloses/{día}` si el horario es válido, o sea entre 3 y 12.

| Endpoint | Causa del costo | Firestore por solicitud (antes → después) | Escenario de abuso | Severidad | Mitigación mínima (este PR) |
|---|---|---|---|---|---|
| `POST createOrder` (público) | Una lectura por **línea** de carrito, sin tope de líneas ni de cantidades. Producto inexistente → 500 tras leer | Antes: N líneas (sin tope) + 1 contador + S + 1 cliente; escribe 3. Después: S + U productos distintos (≤ 25) + 1 + S + 1; escribe 3 | Carrito de miles de líneas o líneas repetidas: miles de lecturas por solicitud, repetible sin autenticación | **Alta** | Máx. 25 líneas, 50 u/línea, 200 u totales, cuerpo ≤ 16 KB, IDs seguros, largos máximos; lecturas deduplicadas en un `getAll`; inexistente/inactivo → 400 |
| `POST createOrder` con tienda cerrada | El cierre se detectaba **dentro** de la transacción, después de leer todos los productos | Antes: N + 1 + S. Después: S y se detiene (409) | Bombardeo fuera de horario (la mayor parte del día) | **Alta** | Pre-chequeo no transaccional antes de leer productos; el guard transaccional se mantiene |
| `POST createOrder` con teléfono inválido | El teléfono se validaba **después** de leer productos | Antes: N lecturas → 400. Después: 0 lecturas → 400 | Solicitudes basura con carrito válido | Media | Validación del teléfono antes de cualquier lectura |
| `POST createOrder` tenant inexistente | Fallback y lecturas sobre un tenant vacío | Después: S (≈ 4) → 409 fail-closed | Tenants aleatorios | Baja | Formato de `tenantId` validado; el pre-chequeo lo deja fail-closed sin leer productos |
| `GET getStoreStatus` (público) | S + hasta 12 excepciones próximas; el storefront lo consulta cada 60 s por pestaña, **incluso en segundo plano** | 4 a 25 lecturas por llamada | Pestañas abiertas todo el día; scripts de polling | Media | El storefront deja de consultar con la pestaña oculta y refresca al volver |
| `POST createPosSale` (privado) | Igual que createOrder, pero exige membresía | Mismo perfil; ahora acotado por los mismos límites | Requiere credenciales de staff | Baja | Mismos límites de esquema y cuerpo; inexistente/inactivo → 400 |
| `getOrder` (privado) | Resuelto en SEC-04 | 1 token + 2 membresía + 1 pedido | — | — | — |
| Escalado de Functions | Sin límites: `maxInstances` por defecto (100 por función), timeout 60 s | — | Un abuso puede escalar a decenas de instancias facturables | **Alta** | `setGlobalOptions`: `maxInstances: 5`, `minInstances: 0`, `timeoutSeconds: 30`, `memory: 256MiB`, `region: us-central1` |
| Reintentos del cliente | `createOrder` no es idempotente: un reintento tras perder conexión crea un segundo pedido | 1 pedido extra completo | Doble cobro/preparación por red inestable, no por abuso | Media (operativo) | **No implementado**: requiere cambio de cliente (ver propuesta) |

Superficie pública restante: `createOrder` y `getStoreStatus` (sin token), además de las lecturas públicas del catálogo por reglas de Firestore (`products`, `categories`, `modifiers`, `modifierGroups`, doc del tenant). No hay dependencias de terceros en runtime (sin APIs externas, sin webhooks).

**CORS no es un control de seguridad**: solo lo aplican los navegadores. Cualquier script puede llamar a estos endpoints directamente.

## Fase B — Qué cambió

- `apps/functions/src/schemas/order-limits.ts` (nuevo): límites centralizados.
- `apps/functions/src/schemas/order.shared.ts`: `createOrder` y `createPosSale` validan líneas (≤ 25), cantidades (entero 1–50), unidades totales (≤ 200), `productId`/`tenantId` con formato de ID de documento (`^[A-Za-z0-9_-]+$`, ≤ 128) y largos del cliente (nombre 100, teléfono 32, email 254, dirección 300, notas 500).
- `apps/functions/src/lib/request-limits.ts` + `PayloadTooLargeError`: cuerpo > 16 KB → **413** antes de validar o leer.
- `apps/functions/src/services/product-pricing.ts` (nuevo): lee cada producto distinto una vez con `getAll`; inexistente, sin precio válido o `isActive: false` → **400** (antes 500 o aceptado). Lo usan web y POS.
- `apps/functions/src/services/orders.service.ts`: orden nuevo — teléfono (0 lecturas) → pre-chequeo de tienda → productos → transacción (con el guard transaccional intacto) → cliente.
- `apps/functions/src/services/store-operation.service.ts`: `assertStoreAcceptingOrdersNow` (pre-chequeo no transaccional, mismo `StoreClosedError` 409).
- `apps/functions/src/lib/global-options.ts` (nuevo) importado primero en `index.ts`: límites de escalado. Verificado en las 15 funciones (`__endpoint.maxInstances = 5`).
- `apps/web/src/components/store/store-special-dates.tsx`: sin polling con la pestaña oculta.
- `e2e/api/cost-guard.contract.spec.ts` (nuevo): 19 contratos.

Sin cambios en finanzas, transferencias, delivery, conciliación, reglas de Firestore ni índices.

### Umbrales y justificación

Un carrito real de TBB tiene pocas líneas y cantidades de un dígito. 25 líneas y 200 unidades dejan margen amplio incluso para pedidos grupales y acotan las lecturas de productos a 25 por solicitud. Los largos de texto superan cualquier dato real (el POS ya limita la campaña a 100). Si un cliente legítimo choca con un límite, recibe 400 con el detalle del campo.

## Contratos afectados

| Caso | Antes | Después |
|---|---|---|
| Carrito > 25 líneas, > 50 u/línea o > 200 u | Aceptado | 400 `VALIDATION_ERROR` |
| IDs con `/`, `.` o > 128 caracteres | Aceptado / error interno | 400 |
| Campos del cliente demasiado largos | Aceptado | 400 |
| Cuerpo > 16 KB | Aceptado | 413 `PAYLOAD_TOO_LARGE` |
| Producto inexistente o sin precio | 500 `INTERNAL_ERROR` | 400 |
| Producto desactivado | Aceptado | 400 |
| Tienda cerrada | 409 tras leer productos | 409 antes de leer productos |
| Teléfono inválido (web) | 400 tras leer productos | 400 sin lecturas |

## Validación

```bash
npm --workspace packages/shared run build && npm --workspace packages/shared run typecheck
npm --workspace apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
npm --workspace apps/web run build && npm --workspace apps/admin run build
npx playwright test e2e/api --list --config=playwright.config.ts   # 99 contratos, 19 nuevos
node tools/test-prepare-firebase-pilot.mjs && node tools/prepare-firebase-pilot.mjs
git diff --check
```

- Todo aprobó en local con Node 22. El paquete piloto carga las 15 funciones con `maxInstances = 5`.
- **Prueba en vivo sin Firestore** (emuladores Auth + Functions, `demo-amon-ci`). Sin emulador de Firestore, cualquier lectura falla, así que una respuesta limpia demuestra cero accesos: 26 líneas → 400, qty 51 → 400, `productId` inseguro → 400, nombre largo → 400, cuerpo 20 KB → 413, teléfono inválido → 400 y POS sin token → 401, todos en 12–16 ms. Control: un pedido válido sí intenta leer Firestore y falla a los 7,5 s.
- **Pendiente de CI**: los 99 contratos con el emulador de Firestore, en ambas configuraciones (`firebase.json` y `firebase.pilot.json`). Incluye la prueba de orden (tienda cerrada + producto inexistente → 409, no 400) y el conteo de pedidos sin cambios tras cada rechazo.

## Riesgos restantes

1. **Abuso distribuido sin autenticación sigue siendo posible.** Los límites acotan el costo **por solicitud**, no la cantidad de solicitudes. Un atacante con muchas IPs puede enviar pedidos válidos (que sí escriben) o golpear `getStoreStatus` repetidamente.
2. **No hay tope absoluto de gasto.** `maxInstances` limita la concurrencia, no la factura; Firestore no tiene tope de gasto.
3. Un pedido legítimo con la tienda abierta hace ahora entre 3 y 12 lecturas extra por el pre-chequeo: es el costo de no leer productos con la tienda cerrada.
4. `createOrder` no es idempotente: reintentos de red pueden duplicar pedidos. Queda como bloqueo del Release Gate (ver abajo).
5. `maxInstances: 5` puede devolver 429/503 ante un pico legítimo extremo. Es improbable para un carro y se ajusta con un PR.
6. `createOrder` mantiene el fallback a `tbb` sin `tenantId` (fuera de alcance, ORDER-HARDENING).

## Propuesta de controles pendientes de aprobación humana (no activados)

| Control | Qué resuelve | Requiere | Costo | Recomendación |
|---|---|---|---|---|
| **Firebase App Check** (reCAPTCHA Enterprise o v3) en `createOrder` y `getStoreStatus` | Dificulta las llamadas que no vienen de la app real (scripts simples) | Registrar la app en consola. El storefront obtiene el token con el SDK de App Check y lo envía en el header `X-Firebase-AppCheck`. Ambas funciones son HTTP `onRequest`, así que la verificación es manual: `getAppCheck().verifyToken(token)` del Admin SDK al inicio del handler, antes de validar el payload o leer Firestore. La opción `enforceAppCheck` aplica a `onCall`; no se asume que dé enforcement automático en `onRequest` | reCAPTCHA Enterprise: cuota gratuita mensual, luego pago por evaluación | **Sí, antes de abrir el piloto al público** |
| **Spend cap de Cloud Functions** (Preview) | Pausa Functions al llegar al monto mensual | Blaze; configuración en consola | Ninguno extra | Sí, el mismo día que se active Blaze, sabiendo que pausar = sistema caído |
| **Alertas de presupuesto** (50/90/100 %) | Aviso temprano; no corta | Blaze | Ninguno | Sí, junto con Blaze |
| **Idempotency key** en `createOrder` | Evita pedidos duplicados por reintento | Cliente genera la clave; servidor guarda `orders/{key}` o un doc de deduplicación | 1 lectura + 1 escritura por pedido | P1 tras el piloto inicial |
| **Cache-Control / CDN** para `getStoreStatus` | Reduce lecturas de polling | Firebase Hosting delante de Functions | Bajo | Evaluar si el tráfico real lo justifica |
| **Cloud Armor / API Gateway con rate limiting** | Límite por IP real, distribuido | Balanceador o API Gateway | Costo fijo mensual relevante | No para el piloto |
| **CAPTCHA visible en checkout** | Frena bots en el formulario | Cambio de UX | Fricción para clientes | No; App Check cubre el caso sin fricción |

**Alcance de App Check:** reduce ciertos vectores de abuso (scripts que no usan la app ni un token válido), pero un atacante puede obtener tokens desde un navegador real. No reemplaza el rate limiting ni la idempotencia, ni garantiza la ausencia de tráfico malicioso. Con App Check, el presupuesto **sigue sin tope absoluto**.

No se implementó un rate limiter en memoria: con varias instancias cada una tendría su propio contador, y se pierde con cada arranque en frío.

## Decisión de Release Gate

`createOrder` requiere protección contra reintentos duplicados (idempotencia) **antes de procesar pedidos reales**. No se implementa en este PR; es un bloqueo del Release Gate del piloto y va en un sprint propio.

## Próximo paso

Auditoría cruzada GPT y QA humano. Con aprobación: commit, push y PR con los 99 contratos en verde. Decisión aparte: App Check y controles de Blaze.
