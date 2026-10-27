# SEC-04 — Lectura privada de pedidos (`getOrder`)

## Estado

READY FOR REVIEW. Rama `fix/sec-04-private-order-read` sobre `19b32f4` (BUILD-01). Sin commit, PR, merge ni deploy.

## Qué cambió

- `getOrder` deja de ser público. Exige método GET, `orderId` con formato válido, `tenantId` explícito (sin fallback a `tbb`) y Firebase ID token con membresía activa y permiso `orders.read_private`.
- La autorización ocurre **antes** de leer Firestore. Un no autorizado recibe 401/403 tanto si el pedido existe como si no; el 404 solo aparece para un usuario ya autorizado.
- Nuevo permiso `orders.read_private` en la matriz central (owner y admin).
- El cliente admin (`getOrderApi`, usado por el recibo POS) envía el ID token.

## Por qué cambió

`getOrder` devolvía el pedido completo (nombre, teléfono y dirección del cliente) a cualquiera que conociera el `orderId`, sin autenticación, y con fallback silencioso al tenant `tbb`. Hallazgo P0 del Release Backlog v1 (SEC-04).

## Contrato del endpoint

`GET /getOrder/{orderId}?tenantId={tenantId}`, header `Authorization: Bearer <Firebase ID token>`.

| Caso | Código | `error.code` |
| --- | --- | --- |
| Método distinto de GET | 405 | `METHOD_NOT_ALLOWED` |
| `orderId` ausente o con formato inválido (`^[A-Za-z0-9_-]{1,128}$`) | 400 | `VALIDATION_ERROR` |
| `tenantId` ausente | 400 | `VALIDATION_ERROR` |
| Sin token, header mal formado o token inválido/expirado | 401 | `UNAUTHENTICATED` |
| Tenant inexistente, sin membresía, membresía revocada, otro tenant o solo claim legacy `admin:true` | 403 | `FORBIDDEN` |
| Autorizado y pedido inexistente en ese tenant | 404 | `NOT_FOUND` |
| Autorizado | 200 | — (`data` = pedido completo, igual que antes) |

Los rechazos no incluyen datos del pedido. El orden de validación (método → formato → tenant → autenticación → membresía/permiso → lectura) es parte del contrato.

Fuera de alcance, sin cambios: tracking público para compradores (se resolverá con `trackingToken`, ver `docs/architecture/customer-order-contract.md`), autenticación de compradores y los flujos de creación, estado, pagos, delivery y caja.

## Archivos modificados

- `apps/functions/src/routes/orders.ts`: validaciones y autorización de `getOrder`.
- `apps/functions/src/lib/permissions.ts`: permiso `orders.read_private`.
- `apps/admin/src/lib/api/orders.ts`: `getOrderApi` envía `Authorization`.
- `e2e/api/sec-04-private-order-read.spec.ts`: nueva suite de 15 contratos.
- `e2e/api/orders.contract.spec.ts`: las 6 lecturas `getOrder` existentes envían el token del owner.
- Documentación: este archivo, `roadmap/sprint-sec-base.md` (matriz), `docs/architecture/pos-receipt-contract.md`, `roadmap/phase-log.md`.

## Contratos afectados

- `getOrder`: de público a privado (tabla anterior). Cualquier consumidor sin token deja de funcionar. El único consumidor en el repo es el recibo POS del admin, que ya envía el token.
- Matriz de permisos: `orders.read_private` para owner y admin.
- Recibo POS: sin cambio funcional. Si la lectura falla, el POS conserva la venta y usa los valores mostrados (comportamiento ya existente).

## Validación

```bash
npm --workspace packages/shared run typecheck
npm --workspace apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
npx playwright test e2e/api --list --config=playwright.config.ts
git diff --check
```

- Todos aprobaron en local (Node 22). La suite compila: 80 contratos en 7 archivos, 15 de SEC-04.
- En vivo, con los emuladores de Auth y Functions (`demo-amon-ci`), se verificaron los rechazos previos a Firestore: 405, 400 sin tenant, 400 por ID inválido, 400 sin ID, 401 sin token, 401 con token inválido y 401 con header mal formado. Ninguna respuesta incluyó datos del pedido.
- **Pendiente de CI:** los contratos que requieren el emulador de Firestore (403, 200, 404 y no-distinción existente/inexistente) y la regresión de `orders.contract.spec.ts`. El entorno de ejecución local no pudo descargar el jar del emulador de Firestore.

## Riesgos restantes

1. Un consumidor externo al repo que llame `getOrder` sin token (scripts, bots, integraciones) recibirá 401. En el repo no existe ninguno.
2. `createOrder` mantiene el fallback a `tbb` cuando no recibe `tenantId`: fuera de alcance (no expone datos). Se revisará con ORDER-HARDENING.
3. La respuesta autorizada devuelve el pedido completo; un recorte de campos por rol no es necesario hoy porque solo owner/admin tienen el permiso.
4. El tracking público para compradores sigue sin existir; cuando se construya debe usar un endpoint distinto con `trackingToken` y datos mínimos, nunca `getOrder`.

## Próximo paso

Auditoría GPT y QA humano. Con aprobación: commit, push y PR con los contratos de CI en verde. Después: COST-GUARD.
