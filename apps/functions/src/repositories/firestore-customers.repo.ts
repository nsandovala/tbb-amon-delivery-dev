import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

const CUSTOMERS_COLLECTION = "customers";

/**
 * Tenant-scoped reference: tenants/{tenantId}/customers
 */
function customersCol(tenantId: string): admin.firestore.CollectionReference {
  return getDb().collection("tenants").doc(tenantId).collection(CUSTOMERS_COLLECTION);
}

function customerDoc(tenantId: string, customerId: string): admin.firestore.DocumentReference {
  return customersCol(tenantId).doc(customerId);
}

export interface CustomerUpsertData {
  rawPhone: string;
  name: string;
  email?: string;
  address?: string;
  orderTotal: number;
  paymentMethod: string;
  fulfillmentType: string;
}

/**
 * Upsert a customer document.
 * - Doc ID = normalizedPhone
 * - If exists: increment counters, update optional fields if better informed
 * - If new: create from scratch
 */
export async function upsertCustomer(
  tenantId: string,
  normalizedPhone: string,
  data: CustomerUpsertData
): Promise<void> {
  const ref = customerDoc(tenantId, normalizedPhone);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const increment = admin.firestore.FieldValue.increment;

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists) {
      // ── UPDATE existing customer ──────────────────────────────
      const existing = snap.data() as Record<string, unknown>;

      const updates: Record<string, unknown> = {
        phone: data.rawPhone,
        totalOrders: increment(1),
        totalSpent: increment(data.orderTotal),
        lastOrderAt: now,
        lastPaymentMethod: data.paymentMethod,
        lastFulfillmentType: data.fulfillmentType,
        updatedAt: now,
      };

      // Update name if the new one is "better informed" (longer or non-empty)
      if (
        data.name &&
        (!existing.name || data.name.length > (existing.name as string).length)
      ) {
        updates.name = data.name;
      }

      // Update email if provided and currently missing
      if (data.email && !existing.email) {
        updates.email = data.email;
      }

      // Append address if new and non-empty
      if (data.address && data.address.trim().length > 0) {
        const existingAddresses = (existing.addresses as string[]) || [];
        const trimmed = data.address.trim();
        if (!existingAddresses.includes(trimmed)) {
          updates.addresses = admin.firestore.FieldValue.arrayUnion(trimmed);
        }
      }

      tx.update(ref, updates);

      logger.debug("Customer updated", { tenantId, customerId: normalizedPhone });
    } else {
      // ── CREATE new customer ───────────────────────────────────
      const addresses: string[] = [];
      if (data.address && data.address.trim().length > 0) {
        addresses.push(data.address.trim());
      }

      tx.set(ref, {
        id: normalizedPhone,
        phone: data.rawPhone,
        phoneNormalized: normalizedPhone,
        name: data.name,
        ...(data.email ? { email: data.email } : {}),
        addresses,
        totalOrders: 1,
        totalSpent: data.orderTotal,
        lastOrderAt: now,
        lastPaymentMethod: data.paymentMethod,
        lastFulfillmentType: data.fulfillmentType,
        createdAt: now,
        updatedAt: now,
      });

      logger.debug("Customer created", { tenantId, customerId: normalizedPhone });
    }
  });
}
