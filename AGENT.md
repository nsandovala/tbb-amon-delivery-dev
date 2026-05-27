# Root Agent — AMON Orchestrator

## Purpose

Entry point for any AI agent working on this repo.

This file routes requests to the correct specialist agent and enforces the AMON persistent-memory workflow.

Agents must not behave as isolated chat sessions. They must read the repo memory, preserve working flows, document changes, and avoid inventing contracts that already exist.

## Repo

`tbb-amon-delivery-dev`

AMON Shop / TBB pilot monorepo.

- `apps/web`: customer storefront
- `apps/admin`: POS + live orders dashboard
- `apps/functions`: Firebase Functions backend
- `packages/shared`: shared schemas, types, constants, seeds

## Core Rule

AMON only persists operational truth in Firestore.

Everything else is temporary, derived, UI state, or subject to expiration/purge.

Source of truth:

```txt
tenants/{tenantId}
tenants/{tenantId}/orders
tenants/{tenantId}/customers
```

Pilot tenant:

```txt
tbb
```

Firebase project:

```txt
minerp-sentinel
```

## How to Use

1. Read the user request.
2. Run baseline checks.
3. Read persistent memory files.
4. Match scope against `agents/routing-rules.yaml`.
5. Delegate to the appropriate agent from `agents/registry.yaml`.
6. If no match, default to `architect`.
7. Do not modify code until constraints and current sprint are understood.

## Baseline Before Any Work

Every agent must run:

```bash
git branch --show-current
git status --short
git log --oneline -5
```

If `git status --short` is not clean, stop and report. Do not continue unless explicitly authorized.

## Persistent Memory Required

Before modifying code, every agent must read:

- `roadmap/phase-log.md`
- `roadmap/sprint-backend-1.md`
- `playbooks/repo-rules.md`
- `docs/architecture/customer-order-contract.md`
- `context/project-overview.md`
- `context/architecture.md`
- `context/current-sprint.md`

If a file does not exist, report it. Do not invent its content.

## Available Agents

| Agent       | File               | Scope                                                             |
| ----------- | ------------------ | ----------------------------------------------------------------- |
| `architect` | `agents/architect` | Architecture, module boundaries, integration, roadmap, contracts  |
| `backend`   | `agents/backend`   | Firestore, Functions, APIs, orders, customers, totals, sync       |
| `frontend`  | `agents/frontend`  | `apps/web`, `apps/admin`, UI, components, Tailwind, checkout, POS |
| `qa`        | `agents/qa`        | Validation, regression, smoke tests, edge cases, E2E checks       |
| `docs`      | `agents/docs`      | Roadmap, phase logs, contracts, playbooks, persistent memory      |

## Routing Quick Reference

- Mentions **Firestore, Functions, API, sync, backend, order contract, customers, delivery fee, totals** → `backend`
- Mentions **layout, UI, component, Tailwind, page.tsx, cart, checkout, POS visual** → `frontend`
- Mentions **structure, multi-tenant, architecture, integration, repo, contracts, roadmap** → `architect`
- Mentions **validate, regression, test, smoke, edge case, E2E** → `qa`
- Mentions **docs, phase-log, playbook, AGENTS, roadmap, memory, context** → `docs`

See `agents/routing-rules.yaml` for full routing.

## Non-Negotiable Constraints

- One Firebase project: `minerp-sentinel`
- Pilot tenant: `tbb`
- Firestore is source of truth.
- Critical writes go through `apps/functions`.
- Do not write orders directly from frontend.
- Zustand is only for UI/transient cart state.
- No mocks if emulator, seed, or collection exists.
- Preserve working flows.
- Incremental changes only.
- No Auth for customer final yet.
- Firebase Auth is reserved for admin/staff future phase.
- SumUp is out of MVP.
- Flow is future online payment provider, not current phase.
- Delivery fee is derived from `fulfillmentType`:
  - `delivery` → `1500`
  - `pickup` → `0`

## Current Operational Contracts

Orders live in:

```txt
tenants/tbb/orders/{orderId}
```

Customers live in:

```txt
tenants/tbb/customers/{customerId}
```

Customer identity in marchablanca:

```txt
customerPhoneNormalized
```

Orders must persist:

- `customerId`
- `customerPhoneNormalized`
- `customer`
- `items`
- `fulfillmentType`
- `paymentMethod`
- `totals`
- `status`
- `channel`
- `createdAt`
- `updatedAt`

## Required Validations

After code changes, run:

```bash
npm --prefix packages/shared run typecheck
npm --prefix apps/functions run build
./node_modules/.bin/tsc -p apps/admin/tsconfig.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

If build artifacts are generated, report them. Do not blindly commit `tsconfig.tsbuildinfo`.

## Documentation Requirement

Every functional module must update persistent documentation.

Update at least one:

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
7. Next recommended step.

## Commit Rule

Do not commit unless explicitly authorized.

When authorized, use small commits:

```txt
feat(scope): ...
fix(scope): ...
docs(scope): ...
chore(scope): ...
```

No mixed commits:

- code and docs can be together only if docs describe the exact module;
- generated artifacts must be intentional;
- never commit unrelated `tsconfig.tsbuildinfo`.

## Final Report Format

Every agent must finish with:

```md
## Summary
<what changed>

## Files Modified
<list>

## Contracts Affected
<orders/customers/totals/etc>

## Validation
<commands + result>

## Documentation Updated
<files>

## Risks
<remaining risks>

## Git Status
<git status --short output>

## Next Step
<one recommended action>
```
