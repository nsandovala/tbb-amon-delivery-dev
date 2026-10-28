import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  createFixtureProduct,
  createOpenFixtureTenant,
  FIXTURE_PASSWORD,
  FIXTURE_PRODUCT,
  listFixtureDocs,
} from "../support/emulator-fixtures";
import { openHarness, settle, storedAttempt } from "./harness/page";
import { Transport, type HeldRequest } from "./harness/transport";

/**
 * ORDER-IDEMPOTENCY — PRUEBAS DE NAVEGADOR INTEGRADAS (POS).
 *
 * Real: la página `apps/admin/src/app/pos/page.tsx` dentro de `TenantProvider`
 * y `AdminGuard`, sesión en el emulador de Auth (owner con membresía en un
 * tenant aislado), catálogo y ventas del día por `onSnapshot` en el emulador
 * de Firestore, `createPosSale`, `getOrder` y `lookupOrderAttempt` en el
 * emulador de Functions, y el CSS real del admin.
 *
 * Controlado en la capa de transporte: cuándo llega cada petición y su
 * respuesta. "Salir del POS" desmonta la página como una navegación del
 * cliente; dentro de una misma vista, `isSubmitting` impide un segundo envío.
 */

const PAPAS = { id: "e2e-papas", name: "E2E Papas", price: 2500 };

type Ctx = { tenantId: string; scope: string; transport: Transport };

