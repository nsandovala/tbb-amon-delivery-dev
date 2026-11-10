# STORE-MOBILE-UX-01

## Cambio y motivo
La cabecera y categorías permanecen accesibles durante el scroll; el carrito muestra su cantidad. Las tarjetas muestran descripciones completas y legibles. Se ocultan HEO y las métricas sociales sin fuente verificable, independientemente de los settings persistidos.

## Archivos y contratos
Cambios en layout, store-page, category-chips, store-header, product-card y product-descriptions de apps/web. No cambia el contrato de pedidos ni Firestore. Los textos autorizados se aplican solo a los IDs TBB conocidos, en presentación, sin modificar datos persistidos; los demás conservan su descripción existente.

## Validación y riesgos
Typecheck (tsc -p apps/web/tsconfig.json --noEmit --incremental false) y build (npm --workspace apps/web run build): PASS. Preflight de emulador limpio; el arranque de Firestore no produjo salida ni abrió el puerto y se interrumpió. Navegación móvil, carrito y checkout: no ejecutados. Burger a lo pobre no aparece en el catálogo versionado; no se asigna un ID supuesto. Combos y promociones conservan sus descripciones actuales, que no detallan ingredientes del producto incluido; deben completarse manualmente con información confirmada. Las descripciones locales deben mantenerse coordinadas con futuros cambios del catálogo.

## Próximo paso
Revisión humana del diff y prueba en iPhone antes de solicitar autorización para commit y PR.