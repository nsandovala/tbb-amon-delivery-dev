# Repo Rules - AMON Delivery

## Objetivo

Estas reglas existen para mantener estable el flujo operativo de AMON Delivery mientras evoluciona el tenant piloto `TBB`.

## Reglas no negociables

### 1. Firestore manda

- Firestore es la fuente de verdad operativa.
- No inventar estado paralelo para pedidos, productos o tenant si ya existe coleccion real.
- El estado local en Zustand no puede convertirse en sistema de registro para pedidos.

### 2. No mocks si ya existe flujo real

- Si ya existe query, mutation, suscripcion live, seed o emulador funcional, usar eso.
- Solo usar mocks cuando el flujo real todavia no exista o este explicitamente fuera de alcance.
- Si se usa mock temporal, documentar por que existe y cual es la ruta de reemplazo.

### 3. Cambios incrementales

- Hacer cambios pequenos, verificables y faciles de revertir.
- No mezclar refactor estructural con cambio funcional salvo que sea imprescindible.
- Preservar compatibilidad con el flujo actual antes de mejorar arquitectura.

### 4. No sobreingenieria

- No agregar nuevas capas, providers, adapters o DSLs sin una necesidad real del flujo actual.
- No generalizar para multi-tenant complejo si el cambio actual solo necesita resolver `tbb`.
- No introducir patrones enterprise para problemas que se resuelven con una funcion clara y una query directa.

### 5. Preservar flujo POS -> pedidos -> estados

- No romper la creacion de pedidos desde storefront o POS.
- No romper la escritura en `tenants/{tenantId}/orders`.
- No romper las vistas live de pedidos.
- No romper las transiciones de estado operativas.
- Si se toca schema de pedido, validar `web`, `admin` y `shared`.

## Reglas de implementacion

### App Router

- En `apps/web` y `apps/admin`, respetar patrones de Next.js App Router ya presentes.
- Separar server y client components solo cuando el flujo lo requiera.
- No mover logica a cliente si ya puede resolverse mejor desde server/query existente.

### Firestore

- Reutilizar paths, converters, queries y mutations existentes antes de crear nuevas.
- Mantener nombres de campos coherentes entre escrituras y lecturas.
- Si hay inconsistencia de schema, corregir hacia una version operativamente estable en vez de ampliar la inconsistencia.

### Zustand

- Reservar Zustand para cart, UI state y estado local transitorio.
- No duplicar en Zustand un pedido que ya se persiste en Firestore como registro real.

### TailwindCSS

- Mantener estilos utilitarios alineados con el lenguaje visual actual de TBB.
- Evitar crear sistemas de diseño complejos si el cambio puede resolverse dentro del patrón existente.

## Checklist antes de mergear

1. El cambio usa flujo real en vez de mock cuando ese flujo ya existe.
2. El cambio no rompe TBB como tenant piloto.
3. El pedido sigue naciendo, persistiendose y leyendose desde Firestore.
4. Los estados operativos siguen siendo consistentes.
5. El cambio es incremental y entendible por otro agente sin contexto extra.

## Prioridad cuando haya conflicto

Si hay conflicto entre velocidad y consistencia:

1. preservar flujo operativo
2. preservar Firestore como verdad
3. reducir complejidad
4. optimizar ergonomia de desarrollo
