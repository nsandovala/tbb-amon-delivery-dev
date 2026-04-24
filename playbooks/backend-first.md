# Backend-First Playbook

## Principle

Business logic, validation, integration, sync, and orchestration belong in the backend — not in frontend components or client-side code.

## What This Means

| Concern | Where it lives |
|---|---|
| Order creation validation | Backend |
| Status transition rules | Backend |
| Timestamps, IDs, enrichment | Backend |
| Firestore writes | Backend |
| Bot → Firestore bridge | Backend |
| Prompt orchestration (future) | Backend |
| UI rendering | Frontend |
| Cart state (ephemeral) | Frontend (Zustand) |
| Navigation / routing | Frontend |
| Loading/empty/error states | Frontend |

## Rules

### 1. Frontend sends minimal payload

The frontend sends only what the user typed. Backend adds:
- `createdAt`, `updatedAt` timestamps
- `statusChangedAt` on status transitions
- Server-side validation
- Default values (`status: "queued"`, `paymentStatus: "pending"`)
- Enrichment (tenant resolution, customer lookup if needed)

### 2. Backend writes to Firestore

Frontend never writes directly to Firestore for operational data (orders, status changes, sales).
All writes go through backend endpoints that:
- Validate input against schemas in `packages/shared/src/schemas/`
- Enforce the order status machine (see `contracts/order-status.md`)
- Write to the correct path: `tenants/{tenantId}/orders/{orderId}`
- Return the persisted document (or relevant subset) to the caller

### 3. Frontend reads from Firestore (or backend API)

The frontend may read directly from Firestore via client SDK for real-time UI updates (orders panel, storefront).
But **writes** must always go through backend.

### 4. Backend-first does not mean backend-only

If an endpoint does not exist yet and a feature is needed:
1. Create the backend endpoint first (even if minimal)
2. Then connect the frontend to it
3. Do not implement the logic in the frontend as a temporary solution

### 5. Exceptions

The following are acceptable as frontend-only:
- Zustand cart state (ephemeral, not persisted)
- UI state (loading, modals, toasts, navigation)
- Direct Firestore reads for real-time UI (orders list, live status)
- Tailwind styling and component layout

## Endpoint Patterns

All endpoints target `apps/functions` (Firebase Cloud Functions) or API routes.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/orders` | Create order |
| `PATCH` | `/api/orders/:id/status` | Transition order status |
| `POST` | `/api/pos/sale` | Record POS sale |
| `GET` | `/api/orders` | List orders (filtered by tenant) |
| `GET` | `/api/products` | List products (filtered by tenant) |
| `GET` | `/api/metrics/today` | Daily metrics |

See `contracts/api-contracts.md` for payload details.

## Current Gap

`apps/functions` is empty. No Firebase Functions exist yet.
The first backend endpoint must establish the pattern others will follow:

1. Create `apps/functions/package.json` and `apps/functions/src/index.ts`
2. Use `firebase-admin` to write to Firestore
3. Validate input with schemas from `packages/shared`
4. Return structured JSON response
5. Handle errors with proper status codes

## Testing Backend-First

1. Start emulators: `npm run dev:emulators`
2. Call endpoint directly with `curl` or Postman
3. Verify Firestore document was created/updated in emulator UI (port 4000)
4. Then connect frontend
