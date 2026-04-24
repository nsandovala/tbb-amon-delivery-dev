# @amon/functions

Backend for AMON Delivery. Firebase Functions + Firestore writes.

## Quick Start

```bash
npm install
npm run build
npm run serve   # start Firebase emulators with functions
```

## Structure

```
src/
  index.ts              — entry point, function exports
  lib/                  — cross-cutting (firebase-admin, env, logger, errors)
  routes/               — HTTP function handlers (thin layer)
  services/             — business logic (validation, orchestration)
  repositories/         — Firestore access (queries, writes)
  schemas/              — Zod validation schemas
  types/                — TypeScript types (API layer)
```

## Rule

Routes → Services → Repositories.
No route writes to Firestore directly. No repository contains business logic.
