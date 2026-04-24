# Phase Log

## Fase actual
Backend-first stabilization

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

## Hallazgos abiertos
- `apps/web` todavía tiene errores de typecheck
- queda al menos un write directo legacy en web por auditar/remover
- queries de catálogo/tenant en web tienen imports rotos (`../admin`)
- falta cerrar la migración completa del storefront al patrón backend-first

## Próximo objetivo inmediato
Dejar `apps/web` en verde y eliminar cualquier write directo restante a Firestore.

## Nota operativa
No endurecer Firestore Rules hasta que:
1. el flujo HTTP backend esté completo
2. el e2e esté validado
3. se confirme que frontend ya no depende de writes directos