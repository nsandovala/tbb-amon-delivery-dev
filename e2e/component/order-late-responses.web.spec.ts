import { test, expect, type Page } from "@playwright/test";
import { openHarness, waitForCall, respond, failNetwork, failHttp, settle, storedAttempt, calls } from "./harness/page";

/**
 * ORDER-IDEMPOTENCY O-05 — PRUEBAS DE COMPONENTE en Chromium real.
 *
 * Se renderizan los componentes REALES de la tienda (`CartDrawer` →
 * `CartSummary` y `PendingOrderNotice`) con el store real del carrito (zustand
 * persistido en localStorage), `sessionStorage` real y toasts reales (sonner).
 * Solo la API HTTP es falsa: cada llamada queda pendiente y la prueba decide
 * cuándo responde, así se reproduce el orden exacto de respuestas tardías.
 *
 * Lo que NO ejercitan: el servidor, la red real, Next.js (routing/SSR) ni los
 * estilos (no se carga Tailwind). La "recarga" es un `page.reload()` real del
 * harness, no de la app desplegada.
 */

const SCOPE = "web:t1";

async function cartItems(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __cart: { getState: () => { items: { product: { id: string }; quantity: number }[] } } })
      .__cart.getState().items.map((i) => `${i.product.id}×${i.quantity}`)
  );
}

/** Abre el carrito, pasa al checkout, completa datos de retiro y confirma. */
async function checkout(page: Page) {
  await page.getByRole("button", { name: "Abrir carrito" }).click();
  // Con el cajón ya abierto en el paso de checkout no hay "Continuar".
  const next = page.getByRole("button", { name: /Continuar/ });
  if (await next.isVisible()) await next.click();
  await page.getByPlaceholder("Tu nombre completo").fill("Ana Prueba");
  await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("912345678");
  await page.getByRole("button", { name: "Retiro", exact: true }).click();
  await page.getByRole("button", { name: "Efectivo" }).click();
  await page.getByRole("button", { name: /Confirmar pedido/ }).click();
}

const toasts = (page: Page) => page.locator("[data-sonner-toast]");
const notice = (page: Page) => page.getByRole("status").filter({ hasText: /pedido/i });

/**
 * Lleva la UI a: envío original K1 aún en vuelo + recuperación por
 * verificación (pedido encontrado, carrito vaciado) + compra nueva K2 en vuelo.
 * Es un camino real de la UI: "Volver al carrito" desmonta el checkout (y su
 * `isSubmitting`), y al volver el reenvío usa la misma clave K1.
 */
async function startNewPurchaseWhileOriginalInFlight(page: Page) {
  await page.getByRole("button", { name: "Agregar Burger" }).click();
  await checkout(page);
  const original = await waitForCall(page, "createOrderApi", 0);
  const k1 = (original.args[0] as { idempotencyKey: string }).idempotencyKey;

  await page.getByRole("button", { name: "Volver al carrito" }).click();
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.getByPlaceholder("Tu nombre completo").fill("Ana Prueba");
  await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("912345678");
  await page.getByRole("button", { name: "Retiro", exact: true }).click();
  await page.getByRole("button", { name: "Efectivo" }).click();
  await page.getByRole("button", { name: /Confirmar pedido/ }).click();
  const resend = await waitForCall(page, "createOrderApi", 1);
  expect((resend.args[0] as { idempotencyKey: string }).idempotencyKey).toBe(k1);
  await failNetwork(page, resend.index);
  await expect(notice(page)).toContainText("No pudimos confirmar tu último pedido");

  await page.getByRole("button", { name: "Verificar pedido" }).click();
  const lookup = await waitForCall(page, "lookupOrderAttemptApi", 0);
  expect(lookup.args).toEqual(["t1", k1]);
  await respond(page, lookup.index, { found: true, orderId: "ord-1", displayCode: "A01" });
  await expect(notice(page)).toContainText("Tu pedido #A01 quedó registrado");
  expect(await cartItems(page)).toEqual([]);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();

  await page.getByRole("button", { name: "Agregar Papas" }).click();
  await checkout(page);
  const next = await waitForCall(page, "createOrderApi", 2);
  const k2 = (next.args[0] as { idempotencyKey: string }).idempotencyKey;
  expect(k2).not.toBe(k1);
  return { original, next, k1, k2 };
}

