# Architecture

## Source of Truth
Firestore (`minierp-sentinel`) is the operational source of truth.

## Tenant Model
All business data lives under:
`tenants/{tenantId}/...`

## Current tenant pilot
`tbb`

## Channels
- storefront
- POS
- WhatsApp bot

## Rule
Channels may capture data, but operational truth must converge into Firestore.

## Bot persistence
SQLite remains local buffer/fallback until bridge is fully stable.

## Backend-first rule
Business logic, integration logic, validation, sync, and prompt orchestration belong in backend, not frontend.

## Current Implementation Map
- apps/web: storefront
- apps/admin: dashboard + pedidos + pos
- apps/functions: backend first
- packages/shared: types, schemas, seeds, utils