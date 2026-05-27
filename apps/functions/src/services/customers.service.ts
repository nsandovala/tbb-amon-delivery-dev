import { upsertCustomer } from "../repositories/firestore-customers.repo";
import { logger } from "../lib/logger";

/* ------------------------------------------------------------------ */
/*  Chilean phone normalization                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalize a Chilean phone number to "+56XXXXXXXXX" (E.164, 12 chars).
 *
 * Accepted inputs:
 *   +56912345678   → +56912345678
 *   56912345678    → +56912345678
 *   912345678      → +56912345678
 *   09 1234 5678   → +56912345678
 *
 * Returns null if the result doesn't look like a valid Chilean mobile.
 */
export function normalizeChileanPhone(raw: string): string | null {
  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, "");

  let digits: string;

  if (cleaned.startsWith("+56")) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith("56") && cleaned.length >= 11) {
    digits = cleaned.slice(2);
  } else {
    digits = cleaned.replace(/^\+/, "");
  }

  // Remove leading 0 (e.g. "09…")
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Chilean mobile: 9 digits starting with 9
  if (digits.length === 9 && digits.startsWith("9")) {
    return `+56${digits}`;
  }

  // Fallback: any 9-digit Chilean number (landline etc.)
  if (digits.length === 9) {
    return `+56${digits}`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Customer upsert after order creation                              */
/* ------------------------------------------------------------------ */

export interface CustomerOrderContext {
  tenantId: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  orderTotal: number;
  paymentMethod: string;
  fulfillmentType: string;
}

/**
 * Upsert a customer record based on the phone from the order.
 * Returns the normalizedPhone (used as customerId) or null if the phone
 * couldn't be normalized.
 *
 * This is fire-and-forget safe — order creation should NOT fail if
 * customer upsert fails.
 */
export async function upsertCustomerFromOrder(
  ctx: CustomerOrderContext
): Promise<string | null> {
  const normalized = normalizeChileanPhone(ctx.customer.phone);

  if (!normalized) {
    logger.warn("Could not normalize customer phone, skipping customer upsert", {
      tenantId: ctx.tenantId,
      rawPhone: ctx.customer.phone,
    });
    return null;
  }

  try {
    await upsertCustomer(ctx.tenantId, normalized, {
      rawPhone: ctx.customer.phone,
      name: ctx.customer.name,
      email: ctx.customer.email,
      address: ctx.customer.address,
      orderTotal: ctx.orderTotal,
      paymentMethod: ctx.paymentMethod,
      fulfillmentType: ctx.fulfillmentType,
    });

    logger.info("Customer upserted", {
      tenantId: ctx.tenantId,
      customerId: normalized,
    });

    return normalized;
  } catch (err) {
    logger.error("Customer upsert failed (non-blocking)", {
      tenantId: ctx.tenantId,
      phone: normalized,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
