# Bootstrap de TBB en preview — 2026-11-04

## PREVIEW-BOOTSTRAP-03 — ADC explícito

`--auth adc` usa `applicationDefault()` solo después de la confirmación real;
el dry-run sin confirmación permanece offline y no inicializa el SDK ni ADC.
El modo predeterminado `service-account` permanece compatible. ADC rechaza
`GOOGLE_APPLICATION_CREDENTIALS` para evitar seleccionar inadvertidamente un
archivo de credenciales; el SDK puede resolver ADC de usuario o identidad
adjunta. Se conservan las comprobaciones del proyecto, entorno y emuladores.
Archivos: `tools/bootstrap-preview.mjs`, `tools/test-bootstrap-preview.mjs` y
este documento. El plan y los contratos de Firestore no cambian.

El proyecto destino se fija explícitamente, pero no se inspecciona la identidad
ADC ni su proyecto de origen, cuota o permisos: una credencial de otro proyecto
puede tener acceso a preview. El proyecto devuelto por las opciones del SDK
refleja el valor fijado, no demuestra la identidad. Antes del acceso real una
persona debe verificar identidad, permisos y proyecto de cuota por separado.
No se leen ni imprimen tokens ni archivos de credenciales en el modo ADC por
el bootstrap; el SDK resuelve sus propias fuentes al conectar.

Comando propuesto para lectura real, **no ejecutado**, después de validar la
identidad ADC y autorizar explícitamente el acceso:

```powershell
node --import tsx tools/bootstrap-preview.mjs --project tbb-amon-preview --auth adc --dry-run --confirm-real-project tbb-amon-preview
```

Validación: `node --import tsx --test tools/test-bootstrap-preview.mjs`,
`node --check` para ambos scripts y `git diff --check`. Sin login, conexión,
deploy ni escritura remota. Siguiente paso: revisión humana de identidad,
permisos y plan; las pruebas locales no verifican autenticación real.

## PREVIEW-BOOTSTRAP-02 — integridad comercial

El plan de `settings/store` desactiva `cart.showLikes`, `cart.showRatings` y
`cart.floatingChatEnabled` para marcha blanca; conserva el resto de `TBB_SETTINGS`
y no modifica la fuente compartida ni los valores del catálogo. Archivos de este
ajuste: `tools/bootstrap-preview.mjs`, `tools/test-bootstrap-preview.mjs` y este
documento. Sin cambios de paths ni contratos de pedidos; un documento de settings
existente se conserva íntegro, por lo que esta configuración no lo actualizará.
No se encontraron referencias a estos tres nombres en `apps/web/src` ni
`apps/admin/src`; por tanto, desactivarlos en el plan no demuestra que la UI
los respete. Validación local: 9/9 pruebas del bootstrap, comprobaciones de
sintaxis, `git diff --check` y dry-run offline de 31 documentos; sin acceso remoto. Siguiente paso: revisión
humana del plan y de la visualización efectiva antes de autorizar carga real.

## Objetivo y alcance

Preparar `tbb-amon-preview` sin ejecutar el seed original, que sobrescribe datos y
carga pedidos demo. Esta entrega solo prepara código y lo valida localmente:
no se conectó con Firebase real, no hubo deploy, commit, push ni PR.

Archivos:

- `tools/bootstrap-preview.mjs`: CLI aislada, imports directos de los seis archivos
  de catálogo/configuración de `packages/shared/src/data/tbb/`; no importa seed,
  runners, orders ni bootstrap-owner.
- `tools/test-bootstrap-preview.mjs`: pruebas unitarias sin red.
- `packages/shared/src/data/tbb/tenant.ts`: dirección inicial corregida a
  **Pasaje Nueve 344, Tercer Sector, Playa Ancha, Valparaíso**, WhatsApp
  **+56969681939**. Usa el campo `location.address` ya definido en el contrato.
- `roadmap/sprint-preview-bootstrap.md`: procedimiento, decisiones y evidencia.

## Contrato y garantías

Único destino permitido: proyecto literal `tbb-amon-preview`, base `(default)`,
tenant literal `tbb`. `--project` es obligatorio: no acepta alias de `.firebaserc`,
`minerp-sentinel`, `demo-amon-ci` ni otro proyecto. No carga `.env`.

El plan actual contiene 31 documentos:

| Ruta | Cantidad |
| --- | ---: |
| `tenants/tbb` | 1 |
| `tenants/tbb/categories/{id}` | 6 |
| `tenants/tbb/products/{id}` | 20 |
| `tenants/tbb/modifiers/{id}` | 1 |
| `tenants/tbb/modifierGroups/{id}` | 1 |
| `tenants/tbb/settings/store` | 1 |
| `tenants/tbb/settings/storeHours` | 1 |

No lee ni escribe pedidos, clientes, pagos, gastos, contadores, cajas, eventos,
usuarios Auth ni membresías. No crea colecciones o esquemas nuevos. Conserva el
horario fuente de 17:30 a 22:30, siete días, America/Santiago, schemaVersion 1.
Los timestamps siguen el seed: createdAt/updatedAt en tenant y catálogo;
updatedAt en configuración. El actor del horario es `bootstrap-preview`.

Se exige exactamente uno de `--dry-run` y `--apply`:

- `--dry-run` solo: imprime payloads locales y `existence: not-checked`. No importa
  Firebase Admin, no busca ADC, no lee Firestore ni escribe.
- `--dry-run --confirm-real-project tbb-amon-preview`: permite únicamente lectura
  de los 31 paths y reporta `create` o `keep-existing-review`; no crea transacción
  de escritura. Esta confirmación habilita acceso real, incluso para lectura.
