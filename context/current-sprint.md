# Current Sprint

## Sprint: backend-1

**Goal:** Move AMON Delivery to backend-first writes without breaking current storefront, POS, and orders panel.

## Source of Truth

- **Firestore project:** `minerp-sentinel`
- **Firestore root:** `tenants/{tenantId}`
- **Pilot tenant:** `tbb`

## Rules

- No new Firebase project
- Backend-first
- No mock flows where real data exists
- SQLite bot remains fallback until bridge is stable

## Current Status

| Area | Status |
|---|---|
| Storefront (`apps/web`) | Working — home + `/tienda/[slug]` |
| POS (`apps/admin/pos`) | Working |
| Orders panel (`apps/admin/pedidos`) | Working |
| Daily metrics | Working |
| Bot SQLite | Working |
| Bot Firestore bridge | Pending |
| Backend API | Pending |

## Next Actions (prioritized)

1. **Create backend skeleton** — `apps/functions` with Firebase Functions structure, or alternative Node.js backend entry point.
2. **Implement `POST /api/orders`** — Order creation endpoint. Validates payload, timestamps, writes to `tenants/{tenantId}/orders`.
3. **Implement `PATCH /api/orders/:id/status`** — Status transition endpoint. Validates state machine, updates Firestore.
4. **Implement `POST /api/pos/sale`** — POS sale endpoint. Creates order + decrements inventory if applicable.
5. **Prepare bot bridge contract** — Define how SQLite bot events map to Firestore writes. See `contracts/api-contracts.md`.

## Working on This Sprint

- All API endpoints write directly to Firestore under `tenants/{tenantId}/orders`.
- Frontend sends minimal payload; backend validates, enriches, timestamps.
- No new Firestore collections without architect approval.
- Any change to order schema must update: `packages/shared/src/types/order.ts`, `packages/shared/src/schemas/order.schema.ts`, `contracts/order.schema.json`.

## Blockers / Risks

- `apps/functions` is empty — backend structure needs to be created from scratch.
- Firestore rules are open (`allow all`) — will need tightening before production, but not this sprint.
- No API routes exist yet in either app — first endpoint must establish patterns others will follow.