test.describe("O-05 web: respuestas tardías", () => {
  for (const replayed of [false, true]) {
    test(`respuesta ${replayed ? "200 (replayed)" : "201"} antigua tras iniciar una compra nueva: no toca carrito, formulario ni intento`, async ({ page }) => {
      const { errors } = await openHarness(page, "web");
      const { original, next, k2 } = await startNewPurchaseWhileOriginalInFlight(page);

      await respond(page, original.index, { orderId: "ord-1", displayCode: "A01", replayed });
      await settle(page);

      expect(await cartItems(page)).toEqual(["papas×1"]);
      expect(await storedAttempt(page, SCOPE)).toMatchObject({ key: k2, status: "pending", uncertain: false });
      await expect(toasts(page).filter({ hasText: "#A01" })).toHaveCount(0);
      await expect(toasts(page).filter({ hasText: /Pedido recibido|ya estaba registrado/ })).toHaveCount(0);
      // El formulario de la compra en curso sigue intacto.
      await expect(page.getByPlaceholder("Tu nombre completo")).toHaveValue("Ana Prueba");

      // La respuesta vigente sí aplica sus efectos normales.
      await respond(page, next.index, { orderId: "ord-2", displayCode: "B02", replayed: false });
      await expect(toasts(page).filter({ hasText: "Pedido recibido #B02" })).toHaveCount(1);
      expect(await cartItems(page)).toEqual([]);
      expect(await storedAttempt(page, SCOPE)).toBeNull();
      expect(errors).toEqual([]);
    });
  }

  for (const [label, fail] of [
    ["error HTTP 500", (page: Page, i: number) => failHttp(page, i, 500, "INTERNAL")],
    ["409 IDEMPOTENCY_KEY_REUSED", (page: Page, i: number) => failHttp(page, i, 409, "IDEMPOTENCY_KEY_REUSED")],
    ["error de red", (page: Page, i: number) => failNetwork(page, i)],
  ] as const) {
    test(`${label} antiguo durante otro intento: sin mensajes engañosos ni cambios de estado`, async ({ page }) => {
      await openHarness(page, "web");
      const { original, k2 } = await startNewPurchaseWhileOriginalInFlight(page);

      await fail(page, original.index);
      await settle(page);

      await expect(toasts(page).filter({ hasText: /No pudimos|anterior ya quedó registrado|tienda está cerrada/ })).toHaveCount(0);
      await expect(notice(page)).toHaveCount(0);
      expect(await storedAttempt(page, SCOPE)).toMatchObject({ key: k2, status: "pending", uncertain: false });
      expect(await cartItems(page)).toEqual(["papas×1"]);
    });
  }

  test("carrito modificado mientras la petición original sigue pendiente: no se borra el carrito nuevo", async ({ page }) => {
    await openHarness(page, "web");
    await page.getByRole("button", { name: "Agregar Burger" }).click();
    await checkout(page);
    const original = await waitForCall(page, "createOrderApi", 0);
    const k1 = (original.args[0] as { idempotencyKey: string }).idempotencyKey;

    await page.getByRole("button", { name: "Volver al carrito" }).click();
    await page.getByRole("button", { name: "Aumentar cantidad" }).click();
    expect(await cartItems(page)).toEqual(["burger×2"]);

    await respond(page, original.index, { orderId: "ord-1", displayCode: "A01", replayed: false });
    await expect(toasts(page).filter({ hasText: "Tu carrito cambió mientras confirmábamos" })).toHaveCount(1);
    expect(await cartItems(page)).toEqual(["burger×2"]);
    expect(await storedAttempt(page, SCOPE)).toBeNull();

    // Confirmar el carrito modificado es una compra nueva, con otra clave.
    await page.getByRole("button", { name: /Continuar/ }).click();
    await page.getByPlaceholder("Tu nombre completo").fill("Ana Prueba");
    await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("912345678");
    await page.getByRole("button", { name: "Retiro", exact: true }).click();
    await page.getByRole("button", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: /Confirmar pedido/ }).click();
    const next = await waitForCall(page, "createOrderApi", 1);
    expect((next.args[0] as { idempotencyKey: string }).idempotencyKey).not.toBe(k1);
  });

  test("recuperación exitosa con carrito coincidente tras recarga real del harness: vacía el carrito sin reenviar", async ({ page }) => {
    await openHarness(page, "web");
    await page.getByRole("button", { name: "Agregar Burger" }).click();
    await checkout(page);
    const original = await waitForCall(page, "createOrderApi", 0);
    const k1 = (original.args[0] as { idempotencyKey: string }).idempotencyKey;
    await failNetwork(page, original.index);

    await page.reload();
    await expect(notice(page)).toContainText("No pudimos confirmar tu último pedido");
    expect(await cartItems(page)).toEqual(["burger×1"]);

    await page.getByRole("button", { name: "Verificar pedido" }).click();
    const lookup = await waitForCall(page, "lookupOrderAttemptApi", 0);
    expect(lookup.args).toEqual(["t1", k1]);
    await respond(page, lookup.index, { found: true, orderId: "ord-1", displayCode: "A01" });

    await expect(notice(page)).toContainText("Vaciamos el carrito de ese pedido");
    expect(await cartItems(page)).toEqual([]);
    expect(await storedAttempt(page, SCOPE)).toBeNull();
    expect((await calls(page)).filter((c) => c.fn === "createOrderApi")).toHaveLength(0);
  });

  test("O-04 se mantiene: 'found: false' no es definitivo y se puede verificar de nuevo", async ({ page }) => {
    await openHarness(page, "web");
    await page.getByRole("button", { name: "Agregar Burger" }).click();
    await checkout(page);
    const original = await waitForCall(page, "createOrderApi", 0);
    await failNetwork(page, original.index);

    await page.getByRole("button", { name: "Verificar pedido" }).click();
    await respond(page, (await waitForCall(page, "lookupOrderAttemptApi", 0)).index, { found: false });
    await expect(notice(page)).toContainText("Todavía no lo encontramos");
    expect(await cartItems(page)).toEqual(["burger×1"]);

    await page.getByRole("button", { name: "Verificar de nuevo" }).click();
    await respond(page, (await waitForCall(page, "lookupOrderAttemptApi", 1)).index, { found: true, orderId: "ord-1", displayCode: "A01" });
    await expect(notice(page)).toContainText("Tu pedido #A01 quedó registrado");
    expect(await cartItems(page)).toEqual([]);
  });

  test.describe("recuperación con carritos históricos ambiguos", () => {
    /** Dos envíos inciertos con la misma clave y carritos distintos; el actual es el segundo. */
    async function reachAmbiguous(page: Page) {
      await page.getByRole("button", { name: "Agregar Burger" }).click();
      await checkout(page);
      const first = await waitForCall(page, "createOrderApi", 0);
      const k1 = (first.args[0] as { idempotencyKey: string }).idempotencyKey;
      await failNetwork(page, first.index);

      await page.getByRole("button", { name: "Volver al carrito" }).click();
      await page.getByRole("button", { name: "Aumentar cantidad" }).click();
      await page.getByRole("button", { name: /Continuar/ }).click();
      await page.getByPlaceholder("Tu nombre completo").fill("Ana Prueba");
      await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("912345678");
      await page.getByRole("button", { name: "Retiro", exact: true }).click();
      await page.getByRole("button", { name: "Efectivo" }).click();
      await page.getByRole("button", { name: /Confirmar pedido/ }).click();
      const second = await waitForCall(page, "createOrderApi", 1);
      expect((second.args[0] as { idempotencyKey: string }).idempotencyKey).toBe(k1);
      await failNetwork(page, second.index);

      await page.getByRole("button", { name: "Verificar pedido" }).click();
      await respond(page, (await waitForCall(page, "lookupOrderAttemptApi", 0)).index, { found: true, orderId: "ord-1", displayCode: "A01" });
      await expect(notice(page)).toContainText("Encontramos tu pedido #A01, pero no sabemos con qué carrito");
      return k1;
    }

    test("no vacía automáticamente, bloquea el envío y sobrevive a la recarga; 'Conservar carrito' exige compra nueva", async ({ page }) => {
      await openHarness(page, "web");
      const k1 = await reachAmbiguous(page);
      expect(await cartItems(page)).toEqual(["burger×2"]);

      // Confirmar no envía nada mientras no haya decisión.
      await page.getByRole("button", { name: /Confirmar pedido/ }).click();
      await expect(toasts(page).filter({ hasText: "Tienes un pedido anterior pendiente de revisar" })).toHaveCount(1);
      await settle(page);
      expect((await calls(page)).filter((c) => c.fn === "createOrderApi")).toHaveLength(2);

      await page.reload();
      await expect(notice(page)).toContainText("pero no sabemos con qué carrito");
      expect(await cartItems(page)).toEqual(["burger×2"]);

      await page.getByRole("button", { name: "Conservar carrito" }).click();
      await expect(notice(page)).toHaveCount(0);
      expect(await cartItems(page)).toEqual(["burger×2"]);
      await checkout(page);
      const next = await waitForCall(page, "createOrderApi", 0); // índices reiniciados tras la recarga
      expect((next.args[0] as { idempotencyKey: string }).idempotencyKey).not.toBe(k1);
    });

    test("'Es ese pedido: vaciar carrito' resuelve sin enviar nada", async ({ page }) => {
      await openHarness(page, "web");
      await reachAmbiguous(page);
      await page.getByRole("button", { name: "Es ese pedido: vaciar carrito" }).click();
      expect(await cartItems(page)).toEqual([]);
      expect(await storedAttempt(page, SCOPE)).toBeNull();
      await expect(notice(page)).toHaveCount(0);
      expect((await calls(page)).filter((c) => c.fn === "createOrderApi")).toHaveLength(2);
    });
  });
});
