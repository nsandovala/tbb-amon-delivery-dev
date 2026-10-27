import { test, expect, type Page } from "@playwright/test";
import { openHarness, waitForCall, respond, failNetwork, failHttp, settle, storedAttempt, calls } from "./harness/page";

/**
 * ORDER-IDEMPOTENCY O-05 — PRUEBAS DE COMPONENTE del POS en Chromium real.
 *
 * Se renderiza la página REAL `apps/admin/src/app/pos/page.tsx` (con su aviso
 * `PosPendingAttemptNotice` y el diálogo de comprobante). Se sustituyen solo
 * los bordes: API HTTP (llamadas pendientes que la prueba responde a mano),
 * Firestore (catálogo fijo, sin órdenes), Firebase Auth y el tenant activo.
 * "Salir del POS" desmonta la página como una navegación del cliente: es el
 * camino real por el que una respuesta llega cuando ya hay otra venta en curso
 * (dentro de la misma vista, `isSubmitting` impide un segundo envío).
 */

const SCOPE = "pos:t1";

const addProduct = (page: Page, name: string) =>
  page
    .getByText(name, { exact: true })
    .first()
    .locator("xpath=ancestor::div[.//button][1]")
    .getByRole("button")
    .first()
    .click();

const confirmSale = (page: Page) => page.getByRole("button", { name: /Confirmar venta/ }).click();
const notice = (page: Page) => page.getByRole("status").filter({ hasText: /venta/i });
const receipt = (page: Page) => page.getByRole("dialog", { name: "Comprobante interno" });
const keyOf = (call: { args: unknown[] }) => (call.args[0] as { idempotencyKey: string }).idempotencyKey;

/** Ítems del carrito POS según el resumen: "Confirmar venta · $X" refleja el total. */
const confirmLabel = (page: Page) => page.getByRole("button", { name: /Confirmar venta/ }).innerText();

/**
 * Venta K1 en vuelo → el operador sale y vuelve (página remontada, venta en
 * vuelo sigue viva) → reenvía (misma clave K1) y falla por red → verifica →
 * venta encontrada y formulario limpio → arma una venta NUEVA (K2) en vuelo.
 */
async function newSaleWhileOriginalInFlight(page: Page) {
  await addProduct(page, "Burger Clásica");
  await confirmSale(page);
  const original = await waitForCall(page, "createPosSaleApi", 0);
  const k1 = keyOf(original);

  await page.getByRole("button", { name: "Salir del POS" }).click();
  await page.getByRole("button", { name: "Volver al POS" }).click();
  await addProduct(page, "Burger Clásica");
  await confirmSale(page);
  const resend = await waitForCall(page, "createPosSaleApi", 1);
  expect(keyOf(resend)).toBe(k1);
  await failNetwork(page, resend.index);
  await expect(page.getByText("No pudimos confirmar la venta desde POS.")).toBeVisible();

  await page.getByRole("button", { name: "Verificar venta" }).click();
  const lookup = await waitForCall(page, "lookupPosAttemptApi", 0);
  expect(lookup.args).toEqual(["t1", k1]);
  await respond(page, lookup.index, { found: true, orderId: "ord-1", displayCode: "P01" });
  await expect(notice(page)).toContainText("La venta #P01 quedó registrada");
  await expect(notice(page)).toContainText("Limpiamos el formulario");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await addProduct(page, "Papas Rústicas");
  await confirmSale(page);
  const next = await waitForCall(page, "createPosSaleApi", 2);
  expect(keyOf(next)).not.toBe(k1);
  return { original, next, k1, k2: keyOf(next) };
}

