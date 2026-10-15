# Firestore Collections Contract

## Root
tenants/{tenantId}
tenants/{tenantId}/orders/{orderId}
tenants/{tenantId}/products/{productId}
tenants/{tenantId}/categories/{categoryId}
tenants/{tenantId}/settings/store
tenants/{tenantId}/settings/storeHours        (M6J, horario editable)
tenants/{tenantId}/settings/storeOperation    (M6J, override manual del día)
tenants/{tenantId}/storeEvents/{eventId}      (M6J, auditoría append-only)
tenants/{tenantId}/cashCloses/{operationalDate} (M6J, cierre de caja inmutable)
tenants/{tenantId}/orderCounters/{operationalDate}
tenants/{tenantId}/modifierGroups/{groupId}
tenants/{tenantId}/modifiers/{modifierId}

## Subcollections
- orders
- products
- categories
- settings
- customers
- daily_metrics

## Example
tenants/tbb/orders/{orderId}

## Document Types
See `packages/shared/src/types/`