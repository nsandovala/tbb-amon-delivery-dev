# Sprint: Polish de Operaciones

## Diseño aprobado — 2026-10-16

Nelson aprobó la dirección visual de la pantalla `/operacion` en modo claro y oscuro. El diseño identifica claramente qué tienda está activa y quién la opera, y organiza horario, estado, caja y bitácora como una herramienta de trabajo.

## Entrega de este incremento

- Se muestra el tenant y local activos con su ubicación, junto con el correo del usuario autenticado.
- Claro/oscuro se cambia desde Operaciones y la selección se conserva en el navegador. El modo oscuro es el predeterminado.
- Las fechas visibles usan formato `DD/MM/AAAA`; los contratos y valores ISO no cambian.
- Tras la primera revisión local, el modo claro se ajustó a superficies nieve mate, con más contraste en textos secundarios y más ancho para los selectores horarios.
- El horario semanal usa filas compactas, con estado y controles editables por día. Se eliminó la escala anterior de marcas horarias superpuestas.
- Caja muestra un resumen compacto y deja el arqueo en un detalle expandible. La bitácora queda debajo y puede mostrar hasta 25 eventos recibidos desde la API.
- Las excepciones de fechas especiales se configuran manualmente por fecha: cerrado, horario semanal o horario especial, con mensaje opcional al cliente. Se guardan y auditan en Functions/Firestore, se muestran en la tienda y las validan los guards de pedidos Web y POS. No se importa una lista nacional de feriados automáticamente; el operador decide qué fechas aplican a su local.
- Proveedores y tareas conservan estados vacíos y quedan para una pasada posterior. Agendar pedidos a una hora elegida por el cliente queda en backlog.
- Agendar pedidos a una hora elegida por el cliente queda en backlog.

## Límites

- La razón social y una identidad independiente por sucursal no existen aún en el modelo del tenant; la pantalla usa nombre, comuna y ciudad disponibles.
- El tema seleccionado se guarda en el navegador actual, no en el perfil del usuario.
- Las excepciones agregan un contrato de Functions y documentos `storeExceptions`; las reglas de Firestore siguen sin acceso de cliente y las escrituras pasan por Functions con rol admin.
- No incluye el rediseño de Métricas ni Home. El orden acordado es Operaciones, luego Métricas y finalmente Home.
- El seed local contiene ventas de demostración, no cifras reales.
- No se despliega a Firebase. El proyecto destino de Firebase debe confirmarse antes de preparar un despliegue.

## Validación

```bash
npm --workspace apps/admin run build
npx playwright test e2e/unit/m6j-control-room.spec.ts e2e/unit/m6j-store-hours.spec.ts --config=playwright.config.ts
git diff --check
```

Build, typecheck y las suites unitarias enfocadas pasan. La revisión del usuario en navegador local sigue siendo la validación visual final para diferentes tamaños de pantalla.

## Próximos pasos de producto

1. Revisar esta versión de Operaciones en local en escritorio y móvil.
2. Diseñar y validar Métricas con datos de demostración claramente identificados.
3. Rediseñar Home después de cerrar Operaciones y Métricas.
4. Tras validar Operaciones localmente, diseñar Métricas; luego rediseñar Home.
5. Diseñar proveedores y tareas cuando se priorice su persistencia.
