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
| Backend API (`apps/functions`) | Working — `createOrder`, `getOrder`, `createPosSale`, `updateOrderStatus` |
| Frontend → Functions wiring | **Fixed** — proxy same-origin via Next.js rewrites (see `D-007`) |
| Bot Firestore bridge | Pending |

## Next Actions (prioritized)

1. **Live Order Tracking** — Public order status page without login (`trackingToken`).
2. **Prepare bot bridge contract** — Define how SQLite bot events map to Firestore writes. See `contracts/api-contracts.md`.
3. **Production readiness** — Tighten Firestore rules, remove `allow all`.

## Completed This Sprint

- Backend skeleton (`apps/functions`) with Firebase Functions v2 (`onRequest`).
- `POST /createOrder` — validates payload, timestamps, writes to `tenants/{tenantId}/orders`.
- `GET /getOrder/:id` — reads order from Firestore.
- `PATCH /updateOrderStatus` — status transition endpoint with state machine validation.
- `POST /createPosSale` — POS sale endpoint (`channel=admin_pos`).
- **Frontend/API wiring fix** — Next.js `rewrites` proxy + relative `FUNCTIONS_BASE` for emulator. Resolves `Failed to fetch` in Brave/Chromium caused by PNA (Private Network Access). See `decisions.md` D-007.

## Blockers / Risks

- Firestore rules are open (`allow all`) — will need tightening before production.
- POS `startOfDay` is frozen at component mount; restart POS daily for accurate metrics.
- HEO Chatbot is decorative/non-functional.
- Cart drawer UX is compressed on mobile.
