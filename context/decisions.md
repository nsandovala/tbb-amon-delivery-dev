# Decisions Log

## D-001
Use only one Firebase project: `minerp-sentinel`
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
