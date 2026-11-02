# Sprint — TBB-TABLET-PREVIEW-01

## Objetivo

Preview estática de AMON Shop (Web y Admin) para verla en una tablet Samsung desde un
canal temporal de Firebase Hosting de 7 días, en un proyecto Spark independiente de
`minerp-sentinel`, sin Functions, Firestore, Auth ni usuarios reales.

## Decisiones (Nelson, 2026-11-02)

- Admin: alcance A, solo `/pedidos` y `/pos`, con datos ficticios y de solo lectura.
- Hosting habilitado manualmente en la consola del proyecto de vista previa (sitio por defecto).
- Orden: commit de DEPLOY-READY-01 (`3415646`) y rama `feat/tbb-tablet-preview-01` desde él.
- Sin apps web de Firebase: la vista previa no lleva el SDK.

## Estado

| Parte | Estado |
|---|---|
| Web: build de vista previa, escaneo, Hosting, deploy con barreras, pruebas, CI | Hecho, sin publicar |
| Admin `/pedidos` y `/pos` | Fuera de este PR (cierre 2026-11-02: alcance limitado a Web Preview); requiere decidir el mecanismo (ver abajo) |
| Primera publicación del canal `tablet-web` | Pendiente de aprobación |

## Qué cambió

Ver `docs/architecture/tablet-preview-contract.md` (mecanismo, capas de bloqueo,
escaneo, Hosting, publicación, rollback).

## Archivos

Nuevos:
- `apps/web/src/preview/{disabled.ts,demo-catalog.ts,firebase-client.ts,preview-notice.tsx}`
- `apps/web/src/preview/queries/{tenants,categories,products}.ts`, `apps/web/src/preview/api/orders.ts`
- `tools/build-preview.mjs`, `tools/deploy-preview.mjs`, `tools/test-preview.mjs`
- `firebase.preview-web.json`, `playwright.preview.config.ts`, `e2e/preview/tablet-web.spec.ts`
- `.github/workflows/tablet-preview.yml`
- `docs/architecture/tablet-preview-contract.md`, este archivo

Modificados:
- `apps/web/next.config.ts`: target `preview` y sustitución de módulos (solo en ese target).
- `apps/web/src/lib/public-env.ts`: `preview` se trata como build alojado (fail-closed).
- `apps/web/tailwind.config.ts`: incluye `src/preview/**`.
- `tools/build-hosting.mjs`: rechaza la marca `amon-preview-build` en producción.
- `playwright.config.ts`: la suite de contratos ignora `e2e/preview`.
- `package.json`: `build:preview:web`, `test:e2e:preview`.
- `roadmap/phase-log.md`.

## Validación

| Comando | Resultado |
|---|---|
| `node tools/test-preview.mjs` | 29/29 |
| `node tools/test-build-hosting.mjs` | 28/28 |
| `tsc -p apps/web` / `tsc -p apps/admin` | OK |
| Unitarias (`playwright test e2e/unit --project=contracts`) | 234 passed |
| `npm run build:preview:web` | OK; `out/` sin `firebase`, `firestore` ni `initializeApp` |
| `npm --workspace apps/web run build` (normal) | OK |
| `build-hosting.mjs --app web` con proyecto ficticio | OK; sin código de vista previa; la marca de build desaparece; `deploy-preview` lo rechaza |
| `emulators:exec --only hosting --config firebase.preview-web.json --project demo-amon-ci "npm run test:e2e:preview"` | 4 passed, 2 skipped (cabeceras en Windows) |

Hallazgos durante la validación:
- Tailwind no escaneaba `src/preview/`: el aviso quedaba sin estilo, detrás de la
  cabecera. Corregido; la prueba ahora exige que el aviso esté visible y sin tapar
  (verificado que falla con el build defectuoso).
- En Windows el emulador de Hosting no aplica `headers` (glob `\**`).
- `roadmap/phase-log.md` arrastra desde `2bc57a8` (2026-10-16, ya en `main`) dos líneas
  basura al inicio ("Warning: truncated output…"). No es de este sprint; se deja para limpieza.

## Admin: decisión pendiente

`app/layout.tsx`, `app/pedidos/page.tsx` y `app/pos/page.tsx` importan `firebase/auth` y
`firebase/firestore` directamente (además de `use-live-orders`, `use-order-codes`,
`use-live-payment-events`, `tenant-provider` y `handle-authz-loss`). Opciones:

1. Sustituir en el build de vista previa los paquetes `firebase/app`, `firebase/auth` y
   `firebase/firestore` por una implementación mínima de solo lectura sobre datos
   ficticios (las escrituras lanzan). Muestra las páginas reales sin tocarlas, pero es
   un sustituto del SDK (solo para la vitrina, nunca para QA).
2. Páginas de vista previa propias para `/pedidos` y `/pos` que reutilicen los
   componentes de presentación. No toca el SDK, pero no muestra exactamente las páginas reales.

## Riesgos

- El enlace del canal es público para quien lo tenga (`noindex`, sin secretos ni datos personales).
- La sustitución depende de rutas: un módulo nuevo que llame al backend quedaría fuera;
  lo detectan el escaneo, la CSP y la prueba de solicitudes fuera del origen.
- `.firebaserc` sigue apuntando por defecto a `minerp-sentinel`: publicar solo con `deploy-preview.mjs`.

## Próximo paso

1. Nelson decide el mecanismo del Admin (1 o 2).
2. Nelson aprueba la primera publicación de `tablet-web` en el proyecto de vista previa.