async function setup(page: Page, request: APIRequestContext): Promise<Ctx> {
  const { tenantId, owner } = await createOpenFixtureTenant(request, "browser-pos");
  await createFixtureProduct(request, tenantId, PAPAS);
  const transport = new Transport(page, ["createPosSale", "lookupOrderAttempt", "getOrder"]);
  await transport.install();
  await openHarness(page, "pos");
  await page.evaluate(
    ([email, password]) => (window as unknown as { __signIn: (e: string, p: string) => Promise<unknown> }).__signIn(email, password),
    [owner.email, FIXTURE_PASSWORD] as const
  );
  await expect(page.getByText(FIXTURE_PRODUCT.name, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  return { tenantId, scope: `pos:${tenantId}`, transport };
}

const sales = async (request: APIRequestContext, tenantId: string) =>
  (await listFixtureDocs(request, `tenants/${tenantId}/orders`)).length;

async function addProduct(page: Page, name: string) {
  await page
    .getByText(name, { exact: true })
    .first()
    .locator("xpath=ancestor::div[.//button][1]")
    .getByRole("button")
    .first()
    .click();
}

const confirmButton = (page: Page) => page.getByRole("button", { name: /Confirmar venta/ });
const notice = (page: Page) => page.getByRole("status").filter({ hasText: /venta/i });
const receipt = (page: Page) => page.getByRole("dialog", { name: "Comprobante interno" });
const keyOf = (held: HeldRequest) => held.json<{ idempotencyKey: string }>().idempotencyKey;
const codeOf = async (held: HeldRequest) => ((await (await held.forward()).json()).data?.displayCode as string) ?? "";

async function leaveAndReturn(page: Page) {
  await page.getByRole("button", { name: "Salir del POS" }).click();
  await page.getByRole("button", { name: "Volver al POS" }).click();
  await expect(confirmButton(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(FIXTURE_PRODUCT.name, { exact: true }).first()).toBeVisible();
}

/**
 * Venta K1 creada con respuesta retenida → salir y volver → reenvío (K1) que
 * no llega al backend → verificar (encontrada, formulario limpio) → venta nueva K2.
 */
async function newSaleWhileOriginalInFlight(page: Page, transport: Transport) {
  await addProduct(page, FIXTURE_PRODUCT.name);
  await confirmButton(page).click();
  const original = await transport.next("createPosSale", 0);
  const k1 = keyOf(original);
  const oldCode = await codeOf(original);

  await leaveAndReturn(page);
  await addProduct(page, FIXTURE_PRODUCT.name);
  await confirmButton(page).click();
  const resend = await transport.next("createPosSale", 1);
  expect(keyOf(resend)).toBe(k1);
  await resend.dropBeforeServer();
  // La venta original sigue en vuelo con la misma clave: sin aviso de error (CR-02),
  // pero el intento queda incierto y el aviso permite verificarlo.
  await expect(notice(page)).toContainText("Venta sin confirmar");

  await notice(page).getByRole("button", { name: "Verificar venta" }).click();
  await (await transport.next("lookupOrderAttempt", 0)).deliver();
  await expect(notice(page)).toContainText(`La venta #${oldCode} quedó registrada`);
  await expect(notice(page)).toContainText("Limpiamos el formulario");
  await notice(page).getByRole("button", { name: "Cerrar", exact: true }).click();

  await addProduct(page, PAPAS.name);
  await confirmButton(page).click();
  const next = await transport.next("createPosSale", 2);
  expect(keyOf(next)).not.toBe(k1);
  return { original, next, oldCode, k2: keyOf(next) };
}

test.describe("ORDER-IDEMPOTENCY POS (navegador + emuladores)", () => {
  test("respuesta 201 antigua: no abre comprobante ni pisa la venta en curso", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    const { original, next, oldCode, k2 } = await newSaleWhileOriginalInFlight(page, transport);

    await original.deliver();
    // La vista vieja (desmontada) lee su comprobante; tampoco tiene efectos.
    await (await transport.next("getOrder", 0)).deliver();
    await settle(page);
    await expect(receipt(page)).toHaveCount(0);
    await expect(page.getByText(new RegExp(`${oldCode} (creada|ya estaba registrada)`))).toHaveCount(0);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k2, status: "pending", uncertain: false });

    const newCode = await codeOf(next);
    await next.deliver();
    await (await transport.next("getOrder", 1)).deliver();
    await expect(receipt(page)).toContainText(newCode);
    expect(await storedAttempt(page, scope)).toBeNull();

    await receipt(page).getByRole("button", { name: "Nueva venta" }).click();
    await addProduct(page, FIXTURE_PRODUCT.name);
    await addProduct(page, PAPAS.name);
    await settle(page);
    await expect(confirmButton(page)).toContainText("$9.000");
    expect(await sales(request, tenantId)).toBe(2);
  });

  test("respuesta 200 (replayed) antigua de un reenvío: tampoco tiene efectos", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const original = await transport.next("createPosSale", 0);
    await original.loseResponse(); // creada; el POS ve error de red
    await expect(page.getByText("No pudimos confirmar la venta desde POS.")).toBeVisible();

    await confirmButton(page).click(); // reintento del mismo intento
    const replay = await transport.next("createPosSale", 1);
    expect(keyOf(replay)).toBe(keyOf(original));
    expect((await replay.forward()).status()).toBe(200);

    await leaveAndReturn(page);
    await notice(page).getByRole("button", { name: "Verificar venta" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(notice(page)).toContainText("quedó registrada");
    await notice(page).getByRole("button", { name: "Cerrar", exact: true }).click();

    await addProduct(page, PAPAS.name);
    await confirmButton(page).click();
    const next = await transport.next("createPosSale", 2);

    await replay.deliver();
    await (await transport.next("getOrder", 0)).deliver(); // lectura de la vista vieja
    await settle(page);
    await expect(receipt(page)).toHaveCount(0);
    await expect(page.getByText(/ya estaba registrada/)).toHaveCount(0);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: keyOf(next), status: "pending" });

    await next.deliver();
    await (await transport.next("getOrder", 1)).deliver();
    await expect(receipt(page)).toBeVisible();
    expect(await sales(request, tenantId)).toBe(2);
  });

  test("400 antiguo durante otra venta: sin mensajes ni estado engañosos", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const original = await transport.next("createPosSale", 0);
    expect((await original.forward({ ...original.json<Record<string, unknown>>(), items: [] })).status()).toBe(400);

    await leaveAndReturn(page);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    await (await transport.next("createPosSale", 1)).deliver();
    await (await transport.next("getOrder", 0)).deliver();
    await receipt(page).getByRole("button", { name: "Nueva venta" }).click();

    await addProduct(page, PAPAS.name);
    await confirmButton(page).click();
    const next = await transport.next("createPosSale", 2);

    await original.deliver();
    await settle(page);
    await expect(page.getByText(/No pudimos (confirmar|registrar) la venta/)).toHaveCount(0);
    await expect(notice(page)).toHaveCount(0);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: keyOf(next), status: "pending", uncertain: false });
    await next.deliver();
    await (await transport.next("getOrder", 1)).deliver();
    expect(await sales(request, tenantId)).toBe(2);
  });

  test("CR-02: 400 de un envío mientras otro con la misma clave termina en 201: una sola venta, sin perder la clave", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const a = await transport.next("createPosSale", 0);
    const k1 = keyOf(a);

    await leaveAndReturn(page);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const b = await transport.next("createPosSale", 1);
    expect(keyOf(b)).toBe(k1);

    expect((await a.forward({ ...a.json<Record<string, unknown>>(), items: [] })).status()).toBe(400);
    await a.deliver();
    await settle(page);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, status: "pending" });
    await expect(page.getByText("No pudimos registrar la venta desde POS.")).toHaveCount(0);

    const code = await codeOf(b);
    await b.deliver();
    await (await transport.next("getOrder", 0)).deliver();
    await expect(receipt(page)).toContainText(code);
    expect(await storedAttempt(page, scope)).toBeNull();
    expect(await sales(request, tenantId)).toBe(1);
  });

  test.describe("CR-01: lectura del comprobante demorada", () => {
    test("recarga durante la lectura: la venta vuelve 'sin confirmar' con su clave y se recupera sin duplicar", async ({ page, request }) => {
      const { tenantId, scope, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await confirmButton(page).click();
      const sale = await transport.next("createPosSale", 0);
      const k1 = keyOf(sale);
      const code = await codeOf(sale);
      await sale.deliver();
      await transport.next("getOrder", 0); // la lectura queda pendiente
      expect(await storedAttempt(page, scope)).toMatchObject({ key: k1 });

      await page.reload();
      await expect(notice(page)).toContainText("Venta sin confirmar", { timeout: 20_000 });
      expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, uncertain: true });

      await notice(page).getByRole("button", { name: "Verificar venta" }).click();
      await (await transport.next("lookupOrderAttempt", 0)).deliver();
      await expect(notice(page)).toContainText(`La venta #${code} quedó registrada`);
      expect(await sales(request, tenantId)).toBe(1);
    });

    test("salir del POS durante la lectura: al terminar, la venta queda 'sin confirmar' en la vista actual", async ({ page, request }) => {
      const { tenantId, scope, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await confirmButton(page).click();
      const sale = await transport.next("createPosSale", 0);
      const k1 = keyOf(sale);
      await sale.deliver();
      const read = await transport.next("getOrder", 0);

      await leaveAndReturn(page);
      expect(await storedAttempt(page, scope)).toMatchObject({ key: k1 });
      await read.deliver();
      await expect(notice(page)).toContainText("Venta sin confirmar");
      await expect(receipt(page)).toHaveCount(0);
      expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, uncertain: true });

      // Reintentar el mismo detalle reutiliza la clave: no duplica.
      await addProduct(page, FIXTURE_PRODUCT.name);
      await confirmButton(page).click();
      const retry = await transport.next("createPosSale", 1);
      expect(keyOf(retry)).toBe(k1);
      expect((await retry.forward()).status()).toBe(200);
      await retry.deliver();
      await (await transport.next("getOrder", 1)).deliver();
      // El toast de "ya estaba registrada" lo reemplaza enseguida la confirmación
      // live de Firestore; lo durable es el comprobante y que haya una sola venta.
      await expect(receipt(page)).toBeVisible();
      expect(await storedAttempt(page, scope)).toBeNull();
      expect(await sales(request, tenantId)).toBe(1);
    });

    test("fallo de la lectura: comprobante con el resumen del POS, una sola venta, intento cerrado", async ({ page, request }) => {
      const { tenantId, scope, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await confirmButton(page).click();
      const sale = await transport.next("createPosSale", 0);
      const code = await codeOf(sale);
      await sale.deliver();
      await (await transport.next("getOrder", 0)).dropBeforeServer();
      await expect(receipt(page)).toContainText(code);
      expect(await storedAttempt(page, scope)).toBeNull();
      expect(await sales(request, tenantId)).toBe(1);
    });
  });

  test("carrito modificado mientras la venta o la lectura están pendientes: se conserva", async ({ page, request }) => {
    const { tenantId, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const sale = await transport.next("createPosSale", 0);
    await sale.deliver();
    const read = await transport.next("getOrder", 0);
    await addProduct(page, PAPAS.name); // durante la lectura del comprobante
    await read.deliver();

    await expect(receipt(page)).toBeVisible();
    await expect(page.getByText("El carrito cambió mientras se confirmaba")).toBeVisible();
    await receipt(page).getByRole("button", { name: "Cerrar comprobante" }).click();
    await expect(confirmButton(page)).toContainText("$9.000");

    await confirmButton(page).click();
    const next = await transport.next("createPosSale", 1);
    expect(keyOf(next)).not.toBe(keyOf(sale));
    await next.deliver();
    await (await transport.next("getOrder", 1)).deliver();
    expect(await sales(request, tenantId)).toBe(2);
  });

  test("recuperación con carritos ambiguos: no limpia sola, bloquea el registro y pide decidir", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await confirmButton(page).click();
    const first = await transport.next("createPosSale", 0);
    await first.dropBeforeServer();
    await addProduct(page, FIXTURE_PRODUCT.name); // ×2: otro carrito con la misma clave
    await confirmButton(page).click();
    const second = await transport.next("createPosSale", 1);
    expect(keyOf(second)).toBe(keyOf(first));
    await second.loseResponse();

    await notice(page).getByRole("button", { name: "Verificar venta" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(notice(page)).toContainText("pero no sabemos con qué carrito");
    await expect(confirmButton(page)).toContainText("$13.000");

    await confirmButton(page).click();
    await expect(page.getByText("Hay una venta anterior pendiente de revisar.")).toBeVisible();
    expect(transport.count("createPosSale")).toBe(2);

    await notice(page).getByRole("button", { name: "Es esa venta: limpiar formulario" }).click();
    await expect(notice(page)).toHaveCount(0);
    expect(await storedAttempt(page, scope)).toBeNull();
    await expect(confirmButton(page)).not.toContainText("$");
    expect(await sales(request, tenantId)).toBe(1);
  });
});
