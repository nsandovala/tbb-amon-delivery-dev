# Decisions Log

## D-001
Use only one Firebase project: `minierp-sentinel`
Reason:
- avoid duplicate billing
- reduce operational complexity
- accelerate pilot

## D-002
Use Firestore as operational source of truth
Reason:
- unify storefront, POS, and bot orders

## D-003
Use `tenants/{tenantId}` as root multi-tenant structure
Reason:
- simple, scalable, consistent

## D-004
Keep SQLite in bot as local persistence and fallback
Reason:
- do not break working bot while bridge is built

## D-005
Adopt backend-first rule
Reason:
- avoid frontend business logic sprawl

# D-006: Backend location
- Operaciones críticas viven en apps/functions
- apps/web y apps/admin no escriben directo a Firestore
- Lecturas públicas pueden usar SDK cliente mientras rules lo permitan

## D-007: UI → Functions Emulator proxy (same-origin)
**Date:** 2026-06-06
**Scope:** `apps/web`, `apps/admin`

**Problem:** Browser (Brave/Chromium) blocks `fetch` from `localhost:3000/3001` to `http://127.0.0.1:5001` due to **Private Network Access (PNA)** restrictions, causing `TypeError: Failed to fetch` in UI. Backend API works fine (E2E tests pass, `curl` works) because they bypass browser restrictions.

**Decision:** Use Next.js `async rewrites()` in `next.config.ts` to proxy `/api/functions/:path*` → `http://127.0.0.1:5001/minerp-sentinel/us-central1/:path*`. Frontend helpers (`orders.ts`) switch to relative path `/api/functions` when `NEXT_PUBLIC_USE_EMULATOR=true`.

**Files:**
- `apps/web/next.config.ts`
- `apps/admin/next.config.ts`
- `apps/web/src/lib/api/orders.ts`
- `apps/admin/src/lib/api/orders.ts`

**Trade-offs:**
- ✅ Fixes PNA/CORS without touching backend code.
- ✅ E2E tests unchanged (they hit emulator directly).
- ⚠️ Requires Next.js dev server running (does not work with static export).
- ⚠️ Production deployments must keep `NEXT_PUBLIC_USE_EMULATOR=false` to use direct Functions URL.

**Validation:**
- `npm --workspace apps/web run build` ✅
- `npm --workspace apps/admin run build` ✅
- `npm run test:e2e:api` ✅ (5 passed)
- Manual proxy smoke tests via `curl` to `/api/functions/createOrder`, `/api/functions/createPosSale`, `/api/functions/updateOrderStatus` ✅