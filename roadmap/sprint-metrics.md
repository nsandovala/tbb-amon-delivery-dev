# Sprint Metrics

## Objetivo

Entregar M6D: dashboard operativo minimo en `/metricas` para TBB/Foodtruck,
derivado en vivo desde `orders` y `expenses`, sin persistir metricas ni tocar
ERP/outbox/storefront.

## Alcance

- crear ruta admin protegida con `AdminGuard`
- soportar periodos `today`, `last7`, `last30`
- calcular KPIs desde Firestore live
- reutilizar `orders` y `expenses`
- unificar helper de timestamps y dia operacional donde habia duplicacion
- documentar reglas del dashboard

## Estado

- [x] `/metricas` protegida
- [x] link real en navegacion admin
- [x] helper compartido `apps/admin/src/lib/time.ts`
- [x] KPIs de ventas, gastos, neto, caja, ticket y pedidos
- [x] desglose por payment method
- [x] split `web` vs `admin_pos`
- [x] alerta de ordenes `admin_pos` activas sin cerrar
- [x] advertencia de caja visible
- [x] sin cambios en Functions, storefront o ERP

## Cambios implementados

### What changed

- Se agrego `apps/admin/src/app/metricas/layout.tsx` con `AdminGuard`.
- Se agrego `apps/admin/src/app/metricas/page.tsx` como dashboard operativo.
- Se activo el item real "Metricas" en `apps/admin/src/app/layout.tsx`.
- Se extrajo `apps/admin/src/lib/time.ts` para parseo de timestamps y corte
  operacional `05:00`.
- `apps/admin/src/app/pedidos/page.tsx` y `apps/admin/src/app/gastos/page.tsx`
  reutilizan helpers compartidos en vez de mantener logica duplicada.
- `apps/admin/src/hooks/use-live-expenses.ts` ahora permite consumidores sin
  limite explicito; `/gastos` conserva `50`.

### Why it changed

- Operacion necesitaba una vista minima y protegida de salud del negocio.
- El repo ya tenia datos reales en emulador y listeners live, por lo que agregar
  agregados persistidos o nuevas Functions era sobreingenieria.
- El helper comun evita que `/pedidos`, `/gastos` y `/metricas` diverjan otra vez
  en conceptos basicos de tiempo/timestamp.

## Reglas del dashboard

- Fuente de ventas: `tenants/tbb/orders`
- Fuente de gastos: `tenants/tbb/expenses`
- Ventas excluyen `status === cancelled`
- Gastos cuentan solo `status === active`
- Hoy operacional usa corte `05:00`
- `last7` y `last30` anclan al mismo corte operacional
- Caja estimada:

```txt
ventas cash - gastos cash
```

- Advertencia obligatoria:

```txt
Caja estimada no considera saldo inicial ni cierre formal de caja.
```

## Files modified

- `apps/admin/src/app/layout.tsx`
- `apps/admin/src/app/gastos/page.tsx`
- `apps/admin/src/app/pedidos/page.tsx`
- `apps/admin/src/app/metricas/layout.tsx`
- `apps/admin/src/app/metricas/page.tsx`
- `apps/admin/src/hooks/use-live-expenses.ts`
- `apps/admin/src/lib/time.ts`
- `docs/architecture/operational-metrics-contract.md`
- `roadmap/sprint-metrics.md`

## Contracts affected

- Nuevo: `docs/architecture/operational-metrics-contract.md`
- Sin cambios en Firestore schema
- Sin cambios en contracts HTTP de Functions
- Sin cambios en rules

## Validation commands

```bash
npm --workspace apps/admin run build
npm --workspace apps/functions run build
npm run seed
npm run test:e2e:api
node tools/test-rules-anon.mjs
git diff --check
python tools/amon_guard.py --all
```

## Validation result

- `apps/admin build`: OK
- `apps/functions build`: OK
- `seed`: OK
- `test:e2e:api`: OK, 16 passed
- `rules anon`: OK, 6/6
- `git diff --check`: limpio, con warnings LF->CRLF del worktree
- `amon_guard --all`: FAIL por hallazgos preexistentes ajenos a M6D

Findings actuales de `amon_guard --all`:
- `.claude/skills/render-deploy/references/configuration-guide.md`
- `.github/workflows/security-gate.yml`
- `tools/amon_guard.py`

## Remaining risks

- `/metricas` hace lectura live de colecciones completas; suficiente para marcha
  blanca, insuficiente para escala alta.
- El corte `05:00` sigue hardcodeado hasta que exista configuracion por tenant.
- Caja estimada no reemplaza arqueo ni cierre formal.
- El baseline del repo no deja `amon_guard --all` en verde todavia.

## Next step

Validacion manual de operador en `/metricas` con sesion admin y datos reales del
emulador. Despues de eso, el siguiente paso razonable es permitir filtros por canal
y mover el corte operacional a settings del tenant.
