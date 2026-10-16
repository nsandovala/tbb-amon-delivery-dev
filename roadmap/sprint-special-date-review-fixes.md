# Mini sprint — Hallazgos de revisión de fechas especiales

**Fecha:** 2026-10-16

**Base:** `main` en `1dce460`

**Rama:** `fix/special-date-review-findings`

## Objetivo

Cerrar los comentarios P2 de Bot-GPT sobre el PR #74 y la revisión del PR #75, sin ampliar el alcance de Operaciones.

## Cambios

1. **Estado público efectivo:** la tarjeta de fechas informa apertura manual, cierre manual o jornada ya cerrada en caja antes de presentar la excepción de calendario. Los mensajes de clientes asociados a la decisión anterior no se reutilizan cuando un override la reemplaza.
2. **Excepciones administrables:** `getStoreControl` consulta toda fecha futura persistida, sin corte anual ni límite de 100. El endpoint público mantiene su ventana acotada a 90 días y 12 fechas.
3. **Cierre de caja prioritario:** el estado terminal `closed` se procesa antes de cualquier override. El aviso público no anuncia horario ni mensaje de excepción cuando la caja ya cerró la jornada.

## Criterios de aceptación

- Una fecha configurada como cerrada y abierta manualmente indica claramente que la tienda está recibiendo pedidos.
- Un cierre manual sobre una fecha con horario especial no anuncia el horario como vigente.
- Una jornada cerrada en caja no se presenta como abierta aunque exista un override de apertura.
- Una jornada cerrada en caja tampoco anuncia un horario especial ni se etiqueta como cierre manual si hay un override de cierre.
- Más de 100 excepciones futuras, incluidas las que estén a más de un año, aparecen en el panel tras volver a cargar.
- Los controles de pedidos web/POS y la precedencia backend no cambian.

## Validación

```bash
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
npx playwright test e2e/unit --config=playwright.config.ts
npx playwright test e2e/api/m6j-store-operation.contract.spec.ts --config=playwright.config.ts
npm --prefix apps/web run build
git diff --check
```

Resultado de esta estación: Functions build, Web typecheck/build, 87/87 unitarias y `git diff --check` pasan. La prueba API está añadida pero queda pendiente de ejecución local porque Firebase CLI no está instalado aquí y los emuladores no están activos.

## Riesgo pendiente

El listado administrativo puede crecer con el total de fechas futuras guardadas. Para el piloto se mantiene una consulta simple; si el volumen crece de forma significativa, el siguiente paso es paginar sin ocultar registros.

## Release gate

No desplegar Functions ni Web. Revisar el PR y ejecutar QA local primero; el proyecto Firebase destino sigue sujeto a confirmación explícita.
