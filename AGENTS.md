# AGENTS.md — AMON Shop / TBB Dev

## Purpose

Operational guide for all AI agents working in `tbb-amon-delivery-dev`.

This repo uses persistent memory. Agents must read existing project context before modifying code and must document every functional module after changes.

No more orphan changes. No more hidden context. No more "it worked in my prompt".

Recuerda: AMON solo persiste datos en Firestore. Todo el resto es temporal y está sujeto a expiración o purgado.

---

## Repo Shape

npm workspaces monorepo.

Workspaces:

```txt
packages/*
apps/*
```

| Path              | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `apps/web`        | Customer storefront — Next.js App Router, port 3000                    |
| `apps/admin`      | POS + orders dashboard — Next.js App Router, port 3001                 |
| `apps/functions`  | Firebase Functions backend — Node 20                                   |
| `packages/shared` | Zod schemas, types, constants, seeds — edit `src/`, compiled to `lib/` |

---

## Developer Commands

Root:

```bash
npm install
npm run dev:all
npm run dev:web
npm run dev:admin
npm run dev:emulators
npm run seed
npm run dev:reset
```

Validation:

```bash
npm --prefix packages/shared run typecheck
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

Workspace builds:

```bash
npm --workspace apps/functions run build
npm --workspace apps/admin run build
npm --workspace apps/web run build
npm --workspace packages/shared run build
npm --workspace packages/shared run typecheck
```

---

## Firebase

| Item               | Value             |
| ------------------ | ----------------- |
| Project            | `minerp-sentinel` |
| Firestore Emulator | `8080`            |
| Functions Emulator | `5001`            |
| Emulator UI        | `4000`            |
| Auth Emulator      | `9099`            |
| Functions source   | `apps/functions`  |
| Functions codebase | `amon-functions`  |

If emulator ports are stuck:

```bash
PIDS=$(lsof -tiTCP:4000,5001,8080,9099,3000,3001 -sTCP:LISTEN); [ -n "$PIDS" ] && kill -9 $PIDS || echo "Puertos libres"
```

Recommended manual startup:

```bash
npm --prefix apps/functions run build
npm run dev:emulators
npm run seed
npm run dev:web
npm run dev:admin
```

---

## Persistent Memory Rule

Before modifying code:

```bash
git branch --show-current
git status --short
git log --oneline -5
```

Then read:

- `roadmap/phase-log.md`
- `roadmap/sprint-backend-1.md`
- `playbooks/repo-rules.md`
- `docs/architecture/customer-order-contract.md`
- `context/project-overview.md`
- `context/architecture.md`
- `context/current-sprint.md`

If `git status --short` is not clean, stop and report.

---

## Architecture Constraints

- Firestore is source of truth.
- Critical writes must go through `apps/functions`.
- No direct frontend writes for orders/POS/status.
- Zustand is allowed only for cart/UI/transient state.
- No mocks when real emulator/seed/collection exists.
- Preserve working order flow:
  - Storefront/POS → Functions → Firestore → Admin live view
- Incremental changes only.
- Do not change Firestore structure without documentation and approval.

---

## Tenant Pilot

| Field        | Value                                        |
| ------------ | -------------------------------------------- |
| tenantId     | `tbb`                                        |
| Currency     | `CLP`                                        |
| City         | `Valparaíso`                                 |
| Capabilities | pickup, delivery, assistant, addons, reviews |

---

## Firestore Paths

Orders:

```txt
tenants/tbb/orders/{orderId}
```

Customers:

```txt
tenants/tbb/customers/{customerId}
```

Future public tracking:

```txt
tenants/tbb/orders/{orderId}.trackingToken
```

---

## Order Contract

Core fields:

```ts
{
  customerId?: string;
  customerPhoneNormalized?: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  items: OrderItem[];
  fulfillmentType: "delivery" | "pickup";
  paymentMethod: "cash" | "transfer" | "card" | "pending";
  channel: "web" | "admin_pos" | "whatsapp";
  status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
  totals: {
    subtotal: number;
    delivery: number;
    total: number;
  };
}
```

Delivery fee rule:

```txt
fulfillmentType === "delivery" → delivery = 1500
fulfillmentType === "pickup"   → delivery = 0
```

Backend is source of truth for totals.

Frontend may preview totals but must not be trusted for persisted totals.

---

## Customer MVP Contract

Customer identity during marchablanca:

```txt
customerPhoneNormalized
```

No customer Firebase Auth yet.

Customer path:

```txt
tenants/tbb/customers/{customerId}
```

Customer fields:

```ts
{
  id: string;
  phoneNormalized: string;
  name: string;
  email?: string;
  addresses?: string[];
  totalOrders: number;
  totalSpent: number;
  lastOrderAt?: Timestamp;
  lastPaymentMethod?: string;
  lastFulfillmentType?: "delivery" | "pickup";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Rules:

- Do not identify public users by raw phone in public URLs.
- Do not expose full phone/email publicly.
- Do not add Firebase Auth for final customers yet.
- Firebase Auth is future admin/staff/authenticated customer phase.

---

## Payments Roadmap

Current MVP:

```txt
cash
transfer
card disabled / "Próximamente"
```

Do not add SumUp.

Future:

```txt
Flow
```

Flow is future integration for online card payments:

```txt
order created
→ paymentStatus: pending
→ Flow payment session
→ webhook confirms payment
→ paymentStatus: paid
```

Do not implement Flow until operation is stable.

---

## Order Status Machine

Allowed statuses:

```txt
queued
preparing
ready
on_the_way
delivered
cancelled
```

Main flow:

```txt
queued → preparing → ready → on_the_way → delivered
```

`cancelled` can happen from active states.

---

## Shared Package

Edit source only:

```txt
packages/shared/src
```

Do not manually edit:

```txt
packages/shared/lib
```

After shared changes:

```bash
npm --workspace packages/shared run build
npm --workspace packages/shared run typecheck
```

---

## Functions Package

Source:

```txt
apps/functions/src
```

Compiled output:

```txt
apps/functions/lib
```

This repo may track `apps/functions/lib`. If build output changes after backend source changes, report it explicitly.

Do not commit unrelated `tsconfig.tsbuildinfo`.

---

## Agent Routing

| Scope                                                 | Agent       |
| ----------------------------------------------------- | ----------- |
| Architecture, module boundaries, roadmap              | `architect` |
| Firestore, Functions, APIs, customers, orders, totals | `backend`   |
| Storefront, admin UI, POS UI, cart, Tailwind          | `frontend`  |
| Typecheck, build, smoke, regression, E2E              | `qa`        |
| Phase logs, playbooks, contracts, AGENTS docs         | `docs`      |

---

## Documentation Requirement

Every functional module must update documentation.

Use one or more:

- `roadmap/phase-log.md`
- `roadmap/sprint-[module].md`
- `docs/architecture/[module]-contract.md`
- `playbooks/repo-rules.md`

Documentation must include:

1. What changed.
2. Why it changed.
3. Files modified.
4. Contracts affected.
5. Validation commands.
6. Remaining risks.
7. Next step.

---

## Current Completed Phase

AMON Shop / TBB operational phase:

- Storefront creates real orders.
- POS creates real sales.
- `/pedidos` receives live orders.
- Delivery fee fixed by `fulfillmentType`.
- Checkout validates name, phone, email, address.
- Papas Kaioken upsell exists.
- Customers MVP persists by normalized phone.
- Orders persist `customerId` and `customerPhoneNormalized`.

See:

- `roadmap/phase-log.md`
- `docs/architecture/customer-order-contract.md`

---

## Next Recommended Phase

Live Order Tracking without login.

Rules:

- No Firebase Auth yet.
- No public search by name/phone/email.
- Use a secure tracking token or orderId + validation strategy.
- Public tracking must expose only safe data.
- Customer can view status live.
- Admin still controls status from `/pedidos`.

Suggested docs:

- `roadmap/sprint-live-order-tracking.md`
- `docs/architecture/live-order-tracking-contract.md`

---

## Final Report Template

Every agent must finish with:

```md
## Summary

## Files Modified

## Contracts Affected

## Validation

## Documentation Updated

## Risks

## Git Status

## Next Step
```

No commit without approval.
