# Contrato — Vista previa estática para tablet (TBB-TABLET-PREVIEW-01)

## Propósito

Mostrar AMON Shop en una tablet Samsung desde un canal temporal de Firebase Hosting,
sin backend: sin Firestore, sin Functions, sin Auth y sin datos reales. Es una vitrina,
no un entorno operativo.

## Alcance actual

| App | Estado | Contenido |
|---|---|---|
| Web (`apps/web`) | Implementada | Portada + `/tienda/tbb` con la carta del seed; checkout deshabilitado |
| Admin (`apps/admin`) | Pendiente (alcance A aprobado: `/pedidos` y `/pos`) | Ver "Admin: decisión pendiente" |

## Mecanismo

`AMON_BUILD_TARGET=preview` (solo vía `tools/build-preview.mjs`, siempre con
`NEXT_OUTPUT=export`). En ese build, `apps/web/next.config.ts` sustituye al compilar
(webpack `NormalModuleReplacementPlugin`, por ruta absoluta ya resuelta) estos módulos:

| Módulo real | Reemplazo de vista previa | Comportamiento |
|---|---|---|
| `src/lib/firebase/client.ts` | `src/preview/firebase-client.ts` | Lanza al importarse (no debería importarse) |
| `src/lib/firebase/queries/tenants.ts` | `src/preview/queries/tenants.ts` | Tenant `tbb` del seed |
| `src/lib/firebase/queries/categories.ts` | `src/preview/queries/categories.ts` | Categorías del seed, por `sortOrder` |
| `src/lib/firebase/queries/products.ts` | `src/preview/queries/products.ts` | Productos activos del seed |
| `src/lib/api/orders.ts` | `src/preview/api/orders.ts` | Todo falla con `PREVIEW_DISABLED` (403), sin red |
| `src/components/store/pending-order-notice.tsx` | `src/preview/preview-notice.tsx` | Aviso fijo "Vista previa · Los pedidos y pagos están deshabilitados" |

- La carta sale de `packages/shared/src/data/tbb/{tenant,categories,products}.ts`
  (`experimental.externalDir` solo en este build). El contacto se reduce al Instagram público.
- Los reemplazos tipan contra el módulo real (`typeof Real.fn`): `tsc` detecta deriva de firmas.
- Los demás builds (dev, standalone, `build-hosting.mjs`) no cambian.
- `public-env.ts` trata `preview` como build alojado (sin valores locales), aunque no llega al bundle.

## Pedidos y operaciones financieras: deshabilitados en cinco capas

1. El código que llama a Functions no está en el bundle (reemplazo al compilar).
2. No hay URL de Functions ni configuración de Firebase en el bundle.
3. Hosting envía `Content-Security-Policy: connect-src 'self'` (el navegador no puede llamar afuera).
4. El proyecto de vista previa (Spark) no tiene Functions ni Firestore.
5. Escaneo de `out/` (abajo) antes de cualquier publicación.

`createOrderApi` rechaza con un 4xx: `recordOrderAttemptFailure` lo trata como
definitivo, el carrito muestra "No pudimos crear tu pedido. Vista previa: enviar
pedidos está deshabilitado." y no queda un intento pendiente en `sessionStorage`.

## Verificación del artefacto (`tools/build-preview.mjs --verify-out`)

Falla si algún `.html/.js/.css/.json/.txt/.map/...` de `out/` contiene:
`googleapis.com`, `firebaseio.com`, `cloudfunctions.net`, `firebaseapp.com`, `@firebase/`,
rutas `/createOrder`, `/createPosSale`, `/lookupOrderAttempt`, `/getStoreStatus`,
`/updateOrderStatus`, `/confirmTransferPayment`, `/revertTransferConfirmation`,
`/closeCashSession`, `/createExpense`, `/listMyMemberships`, una API key `AIza…`,
`127.0.0.1`, `localhost:`, `minerp-sentinel`, `minierp-sentinel` o `demo-amon-ci`.
Exige la marca `amon-preview-build`. Al terminar deja `out/.amon-build-target` = `preview`.

Inverso: `tools/build-hosting.mjs` rechaza `amon-preview-build` en un build productivo.

## Hosting (`firebase.preview-web.json`)

- Solo `hosting` (sin `firestore`, `functions` ni otros servicios), un único sitio, sin
  `site`/`target` (el proyecto llega por `--project`), sin rewrites.
- Cabeceras: CSP `connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'none'`,
  `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

## Publicación (`tools/deploy-preview.mjs`, única vía)

- `--project` obligatorio; rechaza `minerp-sentinel`, `minierp-sentinel` y `demo-*`
  (`.firebaserc` apunta por defecto a minerp-sentinel).
- Solo `hosting:channel:deploy` / `hosting:channel:delete` / `hosting:channel:list`; nunca
  el canal `live` ni `firebase deploy`.
- `--expires` de 1h a 7d (por defecto 7d).
- Publicar exige la marca de build y repite `--verify-out` sobre el mismo `out/`.
- firebase-tools local fijado en 15.34.1 (`AMON_FIREBASE_TOOLS_JS`); no descarga nada.
- El ID del proyecto no se versiona.

Comandos (PowerShell):

```powershell
$env:AMON_FIREBASE_TOOLS_JS = "$env:LOCALAPPDATA\npm-cache\_npx\36e7d4fb91a22cc5\node_modules\firebase-tools\lib\bin\firebase.js"
npm run build:preview:web
node tools/deploy-preview.mjs --app web --project <preview-project> --channel tablet-web --expires 7d
node tools/deploy-preview.mjs --project <preview-project> --list
```

Tras publicar, verificar las cabeceras contra la URL del canal:

```powershell
curl.exe -sS -D - -o NUL https://<preview-project>--tablet-web-<hash>.web.app/tienda/tbb
```

## Rollback y eliminación

```powershell
node tools/deploy-preview.mjs --app web --project <preview-project> --channel tablet-web --delete
node tools/deploy-preview.mjs --project <preview-project> --list   # solo debe quedar live
```

El canal live nunca recibe contenido; si no se borra, el canal expira solo.

## Pruebas

| Prueba | Qué cubre |
|---|---|
| `node tools/test-preview.mjs` (29) | Escaneo de `out/`, inverso en producción, barreras de `deploy-preview` (dry-run), config de Hosting |
| `npm run test:e2e:preview` | Tablet Galaxy Tab S4 vertical y horizontal sobre el emulador de Hosting: carta, aviso visible y sin tapar, checkout rechazado, cero solicitudes fuera del origen, cabeceras |
| `.github/workflows/tablet-preview.yml` | Lo anterior en Linux |

Limitación conocida: en Windows, el emulador de Hosting (superstatic, firebase-tools
15.34.1) normaliza el glob `**` con `path.sep` (`\**`) y no aplica ninguna cabecera
configurada; la prueba de cabeceras se omite en `win32` y corre en Linux (CI) y contra el canal.

## Admin: decisión pendiente

`/pedidos` y `/pos` (y el layout común) importan `firebase/auth` y `firebase/firestore`
directamente en la página (no solo vía `src/lib`). Sustituir solo módulos de `src/lib`
no alcanza: hace falta reemplazar los paquetes del SDK en el build de vista previa por
una implementación de solo lectura con datos ficticios, o crear páginas de vista previa
aparte. Requiere decisión antes de implementar.
