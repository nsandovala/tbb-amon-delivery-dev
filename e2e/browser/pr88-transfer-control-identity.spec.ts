import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createOpenFixtureTenant, FIXTURE_PASSWORD } from "../support/emulator-fixtures";
import { confirmTransfer, expectCode, payKey, readDoc, seedOrder } from "../support/fin-01-fixtures";
import { openHarness } from "./harness/page";
import { Transport, type HeldRequest } from "./harness/transport";

/**
 * PR #88 (P2-01, Codex) — `TransferPaymentControl` no arrastra estado de un
 * pedido a otro. Componente real en la misma posición del árbol para dos
 * pedidos confirmados (como el detalle de `/pedidos`), sesión real y
 * Functions en el emulador. La capa de transporte solo demora respuestas
 * reales: no se inventa ninguna.
 */

type Ctx = { tenantId: string; transport: Transport; a: Record<string, any>; b: Record<string, any> };

async function confirmedOrder(api: APIRequestContext, token: string, tenantId: string, orderId: string, reference: string) {
  const { total } = await seedOrder(api, tenantId, orderId);
  await expectCode(await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey(), reference }), 201);
  return (await readDoc(api, `tenants/${tenantId}/orders/${orderId}`))!;
}

async function setup(page: Page, request: APIRequestContext): Promise<Ctx> {
  const { tenantId, owner } = await createOpenFixtureTenant(request, "pr88-transfer");
  const a = await confirmedOrder(request, owner.token, tenantId, "pr88-order-a", "REF-A-111");
  const b = await confirmedOrder(request, owner.token, tenantId, "pr88-order-b", "REF-B-222");
  expect(a.paymentConfirmation.eventId).not.toBe(b.paymentConfirmation.eventId);
  const transport = new Transport(page, ["revertTransferConfirmation", "listPaymentEvents"]);
  await transport.install();
  const { errors } = await openHarness(page, "transfer-control", { tenantId, orders: [a, b] });
  await page.evaluate(
    ([email, password]) => (window as unknown as { __signIn: (e: string, p: string) => Promise<unknown> }).__signIn(email, password),
    [owner.email, FIXTURE_PASSWORD] as const
  );
  await expect(page.getByText("Seleccionado: pr88-order-a")).toBeVisible();
  expect(errors).toEqual([]);
  return { tenantId, transport, a, b };
}

const select = async (page: Page, id: string) => {
  await page.getByRole("button", { name: `Pedido ${id}` }).click();
  await expect(page.getByText(`Seleccionado: ${id}`)).toBeVisible();
};
const reason = (page: Page) => page.getByPlaceholder("Motivo obligatorio (mín. 5 caracteres)");
const openRevert = (page: Page) => page.getByRole("button", { name: "Revertir confirmación" }).click();
const submitRevert = (page: Page) => page.getByRole("button", { name: "Revertir confirmación" }).click();
const historyButton = (page: Page) => page.getByRole("button", { name: "Ver historial de pago" });
const body = (held: HeldRequest) =>
  held.json<{ orderId: string; reason: string; expectedConfirmationEventId: string; idempotencyKey: string }>();

test("revertir A, cambiar a B: B no hereda modo ni motivo y revierte con sus propios datos", async ({ page, request }) => {
  const { tenantId, transport, a, b } = await setup(page, request);

  await openRevert(page);
  await reason(page).fill("Motivo del pedido A");
  await select(page, b.id);
  await expect(reason(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);

  await openRevert(page);
  await expect(reason(page)).toHaveValue("");
  await reason(page).fill("Motivo del pedido B");
  await submitRevert(page);
  const held = await transport.next("revertTransferConfirmation", 0);
  expect(body(held)).toMatchObject({
    orderId: b.id,
    reason: "Motivo del pedido B",
    expectedConfirmationEventId: b.paymentConfirmation.eventId,
  });
  await held.deliver();
  expect(held.response?.status()).toBe(201);
  await expect(reason(page)).toHaveCount(0);

  expect((await readDoc(request, `tenants/${tenantId}/orders/${a.id}`))?.paymentStatus).toBe("paid");
  expect((await readDoc(request, `tenants/${tenantId}/orders/${b.id}`))?.paymentStatus).toBe("pending");
  expect(transport.count("revertTransferConfirmation")).toBe(1);
});

test("reversión de A en vuelo al cambiar a B: claves de idempotencia distintas y cada una a su pedido", async ({ page, request }) => {
  const { tenantId, transport, a, b } = await setup(page, request);

  await openRevert(page);
  await reason(page).fill("Motivo del pedido A");
  await submitRevert(page);
  const first = await transport.next("revertTransferConfirmation", 0);

  await select(page, b.id);
  await expect(reason(page)).toHaveCount(0);
  await openRevert(page);
  await reason(page).fill("Motivo del pedido B");
  await submitRevert(page);
  const second = await transport.next("revertTransferConfirmation", 1);

  expect(body(first)).toMatchObject({ orderId: a.id, reason: "Motivo del pedido A", expectedConfirmationEventId: a.paymentConfirmation.eventId });
  expect(body(second)).toMatchObject({ orderId: b.id, reason: "Motivo del pedido B", expectedConfirmationEventId: b.paymentConfirmation.eventId });
  expect(body(second).idempotencyKey).not.toBe(body(first).idempotencyKey);

  // La respuesta tardía de A llega a una instancia desmontada: B no cambia.
  await first.deliver();
  expect(first.response?.status()).toBe(201);
  await expect(page.getByRole("button", { name: /Revirtiendo/ })).toBeVisible();
  await second.deliver();
  expect(second.response?.status()).toBe(201);
  await expect(reason(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);

  for (const order of [a, b]) {
    expect((await readDoc(request, `tenants/${tenantId}/orders/${order.id}`))?.paymentStatus).toBe("pending");
  }
});

test("historial de A que llega tarde no se muestra bajo B", async ({ page, request }) => {
  const { transport, b } = await setup(page, request);

  await historyButton(page).click();
  const lateA = await transport.next("listPaymentEvents", 0);
  expect(lateA.request.url()).toContain("orderId=pr88-order-a");
  await select(page, b.id);
  await lateA.deliver();
  expect(lateA.response?.status()).toBe(200);
  await expect(historyButton(page)).toBeVisible();
  await expect(page.getByText(/REF-A-111/)).toHaveCount(0);

  await historyButton(page).click();
  const ownB = await transport.next("listPaymentEvents", 1);
  expect(ownB.request.url()).toContain(`orderId=${b.id}`);
  await ownB.deliver();
  await expect(page.getByText(/ref REF-B-222/)).toBeVisible();
  await expect(page.getByText(/REF-A-111/)).toHaveCount(0);
});
