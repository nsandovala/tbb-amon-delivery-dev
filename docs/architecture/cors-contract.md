# CORS Contract — Functions HTTP (DEPLOY-READY-01, A2)

## Regla

Todas las Functions HTTP (19 al 2026-11-02, las exportadas en `apps/functions/src/index.ts`) se definen con `onRequestWithCors` (`apps/functions/src/lib/cors.ts`). No queda ningún `{ cors: true }`.

| Solicitud | Respuesta |
|---|---|
| Origen permitido | `Access-Control-Allow-Origin: <origen>` y `Vary: Origin` |
| Origen ajeno o sin `Origin` | Sin `Access-Control-Allow-Origin`; el handler se ejecuta igual |
| `OPTIONS` (preflight) permitido | `204`, `Allow-Origin`, `Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Allow-Headers: Authorization, Content-Type`, `Max-Age: 3600` |
| `OPTIONS` ajeno | `204` sin cabeceras CORS |

El preflight nunca llega al handler: no lee Firestore.

## Orígenes permitidos

| Entorno | Orígenes |
|---|---|
| Emulador (`FUNCTIONS_EMULATOR=true`) | `http://localhost` y `http://127.0.0.1` en 3000, 3001 (`next dev`), 5050 y 5055 (emulador de Hosting), más `AMON_CORS_ALLOWED_ORIGINS` si existe |
| Producción | Solo `AMON_CORS_ALLOWED_ORIGINS` |

`AMON_CORS_ALLOWED_ORIGINS` es una lista separada por comas de orígenes exactos: `https://`, sin ruta, query ni barra final, y nunca `localhost` ni `127.0.0.1`.

**Fail-closed:**

- Si la variable falta en producción, no se permite ningún origen.
- Si algún valor es inválido, se descarta la lista completa.
- En ambos casos se registra `CORS fail-closed` en el log de Functions.

## Cómo se fija en el despliegue (DEPLOY-PILOT-01, pendiente)

Firebase CLI carga `.env.<projectId>` desde el directorio fuente de Functions al desplegar. El workflow piloto despliega `.firebase-pilot/functions` (generado por `tools/prepare-firebase-pilot.mjs`, que hoy solo copia `lib/`, `package.json` y el lock). Pasos:

1. Variable de GitHub (no secreta) `FIREBASE_PILOT_CORS_ORIGINS` con los dominios de Hosting reales.
2. Tras `prepare-firebase-pilot.mjs`, escribir `.firebase-pilot/functions/.env.<projectId>` con `AMON_CORS_ALLOWED_ORIGINS=<valor>`.
3. Preflight del workflow: fallar si la variable está vacía o contiene `localhost`, `127.0.0.1` o `http://`.

El repo no guarda IDs ni dominios reales. Placeholder documentado:

```env
# apps/functions/.env.<projectId>  (NO commitear con valores reales hasta DEPLOY-PILOT-01)
AMON_CORS_ALLOWED_ORIGINS=https://<proyecto>-web.web.app,https://<proyecto>-admin.web.app
```

## Lo que CORS no es

CORS no es un control antiabuso. Solo decide qué páginas pueden **leer** la respuesta desde un navegador. `curl`, un script o un servidor ignoran CORS, y un origen ajeno igual ejecuta el handler. Los controles reales son:

- COST-GUARD: límites de cuerpo, líneas y `maxInstances`.
- La autorización por membresía.
- La idempotencia de pedidos.

App Check y el rate limit siguen como decisión pendiente.

## Pruebas

- `e2e/unit/deploy-ready-cors.spec.ts`: política productiva (fail-closed, lista exacta, sin locales) y cabeceras.
- `e2e/api/deploy-ready-cors.contract.spec.ts`: preflight permitido y ajeno en los 19 endpoints, `GET` y errores 400/401 contra el emulador oficial.
