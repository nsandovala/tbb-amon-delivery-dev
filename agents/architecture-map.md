# Architecture Map — AMON Delivery

## Flujos Críticos

### 1. customer_order
**Path:** `apps/web` → `apps/functions` → Firestore → `apps/admin`

1. Usuario navega catálogo en storefront (`apps/web`)
2. Agrega productos al carrito (Zustand, estado local)
3. Checkout: valida nombre, teléfono, email, dirección
4. POST a `createOrder` (Firebase Function)
5. Function valida totales, asigna `delivery=1500` si `fulfillmentType=delivery`
6. Escribe en `tenants/{tenantId}/orders/{orderId}`
7. Admin `/pedidos` recibe en tiempo real via `useLiveOrders`
8. Admin cambia estados: `queued` → `preparing` → `ready` → `on_the_way` → `delivered`

**Colecciones Firestore:**
- `tenants/{tenantId}/orders/{orderId}` — documento principal
- `tenants/{tenantId}/customers/{customerId}` — upsert por phoneNormalized

**Schema canónico de orders:**
```ts
{
  id: string;
  customerId?: string;
  customerPhoneNormalized?: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  items: OrderItem[];
  fulfillmentType: "delivery" | "pickup";
  paymentMethod: "cash" | "transfer" | "card" | "pending";
  channel: "web" | "admin_pos" | "whatsapp";
  status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
  totals: {
    subtotal: number;
    delivery: number;
    total: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### 2. pos_sale
**Path:** `apps/admin` → `apps/functions` → Firestore

1. Staff abre `/pos` en admin
2. Selecciona productos, calcula total localmente
3. POST a `createPosSale` (Firebase Function)
4. Function valida y persiste en `tenants/{tenantId}/orders/{orderId}`
5. Marca `channel: "admin_pos"`, `fulfillmentType: "pickup" | "delivery"`

**Colecciones Firestore:**
- `tenants/{tenantId}/orders/{orderId}` — mismo schema que customer_order

---

### 3. operational_orders
**Path:** Firestore → `apps/admin` (live + detail)

- `/pedidos` escucha `tenants/{tenantId}/orders` en tiempo real
- Card muestra: `#ID`, canal, fulfillment, pago, total, estado
- Detail panel muestra: items, customer info, timeline, botones de transición
- Transiciones legales definidas en `LEGAL_TRANSITIONS` en `page.tsx`

**Colecciones Firestore:**
- `tenants/{tenantId}/orders/{orderId}`

---

### 4. admin_dashboard
**Path:** `apps/admin` → Firestore

- `/pedidos`: live orders panel
- `/pos`: punto de venta
- `/login`: Firebase Auth (emulator 9099)
- Auth guard protege rutas admin

**Colecciones Firestore:**
- `tenants/{tenantId}/orders/{orderId}`
- `tenants/{tenantId}/customers/{customerId}`

---

### 5. firebase_functions
**Build step explícito obligatorio:**
```bash
npm --prefix apps/functions run build
npm run dev:emulators
```

**Functions activas:**
- `createOrder` — POST, valida totales, crea orden + customer
- `getOrder` — GET, detalle de orden
- `updateOrderStatus` — PATCH, transición legal de estados
- `createPosSale` — POST, crea orden desde POS

**Emulator ports:**
- Firestore: 8080
- Functions: 5001
- Auth: 9099
- UI: 4000

---

### 6. firestore_rules
**Estado actual:** [PENDIENTE VERIFICAR]
- `firestore.rules` — verificar allow read/write

**Estado objetivo:**
- Admin autenticado: read/write en tenant asignado
- Anónimo: read solo si tracking token válido; write prohibido
- Verificar: `tools/test-rules-anon.mjs` (4/4 pasan hoy)

**Colecciones y paths:**
```
tenants/{tenantId}/
  orders/{orderId}
  customers/{customerId}
  categories/{categoryId}
  products/{productId}
  modifierGroups/{groupId}
  modifiers/{modifierId}
  settings/{settingsId}
```

---

## Diagrama de Datos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  apps/web   │────▶│  createOrder │────▶│ tenants/tbb/orders  │
│  (storefront)│     │  (Function)  │     │  + customers        │
└─────────────┘     └─────────────┘     └─────────────────────┘
                                              │
┌─────────────┐     ┌─────────────┐          │
│  apps/admin  │────▶│ createPosSale│─────────┘
│  (POS)       │     │  (Function)  │
└─────────────┘     └─────────────┘
                                              │
┌─────────────┐                              │
│  apps/admin  │◀─────────────────────────────┘
│  (/pedidos)  │     useLiveOrders (onSnapshot)
└─────────────┘
```