test.describe("O-05 POS: respuestas tardías", () => {
  for (const replayed of [false, true]) {
    test(`respuesta ${replayed ? "200 (replayed)" : "201"} antigua: no abre comprobante ni pisa la venta en curso`, async ({ page }) => {
      const { errors } = await openHarness(page, "pos");
      const { original, next, k2 } = await newSaleWhileOriginalInFlight(page);

      await respond(page, original.index, { orderId: "ord-1", displayCode: "P01", replayed });
      await settle(page);

      await expect(receipt(page)).toHaveCount(0);
      await expect(page.getByText(/P01 (creada|ya estaba registrada)/)).toHaveCount(0);
      expect((await calls(page)).filter((c) => c.fn === "getOrderApi")).toHaveLength(0);
      expect(await storedAttempt(page, SCOPE)).toMatchObject({ key: k2, status: "pending", uncertain: false });
      await expect(notice(page)).toHaveCount(0);

      // La venta vigente sigue su curso normal y su comprobante es el que se ve.
      await respond(page, next.index, { orderId: "ord-2", displayCode: "P02", replayed: false });
      await failHttp(page, (await waitForCall(page, "getOrderApi", 0)).index, 500);
      await expect(receipt(page)).toContainText("P02");
      expect(await storedAttempt(page, SCOPE)).toBeNull();

      // Venta nueva armada con el comprobante P02 abierto: nada viejo la toca.
      await receipt(page).getByRole("button", { name: "Nueva venta" }).click();
      await addProduct(page, "Burger Clásica");
      await addProduct(page, "Papas Rústicas");
      await settle(page);
      expect(await confirmLabel(page)).toContain("$9.000");
      expect(errors).toEqual([]);
    });
  }

  test("error HTTP antiguo durante otra venta: sin mensajes ni estado engañosos", async ({ page }) => {
    await openHarness(page, "pos");
    const { original, k2 } = await newSaleWhileOriginalInFlight(page);
    await failHttp(page, original.index, 500, "INTERNAL");
    await settle(page);
    await expect(page.getByText(/No pudimos (confirmar|registrar) la venta/)).toHaveCount(0);
    await expect(notice(page)).toHaveCount(0);
    expect(await storedAttempt(page, SCOPE)).toMatchObject({ key: k2, status: "pending", uncertain: false });
  });

  test("respuesta que llega con el POS desmontado: no se pierde en silencio, queda para verificar", async ({ page }) => {
    await openHarness(page, "pos");
    await addProduct(page, "Burger Clásica");
    await confirmSale(page);
    const original = await waitForCall(page, "createPosSaleApi", 0);
    const k1 = keyOf(original);

    await page.getByRole("button", { name: "Salir del POS" }).click();
    await page.getByRole("button", { name: "Volver al POS" }).click();
    await respond(page, original.index, { orderId: "ord-1", displayCode: "P01", replayed: false });

    await expect(notice(page)).toContainText("Venta sin confirmar");
    expect(await storedAttempt(page, SCOPE)).toMatchObject({ key: k1, uncertain: true });
    await expect(receipt(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Verificar venta" }).click();
    await respond(page, (await waitForCall(page, "lookupPosAttemptApi", 0)).index, { found: true, orderId: "ord-1", displayCode: "P01" });
    await expect(notice(page)).toContainText("La venta #P01 quedó registrada");
    expect(await storedAttempt(page, SCOPE)).toBeNull();
  });

  test("carrito modificado mientras la venta está pendiente: comprobante de la venta, carrito nuevo intacto", async ({ page }) => {
    await openHarness(page, "pos");
    await addProduct(page, "Burger Clásica");
    await confirmSale(page);
    const original = await waitForCall(page, "createPosSaleApi", 0);
    await addProduct(page, "Papas Rústicas");

    await respond(page, original.index, { orderId: "ord-1", displayCode: "P01", replayed: false });
    await failHttp(page, (await waitForCall(page, "getOrderApi", 0)).index, 500);
    await expect(receipt(page)).toContainText("P01");
    await expect(page.getByText("El carrito cambió mientras se confirmaba")).toBeVisible();
    await receipt(page).getByRole("button", { name: "Cerrar comprobante" }).click();
    expect(await confirmLabel(page)).toContain("$9.000");

    await confirmSale(page);
    const next = await waitForCall(page, "createPosSaleApi", 1);
    expect(keyOf(next)).not.toBe(keyOf(original));
  });

  test("carrito modificado mientras se lee el comprobante (después del 201): tampoco se borra", async ({ page }) => {
    await openHarness(page, "pos");
    await addProduct(page, "Burger Clásica");
    await confirmSale(page);
    const original = await waitForCall(page, "createPosSaleApi", 0);
    await respond(page, original.index, { orderId: "ord-1", displayCode: "P01", replayed: false });
    const read = await waitForCall(page, "getOrderApi", 0);

    await addProduct(page, "Papas Rústicas");
    await failHttp(page, read.index, 500);

    await expect(receipt(page)).toContainText("P01");
    await receipt(page).getByRole("button", { name: "Cerrar comprobante" }).click();
    expect(await confirmLabel(page)).toContain("$9.000");
  });

  test("recuperación con carritos ambiguos: no limpia sola, bloquea el registro y pide decidir", async ({ page }) => {
    await openHarness(page, "pos");
    await addProduct(page, "Burger Clásica");
    await confirmSale(page);
    const first = await waitForCall(page, "createPosSaleApi", 0);
    await failNetwork(page, first.index);
    await addProduct(page, "Burger Clásica"); // ×2: otro carrito con la misma clave
    await confirmSale(page);
    const second = await waitForCall(page, "createPosSaleApi", 1);
    expect(keyOf(second)).toBe(keyOf(first));
    await failNetwork(page, second.index);

    await page.getByRole("button", { name: "Verificar venta" }).click();
    await respond(page, (await waitForCall(page, "lookupPosAttemptApi", 0)).index, { found: true, orderId: "ord-1", displayCode: "P01" });
    await expect(notice(page)).toContainText("Encontramos la venta #P01, pero no sabemos con qué carrito");
    expect(await confirmLabel(page)).toContain("$13.000");

    await confirmSale(page);
    await expect(page.getByText("Hay una venta anterior pendiente de revisar.")).toBeVisible();
    expect((await calls(page)).filter((c) => c.fn === "createPosSaleApi")).toHaveLength(2);

    await page.getByRole("button", { name: "Es esa venta: limpiar formulario" }).click();
    await expect(notice(page)).toHaveCount(0);
    expect(await storedAttempt(page, SCOPE)).toBeNull();
    expect(await confirmLabel(page)).not.toContain("$");
  });
});
