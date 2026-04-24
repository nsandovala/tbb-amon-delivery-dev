# Firestore Collections Contract

## Root
tenants/{tenantId}
tenants/{tenantId}/orders/{orderId}
tenants/{tenantId}/products/{productId}
tenants/{tenantId}/categories/{categoryId}
tenants/{tenantId}/settings/store
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