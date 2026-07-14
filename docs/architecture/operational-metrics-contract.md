# Operational Metrics Contract

## Purpose

`/metricas` is the minimum operational dashboard for the TBB/Foodtruck admin.
It is a live-derived view built from Firestore reads only.

It does not write documents.
It does not persist snapshots.
It does not call new Cloud Functions.

## Data sources

- Orders: `tenants/{tenantId}/orders/{orderId}`
- Expenses: `tenants/{tenantId}/expenses/{expenseId}`

Tenant in current phase:

```txt
tenantId = tbb
```

## Access

- Route: `/metricas`
- Guard: `AdminGuard`
- Reads use the same admin-authenticated Firestore access pattern already used by
  `/pedidos` and `/gastos`.

## Time windows

Operational cutoff:

```txt
05:00 local time
```

Periods supported:

```txt
today   = from current operational-day start to now
last7   = from current operational-day start minus 6 days to now
last30  = from current operational-day start minus 29 days to now
```

Orders are filtered by:

```txt
createdAt
```

Expenses are filtered by:

```txt
occurredAt
```

If `occurredAt` is not yet resolved in the live listener, the UI may temporarily
fall back to `createdAt` for local derivation only.

## KPI formulas

### Sales

Gross sales:

```txt
sum(order.totals.total) for orders where status != cancelled
```

Order count:

```txt
count(orders where status != cancelled)
```

Average ticket:

```txt
grossSales / orderCount
```

### Expenses

Active expenses:

```txt
sum(expense.amount) for expenses where status == active
```

### Net

Operational net:

```txt
grossSales - activeExpenses
```

Estimated cash:

```txt
salesCash - expensesCash
```

Mandatory warning:

```txt
Caja estimada no considera saldo inicial ni cierre formal de caja.
```

### Payment splits

Sales by payment method:

```txt
cash
transfer
pending
```

Expenses by payment method:

```txt
cash
transfer
pending
```

Legacy values outside that set may appear as "other" in UI, but they do not create
new contract values.

### Channel split

Sales comparison shown for:

```txt
web
admin_pos
```

### Open POS sales

Active unclosed admin POS orders:

```txt
channel == admin_pos
status in {queued, preparing, ready, on_the_way}
```

## Non-goals

- No charts or historical persistence layer.
- No ERP/outbox integration.
- No storefront changes.
- No catalog or CRM work.
- No backend aggregation documents.

## Validation baseline

Expected checks for M6D:

```bash
npm --workspace apps/admin run build
npm --workspace apps/functions run build
npm run seed
npm run test:e2e:api
node tools/test-rules-anon.mjs
git diff --check
python tools/amon_guard.py --all
```

## Risks

- Full live reads are acceptable for marcha blanca but not for indefinite scale.
- The `05:00` cutoff is still hardcoded until tenant settings exist.
- Estimated cash is not a formal cash-closing mechanism.
