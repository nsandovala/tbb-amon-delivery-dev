# Comprobante POS de AMON Shop

## Propósito

Mostrar al operador y al cliente un resumen imprimible/compartible después de
registrar una venta POS. Este comprobante sirve para validar el flujo comercial
durante la marcha blanca; no sustituye una boleta electrónica ni otro documento
tributario.

## Flujo aprobado

1. POS envía la venta por `createPosSale` como hasta ahora.
2. Tras el éxito, POS lee el pedido guardado con `getOrder` y arma el comprobante
   con los nombres, precios unitarios y totales persistidos por backend. Desde
   SEC-04 esa lectura es privada: envía el ID token del operador y exige
   membresía activa con `orders.read_private` (ver `roadmap/sprint-sec-04.md`).
3. Si esa lectura secundaria falla, no se repite ni revierte la venta; el POS
   conserva el resumen calculado que ya mostró al operador.
4. El POS y `/pedidos` ofrecen historial de pedidos existentes. Al abrir uno,
   reconstruyen el comprobante desde el documento Firestore actual; no se guarda
   un snapshot independiente ni se crea una colección nueva.
5. `Imprimir` abre el diálogo nativo del navegador/sistema operativo con una hoja
   preparada para papel de 80 mm. El operador elige una impresora instalada o
   Microsoft Print to PDF.
6. `Compartir` usa Web Share cuando está disponible; si no, copia el texto o
   presenta el texto para copiar.

## Decisiones

- Se usa el recurso `/images/stubs/logotbb.png` desde
  `apps/admin/public/images/stubs/logotbb.png`.
- La copia original adjunta es PNG RGB de 1024 × 1024, sin transparencia y con
  fondo casi negro. La presentación del comprobante la recorta circularmente.
  En una impresora térmica ese fondo puede consumir papel/tinta; se debe validar
  el resultado físico antes de decidir si crear una variante monocroma.
- El comprobante declara de forma visible: “No es boleta tributaria ni documento
  válido ante el SII”.
- No se enumera, configura ni controla impresoras desde la aplicación. Tampoco
  se agrega impresión ESC/POS, Bluetooth, NFC, TUU ni otro proveedor en esta fase.
- NFC, integración con terminal físico, impresoras Bluetooth/USB y emisión SII
  quedan separados como fases futuras, tras probar hardware real y definir el
  proveedor/contrato correspondiente.

## Límites y riesgos

- El sistema y el navegador no verifican la impresora seleccionada ni que la
  impresión haya terminado correctamente.
- El diálogo del navegador debe probarse en Windows con la impresora térmica
  concreta; formato, márgenes, escala y densidad dependen del driver.
- Si falla la lectura `getOrder` posterior a la venta, el comprobante usa el
  resumen POS como respaldo. La venta ya habrá quedado persistida.
- Los artículos se imprimen desde el snapshot de pedido; los modificadores no
  aparecen porque el POS actual no los captura como detalle estructurado.

## Cambios incluidos

- Pantalla POS: tienda activa, correo del operador, cambio claro/oscuro usando
  la preferencia `amon-operations-theme` y apertura del comprobante al registrar.
- Comprobante HTML accesible, diseño de impresión y opción de compartir.
- Lectura administrativa del pedido persistido tras crear venta POS.
- Historial POS en vivo con las 50 ventas más recientes, y acción para abrir el
  comprobante interno desde el detalle de cualquier pedido en `/pedidos`.
- Los pedidos cancelados se identifican como tales en el comprobante para no
  presentarlos como ventas vigentes.
- Sin cambios en Firestore, Functions, reglas, totales, flujo de estados o
  documento tributario.

## Validación

```bash
npx playwright test e2e/unit/m8-pos-receipt.spec.ts --config=playwright.config.ts
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
npm --workspace apps/admin run build
git diff --check
```

La impresión en papel y el diálogo nativo requieren QA manual en Windows con la
impresora física. No se ha desplegado ni fusionado este cambio.
