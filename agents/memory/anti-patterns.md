# Anti-Patterns

## Forbidden patterns

### 1. Direct critical writes from frontend
Do not use:
- addDoc
- setDoc
- updateDoc
- writeBatch
- runTransaction

for:
- creating orders
- creating POS sales
- changing order status
- recalculating totals
- delivery fee mutation

These must go through backend/functions.

### 2. firebase-admin outside backend/functions
Never import `firebase-admin`, `firebase-admin/app`, `firebase-admin/firestore`
or any wrapper around them in:
- `apps/web`
- `apps/admin`

### 3. Mock replacing real flow
Do not introduce mocks if:
- emulator exists
- seed exists
- Firestore collections exist
- backend flow is intended to exist now

### 4. Schema duplication across layers
Do not redefine order payload semantics separately in:
- web
- admin
- functions

Shared contract belongs in `packages/shared`.

### 5. Seed/query mismatch
Never write seed into one structure and query another one.
Example of dangerous drift:
- seed writes `tenants/{tenantId}/products`
- app reads `stores/{slug}/products`

### 6. Debug by refactor explosion
When diagnosing a live bug, do not:
- rename broad folders
- replace entire Firebase setup
- redesign app flow
- rewrite shared package structure

### 7. Success claims without verification
“Should work”, “probably fixed”, “ready” are invalid unless backed by commands and runtime result.

### 8. Decorative backend
Creating files or endpoints without wiring them into real flow is not considered progress.

### 9. Hidden contract drift
If order statuses, payment methods, fulfillment types or tenant fields differ between layers, stop and reconcile.

### 10. Security shortcuts
Never place secrets in tracked repo paths.
Never bypass backend validation to save time.