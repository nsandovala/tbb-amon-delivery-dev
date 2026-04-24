# Debugging Checklist

## Before You Start

- [ ] Confirm you're running against emulators, not production (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`)
- [ ] Seed data is loaded (`npm run seed`)
- [ ] Emulator UI accessible at `http://localhost:4000`

## Issue Classification

### 1. Order not appearing in Firestore

- [ ] Check emulator UI → Firestore → `tenants/tbb/orders`
- [ ] If empty: is the seed loaded? Run `npm run seed`
- [ ] If writing via frontend directly: check Firestore rules (currently open, but verify)
- [ ] If writing via backend endpoint: check endpoint logs for errors
- [ ] Verify `tenantId` matches — `tbb` is the pilot, not `test` or any other value

### 2. Order creation failing

- [ ] Check payload matches `contracts/order.schema.json`
- [ ] Verify all required fields: `tenantId`, `status`, `paymentStatus`, `paymentMethod`, `channel`, `fulfillmentType`, `items`, `totals`, `customer`
- [ ] Check `items[].unitPrice` and `totals` values are numbers, not strings
- [ ] Verify `channel` is one of: `web`, `admin_pos`, `whatsapp`, `own`
- [ ] Verify `status` is `queued` for new orders
- [ ] Check TypeScript types align: `packages/shared/src/types/order.ts` vs actual payload

### 3. Status transition failing

- [ ] Verify current status and target status are valid (see `contracts/order-status.md`)
- [ ] Check for invalid transitions (e.g., `delivered` → `preparing`, `queued` → `on_the_way`)
- [ ] Verify backend validates transitions — frontend may allow any value
- [ ] Check `statusChangedAt` is being set on transition

### 4. UI not reflecting Firestore data

- [ ] Check Firestore read path matches write path (`tenants/{tenantId}/orders`)
- [ ] If using Zustand: verify it's not caching stale data
- [ ] Check for subscription/listener errors in browser console
- [ ] Verify the component is reading from Firestore, not from local/mock state
- [ ] Check Tailwind classes aren't hiding content (e.g., `hidden`, `opacity-0`)

### 5. Storefront (`apps/web`) not loading

- [ ] `npm run dev:web` — check port 3000
- [ ] Check `apps/web/src/app/page.tsx` and `apps/web/src/app/tienda/[slug]/page.tsx` compile
- [ ] Verify Firebase client config is set (or pointing to emulator)
- [ ] Check browser console for Firebase auth/connection errors

### 6. Admin / POS (`apps/admin`) not loading

- [ ] `npm run dev:admin` — check port 3001
- [ ] Check `apps/admin/src/app/page.tsx`, `pedidos/page.tsx`, `pos/page.tsx` compile
- [ ] Verify Firebase client config is set
- [ ] Check `/pedidos` shows orders from Firestore
- [ ] Check `/pos` can create and display sales

### 7. Seed failing

- [ ] Check `FIRESTORE_EMULATOR_HOST` is set in env
- [ ] Verify `packages/shared/src/seed.ts` runs without type errors
- [ ] Check individual seed runners in `packages/shared/src/runners/`
- [ ] Verify seed data files in `packages/shared/src/data/tbb/` are valid
- [ ] If running against production: check credentials and project ID

## Common Root Causes

| Symptom | Likely cause |
|---|---|
| Orders visible in admin but not storefront | Different read paths or tenant filter mismatch |
| Status shows in Firestore but not in UI | UI reading from Zustand cache, not Firestore |
| Seed works but app shows nothing | App running against different project or emulator port |
| Types compile but runtime fails | Schema (Zod) doesn't match type definition |
| `tbb` orders not found | Wrong tenantId in query or write |

## When Stuck

1. Check Firestore directly in emulator UI — is the data there?
2. If yes: problem is in the read path (frontend or query)
3. If no: problem is in the write path (seed, backend, or direct write)
4. Compare `packages/shared/src/types/order.ts` vs `contracts/order.schema.json` — any drift?
5. Check `context/decisions.md` and `playbooks/repo-rules.md` — are you violating a constraint?
