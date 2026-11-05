# Order Status Contract

## State Machine

```
queued → preparing → ready → on_the_way → delivered
                                    ↓
                               cancelled (from active states)
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

1. **No backward transitions.** Once an order reaches `delivered`, it cannot go back to
   `queued`, `preparing`, `ready` or `on_the_way`.
2. **Forward skips are legal.** `queued → delivered` is allowed. The backend does not force an
   order through every intermediate state. A presential POS sale is closed in one step; a web
   order walks the full kitchen flow because the admin UI offers it that way, not because the
   contract requires it.
3. **`cancelled` is reachable from active states only** (`queued`, `preparing`, `ready`, or
   `on_the_way`), subject to the cash-close guard. `delivered → cancelled` returns `409 CONFLICT`;
   financial cancellation of a delivered order is not implemented. Once `cancelled`, no further transitions are allowed.
4. **Backend validates all transitions.** Frontend sends the desired target status; backend checks
   legality. `ILLEGAL_TRANSITIONS` in `apps/functions/src/schemas/order.shared.ts` is the **single
   source of enforcement**. Any allowlist in a frontend is a UX affordance, not the contract:
   it may be *stricter* than the backend, never looser.
5. **Every transition is timestamped.** The backend writes `statusChangedAt` on each update.
   This is the timestamp the financial contract uses as `occurred_at`.
6. **No new statuses** without architect approval. The six statuses above are the canonical set.

## Invalid Transitions

Mirrors `ILLEGAL_TRANSITIONS` exactly.

| From | To | Reason |
|---|---|---|
| `delivered` | `queued`, `preparing`, `ready`, `on_the_way`, `cancelled` | No backward transitions or cancellation after delivery |
| `cancelled` | any (except no-op) | Terminal state |
| any | unknown status | Not in enum |

### Explicitly legal forward skips

| From | To | Why it must stay legal |
|---|---|---|
| `queued` | `delivered` | Lets a presential POS sale be closed in one step, without faking a kitchen flow that did not happen |
| `queued` | `ready` / `on_the_way` | Same forward-skip rule |

> **P0 POS-READY:** `delivered → cancelled` was previously allowed; it is now rejected; a financial cancellation flow is not implemented. Forward skips remain allowed.

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
