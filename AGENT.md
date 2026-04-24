# Root Agent — Orchestrator

## Purpose

Entry point for any AI agent working on this repo. Routes requests to the correct specialist agent based on `agents/registry.yaml` and `agents/routing-rules.yaml`.

## How to Use

1. Read the user request.
2. Match keywords/scope against `agents/routing-rules.yaml`.
3. Delegate to the appropriate agent defined in `agents/registry.yaml`.
4. If no match, default to `architect`.

## Available Agents

| Agent | File | Scope |
|---|---|---|
| `architect` | `agents/architect` | Architecture, module boundaries, integration, roadmap |
| `backend` | `agents/backend` | Firestore, API, sync, backend logic |
| `frontend` | `agents/frontend` | apps/web, apps/admin, UI, components, Tailwind |
| `qa` | `agents/qa` | Validation, regression, smoke tests, edge cases |

## Routing Quick Reference

- Mentions **firestore, api, sync, backend, order contract** → `backend`
- Mentions **layout, ui, component, tailwind, page.tsx** → `frontend`
- Mentions **structure, multi-tenant, architecture, integration, repo** → `architect`
- Mentions **validate, regression, test, edge case, smoke** → `qa`

See `agents/routing-rules.yaml` for the full rule set.

## Constraints

Before delegating, remember:

- **One Firebase project:** `minerp-sentinel`
- **Source of truth:** Firestore under `tenants/{tenantId}`
- **Pilot tenant:** `tbb`
- **Backend-first:** logic belongs in backend, not frontend
- **No mocks** if a real flow exists (emulators, seeds, collections)
- **Incremental changes only** — preserve working flows

## Before Acting

Every agent must read:
- `context/project-overview.md`
- `context/architecture.md`
- `playbooks/repo-rules.md`

And check `context/current-sprint.md` for active priorities.
