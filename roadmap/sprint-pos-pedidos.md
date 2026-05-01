# Sprint POS + Pedidos

## Objetivo

Cerrar el loop operativo real de **POS** y **Pedidos en vivo** en modo producción, sin mocks, sin romper la arquitectura actual y manteniendo **Firestore como fuente de verdad**.

Este sprint responde al feedback funcional y visual levantado en tienda, carrito, POS y operación, incluyendo mejoras de claridad visual, orden del flujo de compra, medios de pago, estados operativos y métricas visibles. :contentReference[oaicite:0]{index=0}

---

## Alcance del sprint

### Dentro del sprint
- POS operativo real
- Pedidos en vivo operativos
- Mejora de feedback visual y UX de operación
- Traducción visible de estados al español
- KPI de ventas en CLP en vista operativa
- Ajustes productivos mínimos de Safari/contraste cuando afecten conversión o uso real :contentReference[oaicite:1]{index=1}

### Fuera de este sprint
- Rediseño mayor de landing/home
- Rediseño de storefront hacia **AMON Shop**
- Wallets
- Trust Layer completo
- Payouts por nivel
- Motor antifraude avanzado
- Geolocalización avanzada
- Seguimiento por correo
- Registro de nuevas tiendas/usuarios en panel
- Refactor grande de arquitectura :contentReference[oaicite:2]{index=2}

---

## Principios no negociables

- producción only
- no mocks
- no romper endpoints existentes
- no duplicar contratos
- no mover la fuente de verdad
- no tocar seeds salvo bug crítico demostrado
- cambios pequeños, verificables y reversibles
- cada cambio debe cerrar con prueba manual real

---

## Fuente de verdad

- Firestore sigue siendo la fuente de verdad operativa.
- Los pedidos viven en `tenants/{tenantId}/orders`.
- POS y storefront deben escribir por backend/functions, no con writes críticos directos desde frontend.
- El panel debe reflejar el estado persistido real, no simulaciones locales.

---

## Tabla brutal del sprint

| Módulo | Responsable | Prioridad | Objetivo | Criterio de terminado |
|---|---|---:|---|---|
| POS Operativo | Kimi | P0 | cerrar flujo de venta real y mejorar UX de caja | una venta se crea desde POS, aparece en pedidos y el feedback es claro |
| Pedidos en vivo | Quingon | P0 | cerrar operación de estados y legibilidad operativa | una orden cambia de estado desde UI y counters/KPIs responden bien |

---

## Módulo 1 — POS Operativo

### Responsable
Kimi

### Misión
Pulir la experiencia de caja para que sea una herramienta real de operación y no una demo frágil.

### Cambios requeridos
1. Mejorar flujo visual del carrito POS
2. Mantener el contexto al agregar productos
3. Evitar pérdida de feedback al agregar/quitar items
4. Campo **correo electrónico** opcional en datos del cliente :contentReference[oaicite:3]{index=3}
5. Alinear medios de pago visibles:
   - online
   - efectivo
   - transferencia
   - tarjeta
   - pendiente :contentReference[oaicite:4]{index=4}
6. Deshabilitar botón mientras procesa venta
7. Mostrar loading real
8. Mostrar éxito/error con mensajes trazables
9. Reset limpio del formulario tras venta exitosa
10. Total de venta visible y consistente
11. Corregir contraste/legibilidad si Safari rompe overlays o CTAs :contentReference[oaicite:5]{index=5}

### No tocar
- contratos backend salvo necesidad demostrada
- seeds
- estructura Firestore
- lógica de antifraude
- Trust Layer
- landing general

### Definition of Done
- desde `/pos` se crea una venta real
- la orden aparece en `/pedidos`
- el operador entiende el flujo sin adivinar
- no quedan errores genéricos falsos
- el botón de confirmar no dispara doble acción

---

## Módulo 2 — Pedidos en vivo

### Responsable
Quingon

### Misión
Convertir `/pedidos` en una consola operativa clara, rápida y entendible para cocina, caja y despacho.

### Cambios requeridos
1. Traducir labels visibles de estados al español: :contentReference[oaicite:6]{index=6}
   - queued → en cola
   - preparing → preparando
   - ready → listo
   - on_the_way → en camino
   - delivered → entregado
   - cancelled → cancelado

