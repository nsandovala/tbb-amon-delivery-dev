# Order Status Contract

## State Machine

```
queued → preparing → ready → on_the_way → delivered
                                    ↓
                               cancelled (from any state)
```

## Status Definitions

| Status | Meaning | Who triggers it | Visible in |
|---|---|---|---|
| `queued` | Order received, awaiting kitchen | Backend (on creation) | Admin, POS, storefront |
| `preparing` | Kitchen started preparing order | Admin / POS | Admin, storefront |
| `ready` | Order ready for pickup/dispatch | Admin / POS | Admin, storefront |
| `on_the_way` | Delivery driver en route | Admin / POS / bot | Admin, storefront |
| `delivered` | Order completed | Admin / POS / bot | Admin, storefront |
| `cancelled` | Order cancelled | Admin / POS | Admin, storefront |

## Rules

1. **Only forward transitions are allowed.** No going back from `delivered` to `preparing`.
2. **`cancelled` is reachable from any state.** Once cancelled, no further transitions are allowed.
3. **Backend validates all transitions.** Frontend sends the desired target status; backend checks legality.
4. **Every transition is timestamped.** The backend writes `statusChangedAt` on each update.
5. **No new statuses** without architect approval. The six statuses above are the canonical set.

## Invalid Transitions

| From | To | Reason |
|---|---|---|
| `delivered` | any (except no-op) | Terminal state |
| `cancelled` | any (except no-op) | Terminal state |
| `queued` | `on_the_way` | Skips preparing + ready |
| `queued` | `delivered` | Skips all intermediate states |
| any | unknown status | Not in enum |

## Firestore Representation

Each order document in `tenants/{tenantId}/orders/{orderId}` contains:

```typescript
{
  status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
  statusChangedAt: Timestamp;  // set by backend on each transition
  // ... other order fields
}
```

## Schema Reference

- TypeScript type: `packages/shared/src/types/order.ts`
- Zod schema: `packages/shared/src/schemas/order.schema.ts`
- JSON Schema: `contracts/order.schema.json`
- Constants: `packages/shared/src/constants/order-status.ts`

All four must stay in sync. If you change a status value, update all four.
