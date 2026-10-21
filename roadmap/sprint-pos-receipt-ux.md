# Sprint POS: comprobante interno e impresión nativa

## Objetivo

Aplicar el mockup aprobado para mejorar el cierre de una venta POS y dejar
preparado un comprobante claro para compartir o imprimir durante las pruebas.

## Alcance implementado

- Identidad visible de la tienda TBB y correo del operador activo.
- Selector claro/oscuro sincronizado con la preferencia de Operación/Métricas.
- Comprobante posterior a la venta con logo TBB, número de pedido, fecha local,
  cliente, productos, totales, pago, origen y modalidad de entrega.
- Lectura del pedido persistido para reflejar precios y totales calculados por
  backend. Fallback al resumen del POS si falla esa lectura secundaria.
- Compartir mediante Web Share o copiar el detalle.
- Imprimir mediante el diálogo nativo del navegador/sistema. La aplicación no
  controla ni enumera dispositivos de impresión.
- Historial POS en vivo para consultar las 50 ventas más recientes y volver a
  abrir sus comprobantes desde el documento existente.
- Acceso a “Ver comprobante interno” desde el detalle de cualquier pedido en
  `/pedidos`, incluyendo los de web.
- Los comprobantes reconstruidos muestran estado cancelado cuando corresponde.
- Advertencia explícita de que el comprobante no tiene validez tributaria.

## Decisiones fuera del alcance

- No emitir boleta electrónica ni conectarse al SII.
- No integrar Flow, TUU, NFC, Bluetooth ni comandos ESC/POS.
- No persistir el comprobante como colección o snapshot: se deriva del pedido
  guardado que ya existe en Firestore.
- No cambiar la creación de ventas ni el ciclo de cierre POS.

## Archivos

- `apps/admin/src/app/pos/page.tsx`
- `apps/admin/src/app/globals.css`
- `apps/admin/src/components/pos/pos-receipt-dialog.tsx`
- `apps/admin/src/lib/pos-receipt.ts`
- `apps/admin/src/lib/api/orders.ts`
- El logo existente `apps/admin/public/images/stubs/logotbb.png` (se conserva;
  este parche no intenta volver a agregarlo).
- `e2e/unit/m8-pos-receipt.spec.ts`
- `docs/architecture/pos-receipt-contract.md`
- `roadmap/phase-log.md`

## Contratos afectados

- Reutiliza las APIs existentes `createPosSale` y `getOrder`; no cambia sus
  escrituras ni el esquema Firestore.
- El comprobante siempre se identifica como comprobante interno y no tributario.

## Validación

- `npx playwright test e2e/unit/m8-pos-receipt.spec.ts --config=playwright.config.ts`: 3/3 aprobadas.
- `./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit`: OK.
- `npm --workspace apps/admin run build`: OK; Next compiló, generó páginas y trazas. Mostró las advertencias conocidas de lockfiles duplicados y recuperación de caché Webpack.
- `git diff --check`: OK.
- Pendiente QA manual del diálogo de impresión en Windows y papel de 80 mm.

## Riesgos y siguientes pasos

- El PNG del logo tiene fondo negro opaco; una térmica podría imprimir demasiada
  superficie oscura. Probar antes de preparar una versión monocroma optimizada.
- El papel y los márgenes dependen de la configuración del driver de Windows.
- El soporte para impresoras térmicas, terminales NFC/TUU y boleta SII requiere
  descubrimiento e integración separados.
- Sin commit, push, PR, merge ni despliegue en este sprint.