- `--apply --confirm-real-project tbb-amon-preview`: permite creación exclusiva.
  Primero lee todos los paths dentro de una transacción, luego usa `tx.create`
  para los faltantes. No usa set, update, merge ni delete. La transacción es
  atómica y las precondiciones de create impiden sobrescrituras en carreras;
  Firestore puede reintentar la transacción. Un error termina con código 1.

Para acceso real en el modo predeterminado se exige `GOOGLE_APPLICATION_CREDENTIALS`
de tipo `service_account` cuyo `project_id` coincida exactamente. ADC requiere
`--auth adc` explícito y rechaza esa variable. Se validan también GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT,
FIREBASE_PROJECT_ID, CLOUDSDK_CORE_PROJECT y FIREBASE_CONFIG (JSON o archivo).
Configuración ilegible o contradictoria aborta antes de conectar. Se rechazan
hosts de emuladores. Admin recibe el proyecto explícito y se comprueba de nuevo
antes de leer. Nunca se imprimen credenciales.

## Conflictos y reejecuciones

Todo documento existente se conserva íntegro, incluso si está inactivo, tiene
precios distintos, una dirección anterior o un horario editado. Se reporta como
`keep-existing-review`, sin afirmar que coincide ni publicar su contenido.
La política propuesta e implementada es **omitir existentes y crear faltantes**.
Por eso una segunda ejecución completa no escribe ni renueva timestamps.

Revisión humana: contrastar los documentos marcados con el plan local; resolver
discrepancias mediante un cambio separado y autorizado. No hay flag `--force`.
Una dirección antigua ya persistida NO será corregida por esta herramienta.
La omisión puede conservar inconsistencias entre documentos existentes y nuevos;
revisar los conflictos antes de usar `--apply`.

`tools/bootstrap-owner.mjs` permanece separado y sin modificaciones. Este
bootstrap no concede acceso ni reactiva membresías; el owner requiere su propio
procedimiento revisado después de que exista el tenant.

## Comandos propuestos para revisión humana

Desde la raíz, con dependencias ya instaladas (Node 22 y tsx del workspace):

```powershell
# Local, sin conexión; no garantiza existencia/ausencia remota.
node --import tsx tools/bootstrap-preview.mjs --project tbb-amon-preview --dry-run
```

Solo tras revisión humana, confirmar en la consola el proyecto y su base
`(default)`, revisar precios, horarios, IAM y credenciales fuera del repositorio.
La edición/configuración de la base y sus permisos no se comprobaron remotamente.
Verificar el entorno; si apunta a otro proyecto, detenerse y corregir la sesión
de forma deliberada. No copiar credenciales a la documentación ni a Git.

Los siguientes comandos **NO se ejecutaron** y requieren autorización de acceso
real. El primero solo lee; revisar su reporte antes de considerar el segundo:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\ruta-segura\tbb-amon-preview-service-account.json'
node --import tsx tools/bootstrap-preview.mjs --project tbb-amon-preview --dry-run --confirm-real-project tbb-amon-preview

# Escritura real: únicamente después de aprobar el plan y los conflictos.
node --import tsx tools/bootstrap-preview.mjs --project tbb-amon-preview --apply --confirm-real-project tbb-amon-preview
```

## Validación local y límites

- `node --import tsx --test tools/test-bootstrap-preview.mjs`: 8/8 PASS.
- `node --check tools/bootstrap-preview.mjs`: PASS.
- `node --check tools/test-bootstrap-preview.mjs`: PASS.
- `git diff --check`: PASS (aviso CRLF del `.firebaserc` preexistente).
- `npm --workspace apps/web run lint`: no completado, exit 1; el script existente
  `next lint` pide configurar ESLint. No se instalaron dependencias ni se modificó
  la configuración para resolverlo. No existe lint de tools en el repositorio.

Las pruebas usan un doble unitario en memoria, sin set/update/delete, para
verificar exclusión de datos operacionales, no sobrescritura, idempotencia,
inicialización parcial, dry-run sin escrituras, guards de proyecto y propagación
de errores. Se utiliza porque esta tarea limita la ejecución a verificaciones
locales; no es evidencia de integración real ni de concurrencia del SDK.
La validación futura del transporte/transacciones requiere un entorno autorizado.
No se ejecutaron builds, seed original ni suites API conectadas.

Riesgos restantes: credenciales/IAM y base real sin validar; horarios iniciales
pueden habilitar la aceptación de pedidos si las Functions ya están activas;
catálogo conserva los valores comerciales/UI fuente (incluidas métricas
decorativas de productos); datos existentes nunca se migran automáticamente.

## Estado y siguiente paso

Se preservaron `.firebaserc`, skills y directorios sin seguimiento preexistentes.
Sin staging. Revisar estos cuatro archivos y el plan local, decidir los conflictos
y autorizar por separado cualquier lectura o escritura real. Ningún comando
propuesto constituye una ejecución ni una autorización implícita.

## REPO-HYGIENE-01 — alias para tsx

El alias raíz `@shared/*` usa `./packages/shared/src/*`: con el valor del baseline sin `./`, el cargador tsx aborta con `Non-relative paths are not allowed when 'baseUrl' is not set` antes de iniciar el bootstrap, aunque los typechecks de los cuatro paquetes pasan. El cambio conserva el destino del alias y permite el dry-run offline y la resolución de Firebase Admin. Validación: dry-run offline, importación de módulos Admin sin inicialización, pruebas unitarias del bootstrap y typechecks. No cambia contratos Firestore. Riesgos y siguiente paso: la importación local no verifica conectividad ni credenciales; revisar y aprobar por separado cualquier acceso real.
