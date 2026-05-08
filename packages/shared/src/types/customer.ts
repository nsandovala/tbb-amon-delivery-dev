/**
 * Customer MVP type — identified by normalized phone number.
 * Stored at tenants/{tenantId}/customers/{normalizedPhone}.
 */
export type Customer = {
  id: string;                       // normalizedPhone (doc ID)
  phone: string;                    // raw phone from latest order
  phoneNormalized: string;          // canonical "+56XXXXXXXXX"
  name: string;
  email?: string;
  addresses: string[];              // unique non-empty addresses
  totalOrders: number;
  totalSpent: number;               // accumulated total in CLP
  lastOrderAt: unknown;             // Firestore Timestamp
  lastPaymentMethod: string;
  lastFulfillmentType: string;
  createdAt: unknown;               // Firestore Timestamp
  updatedAt: unknown;               // Firestore Timestamp
};
