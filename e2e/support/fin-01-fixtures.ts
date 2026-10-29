import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { getOperationalDateFor } from "../../apps/functions/src/lib/store-hours";
import {
  FIRESTORE_DOCS,
  PROJECT_ID,
  bearer,
  encodeFields,
  writeFixtureDoc,
} from "./emulator-fixtures";

/**
 * FIN-01 — fixtures de confirmación de transferencias contra el emulador.
 * Los pedidos se siembran directo (token `owner` del emulador) para controlar
 * estado, método, jornada y pago sin depender del horario real de la tienda.
 */

const OWNER = { Authorization: "Bearer owner" };
const TZ = "America/Santiago";

export function todayOperationalDate(): string {
  return getOperationalDateFor(new Date(), TZ);
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Clave de idempotencia válida (16–128 URL-safe). */
export function payKey(): string {
  return randomUUID();
}

export type SeedOrder = {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  total?: number;
  /** null: pedido legacy sin `operationalDate` (FIN-DATA-01). */
  operationalDate?: string | null;
  channel?: string;
  paymentConfirmation?: Record<string, unknown> | null;
};

export async function seedOrder(
  api: APIRequestContext,
  tenantId: string,
  orderId: string,
  seed: SeedOrder = {}
): Promise<{ orderId: string; total: number }> {
  const total = seed.total ?? 6500;
  await writeFixtureDoc(api, `tenants/${tenantId}/orders/${orderId}`, {
    id: orderId,
    tenantId,
    status: seed.status ?? "delivered",
    channel: seed.channel ?? "admin_pos",
    paymentMethod: seed.paymentMethod ?? "transfer",
    paymentStatus: seed.paymentStatus ?? "pending",
    ...(seed.paymentConfirmation !== undefined ? { paymentConfirmation: seed.paymentConfirmation } : {}),
    fulfillmentType: "pickup",
    customer: { name: "Cliente FIN-01" },
    items: [{ productId: "e2e-burger", productName: "E2E Burger", qty: 1, unitPrice: total }],
    totals: { subtotal: total, delivery: 0, total },
    displayCode: orderId.slice(-3),
    ...(seed.operationalDate === null ? {} : { operationalDate: seed.operationalDate ?? todayOperationalDate() }),
  });
  return { orderId, total };
}

function decodeValue(value: Record<string, unknown>): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    const values = ((value.arrayValue as { values?: Record<string, unknown>[] }).values ?? []);
    return values.map(decodeValue);
  }
  if ("mapValue" in value) {
    return decodeFields(((value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields) ?? {});
  }
  return undefined;
}

export function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

/** Documento decodificado, o null si no existe. */
export async function readDoc(api: APIRequestContext, path: string): Promise<Record<string, any> | null> {
  const res = await api.get(`${FIRESTORE_DOCS}/${path}`, { headers: OWNER });
  if (res.status() === 404) return null;
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  return decodeFields(body.fields ?? {}) as Record<string, any>;
}

/** Todos los documentos de una colección (paginado). */
export async function readCollection(api: APIRequestContext, path: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  let pageToken = "";
  do {
    const res = await api.get(
      `${FIRESTORE_DOCS}/${path}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      { headers: OWNER }
    );
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    for (const doc of body.documents ?? []) {
      rows.push({ __id: String(doc.name).split("/").pop(), ...decodeFields(doc.fields ?? {}) });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return rows;
}

/** Escritura atómica de varios documentos fixture (una sola llamada). */
export async function commitFixtureDocs(
  api: APIRequestContext,
  docs: { path: string; data: Record<string, unknown> }[]
): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const res = await api.post(`${FIRESTORE_DOCS}:commit`, {
      headers: OWNER,
      data: {
        writes: docs.slice(i, i + 400).map(({ path, data }) => ({
          update: {
            name: `projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
            fields: encodeFields(data),
          },
        })),
      },
    });
    expect(res.status(), await res.text()).toBe(200);
  }
}

export function confirmTransfer(
  api: APIRequestContext,
  token: string,
  body: { tenantId: string; orderId: string; expectedAmount: number; idempotencyKey: string; reference?: string }
): Promise<APIResponse> {
  return api.post("confirmTransferPayment", { headers: bearer(token), data: body });
}

export function revertTransfer(
  api: APIRequestContext,
  token: string,
  body: { tenantId: string; orderId: string; expectedConfirmationEventId: string; reason: string; idempotencyKey: string }
): Promise<APIResponse> {
  return api.post("revertTransferConfirmation", { headers: bearer(token), data: body });
}

export async function expectCode(res: APIResponse, status: number, code?: string): Promise<any> {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  const body = JSON.parse(text);
  if (code) expect(body.error?.code, text).toBe(code);
  return body;
}

export async function closeCash(
  api: APIRequestContext,
  token: string,
  tenantId: string,
  extra: Record<string, unknown> = {}
): Promise<APIResponse> {
  return api.post("closeCashSession", {
    headers: bearer(token),
    data: {
      tenantId,
      countedCash: 0,
      transfersConfirmed: 0,
      idempotencyKey: `fin01-close-${randomUUID()}`,
      override: { reason: "QA FIN-01 override auditado" },
      ...extra,
    },
  });
}
