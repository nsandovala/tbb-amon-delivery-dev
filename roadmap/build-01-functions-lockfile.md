# BUILD-01 — apps/functions/package-lock.json desalineado (bloqueante antes del deploy piloto)

## Hecho observado

`apps/functions/package.json` declara `zod ^4.4.3` y `@amon/shared *`, mientras que `apps/functions/package-lock.json` sigue resolviendo:

- `zod ^3.23.0` (manifest obsoleto en el propio header del lock).
- No incluye `@amon/shared` como dependency.

Consecuencia inmediata: `npm ci --prefix apps/functions` falla con *lock file out of sync* y cualquier flujo que use ese lock resuelve una versión incorrecta.

El workflow piloto (`.github/workflows/firebase-pilot-manual.yml`) esquiva el problema porque genera un lockfile aislado para `.firebase-pilot/functions/` desde cero. Pero mientras `apps/functions/package-lock.json` siga en main:

- `npm ci` en `apps/functions` (por operadores, tooling o scripts futuros) explota.
- Un `firebase deploy --only functions` desde una checkout local sin preprocesar también usaría el lock obsoleto.

## Reproducción

```bash
cd apps/functions
npm ci
# npm error code EUSAGE
# npm error Missing: @amon/shared@* from lock file
# npm error Missing: zod@4.x from lock file
```

## Severidad

**Bloqueante antes del deploy piloto.** La protección actual (prepare-firebase-pilot.mjs + CI job que smoke-testea el paquete) solo cubre el camino automatizado. Si alguien dispara el deploy desde su máquina sin pasar por el workflow, puede desplegar un bundle con Zod 3 y sin la lógica actualizada.

## Plan

1. Regenerar el lockfile desde el workspace:
   ```bash
   npm install --package-lock-only --workspace apps/functions
   ```
2. Verificar que `apps/functions/node_modules/zod/package.json` reporte `4.x` tras `npm ci`.
3. Correr `npm --workspace apps/functions run build` + los contratos API contra emulador.
4. Commitear como follow-up aislado (no mezclar con SEC-BASE para que la revisión del lock quede visible y auditable por su cuenta).

## Rollback

Revertir el commit del lock. El workflow piloto no cambia; el paquete temporal se sigue regenerando.

## Estado

Follow-up abierto. **No se cierra en SEC-BASE** por decisión explícita (fuera de alcance). SEC-02 no depende de BUILD-01, pero **el deploy piloto sí**: no habilitar `FIREBASE_PILOT_DEPLOY_ENABLED=true` hasta que este follow-up esté fusionado.
