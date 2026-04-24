# Release Checklist

## Before Release

### Code Quality

- [ ] TypeScript compiles with no errors (`npx tsc --noEmit` in each app)
- [ ] No unused imports in touched files
- [ ] No `any` types added without justification
- [ ] No `console.log` left in production paths (use logger from `packages/shared/src/helpers/logger.ts`)

### Data Flow

- [ ] Order creation flow tested end-to-end with emulators
- [ ] Status transitions validated against `contracts/order-status.md`
- [ ] Firestore path `tenants/{tenantId}/orders` confirmed working
- [ ] Payload validated against `contracts/order.schema.json`
- [ ] No direct Firestore writes from frontend for operational data (backend-first)

### Tenant Isolation

- [ ] All queries filter by `tenantId`
- [ ] No hardcoded tenant references other than `tbb` in seeds
- [ ] Seed data only targets emulator or explicit `SEED_TARGET`

### Agent Routing

- [ ] Changes routed to correct agent per `agents/routing-rules.yaml`
- [ ] Agent scope respected (no frontend agent touching Firestore, no backend touching UI)
- [ ] Architect consulted for schema or collection changes

### Regression Checks

- [ ] Storefront (`apps/web`) loads at port 3000
- [ ] Admin dashboard (`apps/admin`) loads at port 3001
- [ ] `/pedidos` shows orders from Firestore
- [ ] `/pos` can display and create sales
- [ ] `/tienda/[slug]` loads tenant storefront

### Emulator Validation

- [ ] `npm run dev:all` starts without errors
- [ ] Seed loads successfully (`npm run seed`)
- [ ] Orders appear in emulator UI (port 4000)
- [ ] Status transitions visible in Firestore emulator

## Deploy Steps (Firebase)

- [ ] `firebase deploy --only firestore:rules` (if rules changed)
- [ ] `firebase deploy --only functions` (if functions added)
- [ ] Verify production project `minerp-sentinel` — not a different project
- [ ] Smoke test: create order → verify in Firestore → transition status → verify

## Post-Release

- [ ] Orders panel shows new orders in production
- [ ] POS can create sales
- [ ] Status transitions work in production Firestore
- [ ] No console errors in storefront or admin
- [ ] `context/current-sprint.md` updated if sprint goals changed

## Rollback Plan

- [ ] If orders break: revert last commit, re-deploy
- [ ] If Firestore rules block writes: revert rules deploy, restore permissive rules
- [ ] If functions crash: `firebase functions:log` to diagnose, revert deploy
- [ ] Document incident in `context/decisions.md` as new D-XXX entry