2. Mejorar feedback del cambio de estado
3. Evitar dobles clics en transición
4. Mostrar loading por card o por acción
5. Refrescar counters en tiempo real
6. Agregar KPI de **total de ventas en pesos CLP** en la cabecera operativa :contentReference[oaicite:7]{index=7}
7. Mejorar jerarquía visual de:
   - tarjeta de pedido
   - panel detalle
   - canal
   - fulfillment
   - pago
   - monto

8. Preparar espacio visual para riesgo/revisión futura sin implementar lógica nueva, en línea con el marco de riesgo y fulfillment definido para AMON Delivery. :contentReference[oaicite:8]{index=8}

### No tocar
- payout logic
- wallet logic
- niveles
- antifraude avanzado
- rutas de riders
- cambios cosméticos fuera de pedidos

### Definition of Done
- una orden cambia de estado desde UI
- Firestore refleja el cambio
- los counters responden correctamente
- el operador ve estados en español
- total ventas CLP queda visible

---

## Bugs / fricciones detectadas en feedback real

### Storefront / carrito
- modal de agregar papas con contraste deficiente en Safari :contentReference[oaicite:9]{index=9}
- el carrito debe quedar visible al añadir productos y no mandar al usuario fuera del contexto :contentReference[oaicite:10]{index=10}
- mover “indicaciones del pedido” inmediatamente después de productos del carro y antes de datos del cliente :contentReference[oaicite:11]{index=11}
- agregar campo correo electrónico en datos del cliente :contentReference[oaicite:12]{index=12}

### Tienda
- agregar horario de atención
- geolocalización automática
- botón de contacto tienda por WhatsApp
- botón HEO para menú/promociones :contentReference[oaicite:13]{index=13}

### Home AMON Delivery
- botón “Ir al panel” debe luego reorientarse a registrar nuevas tiendas y usuarios, pero eso queda fuera de este sprint P0 :contentReference[oaicite:14]{index=14}

### POS / pedidos
- métricas operativas pobres comparadas con flujos reales de apps como Uber Orders
- falta orden visual en catálogo
- falta total ventas visible en pedidos en vivo :contentReference[oaicite:15]{index=15}

---

## Orden recomendado de ejecución

1. Pedidos en vivo
2. POS operativo
3. Verificación manual end-to-end
4. Correcciones pequeñas de storefront ligadas a conversión
5. Cierre del sprint

### Razón
Primero se asegura el tablero de control.  
Después se acelera la caja.  
Primero el radar. Después el misil.

---

## Checklist de validación manual

### POS
- [ ] agrega producto
- [ ] suma/resta cantidades sin glitches
- [ ] completa datos cliente
- [ ] selecciona método de pago
- [ ] crea venta real
- [ ] muestra feedback correcto
- [ ] limpia estado tras éxito

### Pedidos
- [ ] la venta creada aparece en pedidos
- [ ] se puede seleccionar pedido
- [ ] se puede cambiar estado
- [ ] counters cambian
- [ ] total ventas CLP cambia
- [ ] labels visibles están en español

### Persistencia
- [ ] Firestore muestra documento correcto en `tenants/tbb/orders`
- [ ] el canal y fulfillment quedan bien persistidos
- [ ] no aparecen writes críticos directos desde frontend

---

## Riesgos conocidos

- Safari puede seguir mostrando diferencias visuales con overlays y blur
- storefront aún necesita una segunda pasada fuerte de UX
- seguimiento por correo no está implementado todavía
- geolocalización y contacto tienda siguen pendientes
- Trust Layer y antifraude solo quedan considerados como marco, no implementados en UI en este sprint 

---

## Cierre del sprint

Este sprint se considera cerrado cuando:
- POS vende
- Pedidos opera
- Estados cambian
- Counters responden
- Total ventas CLP está visible
- no quedan errores operativos falsos en los flujos principales
- la base queda lista para el siguiente frente: **rediseño AMON Delivery → AMON Shop**

---

## Próximo sprint

### Nombre
`Sprint Rediseño Delivery → AMON Shop`

### Objetivo
Tomar la base operativa ya estable y evolucionar el frente comercial hacia un modelo más claro, multi-tienda y vendible, alineado con:
- tiendas destacadas
- pickup / own delivery / AMON delivery / hybrid
- contacto directo
- geolocalización
- horario
- onboarding comercial de nuevas tiendas
- futura capa Trust Layer / formalización / antifraude / niveles :contentReference[oaicite:17]{index=17}