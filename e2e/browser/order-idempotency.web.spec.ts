import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  createFixtureProduct,
  createOpenFixtureTenant,
  FIXTURE_PRODUCT,
  listFixtureDocs,
} from "../support/emulator-fixtures";
import { openHarness, settle, storedAttempt } from "./harness/page";
import { FUNCTIONS_BASE, Transport, type HeldRequest } from "./harness/transport";

/**
 * ORDER-IDEMPOTENCY — PRUEBAS DE NAVEGADOR INTEGRADAS (tienda web).
 *
 * Real: componentes de producción (`CartDrawer` → `CartSummary`,
 * `PendingOrderNotice`), React, el store del carrito, `sessionStorage`, el
 * cliente HTTP de la app, el CSS de Tailwind y el backend completo en los
 * emuladores (Functions + Firestore + Auth) con un tenant aislado por prueba.
 *
 * Controlado en la capa de transporte (Playwright, ver `harness/transport.ts`):
 * cuándo llega cada petición al backend y cuándo, o si, vuelve su respuesta.
 * Ninguna respuesta se inventa: todas las produce el backend real.
 *
 * Shims de framework: `next/image`, `next/link` y `next/navigation` (no hay
 * servidor Next). La página de catálogo no se renderiza: los botones
 * "Agregar" ponen en el carrito productos que existen en el tenant.
 *
 * Requiere emuladores: `npm run test:e2e:browser:emulators` (ver docs).
 */

const PAPAS = { id: "e2e-papas", name: "E2E Papas", price: 2500 };

type Ctx = { tenantId: string; scope: string; transport: Transport };

async function setup(page: Page, request: APIRequestContext): Promise<Ctx> {
  const { tenantId } = await createOpenFixtureTenant(request, "browser-web");
  await createFixtureProduct(request, tenantId, PAPAS);
  const transport = new Transport(page, ["createOrder", "lookupOrderAttempt"]);
  await transport.install();
  const { errors } = await openHarness(page, "web", {
    tenantId,
    products: [
      { id: FIXTURE_PRODUCT.id, name: FIXTURE_PRODUCT.name, price: FIXTURE_PRODUCT.price },
      PAPAS,
    ],
  });
  test.info().attach("page-errors", { body: JSON.stringify(errors) });
  return { tenantId, scope: `web:${tenantId}`, transport };
}

const orders = async (request: APIRequestContext, tenantId: string) =>
  (await listFixtureDocs(request, `tenants/${tenantId}/orders`)).length;

const cartItems = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __cart: { getState: () => { items: { product: { id: string }; quantity: number }[] } } })
      .__cart.getState().items.map((i) => `${i.product.id}×${i.quantity}`)
  );

const isCartOpen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cart: { getState: () => { isOpen: boolean } } }).__cart.getState().isOpen);

const drawerNotice = (page: Page) => page.locator('[data-placement="checkout"]');
const pageNotice = (page: Page) => page.locator('[data-placement="page"]');
const toasts = (page: Page) => page.locator("[data-sonner-toast]");
const keyOf = (held: HeldRequest) => held.json<{ idempotencyKey: string }>().idempotencyKey;
const codeOf = async (held: HeldRequest) => ((await (await held.forward()).json()).data?.displayCode as string) ?? "";

async function addProduct(page: Page, name: string) {
  if (await isCartOpen(page)) await page.getByRole("button", { name: "Cerrar carrito" }).click();
  await page.getByRole("button", { name: `Agregar ${name}` }).click();
}

/** Desde donde esté el cajón: abrirlo, pasar al checkout, completar retiro y confirmar. */
async function checkout(page: Page) {
  if (!(await isCartOpen(page))) await page.getByRole("button", { name: "Abrir carrito" }).click();
  const next = page.getByRole("button", { name: /Continuar/ });
  const name = page.getByPlaceholder("Tu nombre completo");
  await expect(next.or(name)).toBeVisible();
  if (await next.isVisible()) await next.click();
  await name.fill("Ana Prueba");
  await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("+56912345678");
  await page.getByRole("button", { name: "Retiro", exact: true }).click();
  await page.getByRole("button", { name: "Efectivo" }).click();
  await page.getByRole("button", { name: /Confirmar pedido/ }).click();
}

/** "Volver al carrito" desmonta el checkout (y su `isSubmitting`) como en la app real. */
async function backToCart(page: Page) {
  await page.getByRole("button", { name: "Volver al carrito" }).click();
}

test.describe("ORDER-IDEMPOTENCY web (navegador + emuladores)", () => {
  test("201 antigua tras iniciar una compra nueva: no toca carrito, formulario ni intento", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const original = await transport.next("createOrder", 0);
    const k1 = keyOf(original);
    const oldCode = await codeOf(original); // el backend lo crea; la respuesta queda retenida

    await backToCart(page);
    await checkout(page);
    const resend = await transport.next("createOrder", 1);
    expect(keyOf(resend)).toBe(k1);
    await resend.dropBeforeServer();
    await expect(drawerNotice(page)).toContainText("No pudimos confirmar tu último pedido");

    await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(drawerNotice(page)).toContainText(`Tu pedido #${oldCode} quedó registrado`);
    await expect.poll(() => cartItems(page)).toEqual([]);

    await addProduct(page, PAPAS.name);
    await checkout(page);
    const next = await transport.next("createOrder", 2);
    const k2 = keyOf(next);
    expect(k2).not.toBe(k1);

    await original.deliver();
    await settle(page);
    await expect.poll(() => cartItems(page)).toEqual([`${PAPAS.id}×1`]);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k2, status: "pending", uncertain: false });
    await expect(toasts(page).filter({ hasText: `#${oldCode}` })).toHaveCount(0);
    await expect(page.getByPlaceholder("Tu nombre completo")).toHaveValue("Ana Prueba");

    const newCode = await codeOf(next);
    await next.deliver();
    await expect(toasts(page).filter({ hasText: `Pedido recibido #${newCode}` })).toHaveCount(1);
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(await orders(request, tenantId)).toBe(2);
  });

  test("200 (replayed) antigua tras iniciar una compra nueva: tampoco tiene efectos", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const original = await transport.next("createOrder", 0);
    const k1 = keyOf(original);
    await original.loseResponse(); // creado en el backend; el navegador ve un error de red
    await expect(drawerNotice(page)).toContainText("No pudimos confirmar tu último pedido");

    // Reenvío del mismo intento: el backend responde 200 replayed (retenida).
    await page.getByRole("button", { name: /Confirmar pedido/ }).click();
    const replay = await transport.next("createOrder", 1);
    expect(keyOf(replay)).toBe(k1);
    expect((await replay.forward()).status()).toBe(200);

    await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect.poll(() => cartItems(page)).toEqual([]);

    await addProduct(page, PAPAS.name);
    await checkout(page);
    const next = await transport.next("createOrder", 2);
    const k2 = keyOf(next);

    await replay.deliver();
    await settle(page);
    await expect.poll(() => cartItems(page)).toEqual([`${PAPAS.id}×1`]);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k2, status: "pending" });
    await expect(toasts(page).filter({ hasText: "ya estaba registrado" })).toHaveCount(0);

    await next.deliver();
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(await orders(request, tenantId)).toBe(2);
  });

  for (const variant of ["400 de validación", "pérdida de red tardía"] as const) {
    test(`error antiguo (${variant}) durante otro intento: sin mensajes engañosos ni cambios de estado`, async ({ page, request }) => {
      const { tenantId, scope, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await checkout(page);
      const original = await transport.next("createOrder", 0);
      if (variant === "400 de validación") {
        // El backend real rechaza este cuerpo (sin ítems) con 400; la respuesta queda retenida.
        expect((await original.forward({ ...original.json<Record<string, unknown>>(), items: [] })).status()).toBe(400);
      } else {
        await original.forward();
      }

      await backToCart(page);
      await checkout(page);
      await (await transport.next("createOrder", 1)).deliver();
      await expect.poll(() => cartItems(page)).toEqual([]);

      await addProduct(page, PAPAS.name);
      await checkout(page);
      const next = await transport.next("createOrder", 2);
      const k2 = keyOf(next);

      if (variant === "400 de validación") await original.deliver();
      else await original.loseResponse();
      await settle(page);

      await expect(toasts(page).filter({ hasText: /No pudimos|ya quedó registrado|cerrada/ })).toHaveCount(0);
      await expect(drawerNotice(page)).toHaveCount(0);
      expect(await storedAttempt(page, scope)).toMatchObject({ key: k2, status: "pending", uncertain: false });
      await expect.poll(() => cartItems(page)).toEqual([`${PAPAS.id}×1`]);

      await next.deliver();
      await expect.poll(() => cartItems(page)).toEqual([]);
      expect(await orders(request, tenantId)).toBe(2);
    });
  }

  test("CR-02: un 400 de un envío no borra la clave mientras otro con la misma clave termina en 201", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const a = await transport.next("createOrder", 0);
    const k1 = keyOf(a);

    await backToCart(page);
    await checkout(page);
    const b = await transport.next("createOrder", 1);
    expect(keyOf(b)).toBe(k1);

    expect((await a.forward({ ...a.json<Record<string, unknown>>(), items: [] })).status()).toBe(400);
    await a.deliver();
    await settle(page);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, status: "pending" });
    await expect(toasts(page).filter({ hasText: "No pudimos crear tu pedido" })).toHaveCount(0);

    const code = await codeOf(b);
    await b.deliver();
    await expect(toasts(page).filter({ hasText: `Pedido recibido #${code}` })).toHaveCount(1);
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(await storedAttempt(page, scope)).toBeNull();
    expect(await orders(request, tenantId)).toBe(1);
  });

  test("carrito modificado mientras la petición original sigue pendiente: no se borra", async ({ page, request }) => {
    const { tenantId, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const original = await transport.next("createOrder", 0);
    const k1 = keyOf(original);

    await backToCart(page);
    await page.getByRole("button", { name: "Aumentar cantidad" }).click();
    await original.deliver();
    await expect(toasts(page).filter({ hasText: "Tu carrito cambió mientras confirmábamos" })).toHaveCount(1);
    await expect.poll(() => cartItems(page)).toEqual([`${FIXTURE_PRODUCT.id}×2`]);

    await checkout(page);
    const next = await transport.next("createOrder", 1);
    expect(keyOf(next)).not.toBe(k1);
    await next.deliver();
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(await orders(request, tenantId)).toBe(2);
  });

  test("respuesta perdida tras crear + recarga real: verificar recupera y vacía el carrito sin duplicar", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const original = await transport.next("createOrder", 0);
    const k1 = keyOf(original);
    await original.loseResponse();
    await expect(toasts(page).filter({ hasText: "No pudimos confirmar tu pedido" })).toHaveCount(1);

    await page.reload();
    await expect(pageNotice(page)).toContainText("No pudimos confirmar tu último pedido");
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, uncertain: true });
    await expect.poll(() => cartItems(page)).toEqual([`${FIXTURE_PRODUCT.id}×1`]);

    await pageNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(pageNotice(page)).toContainText("Vaciamos el carrito de ese pedido");
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(transport.count("createOrder")).toBe(1);
    expect(await orders(request, tenantId)).toBe(1);
  });

  test("O-04: 'found: false' no es definitivo; la creación tardía se recupera al verificar de nuevo", async ({ page, request }) => {
    const { tenantId, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const original = await transport.next("createOrder", 0);
    const body = original.json();
    await original.dropBeforeServer();

    await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(drawerNotice(page)).toContainText("Todavía no lo encontramos");

    // La misma petición llega tarde al backend (p. ej. un proxy que reintenta).
    const late = await request.post(new URL("createOrder", FUNCTIONS_BASE).toString(), { data: body });
    expect(late.status()).toBe(201);

    await drawerNotice(page).getByRole("button", { name: "Verificar de nuevo" }).click();
    await (await transport.next("lookupOrderAttempt", 1)).deliver();
    await expect(drawerNotice(page)).toContainText("quedó registrado");
    await expect.poll(() => cartItems(page)).toEqual([]);
    expect(await orders(request, tenantId)).toBe(1);
  });

  test.describe("carritos históricos ambiguos", () => {
    async function reachAmbiguous(page: Page, transport: Transport) {
      await addProduct(page, FIXTURE_PRODUCT.name);
      await checkout(page);
      const first = await transport.next("createOrder", 0);
      const k1 = keyOf(first);
      await first.dropBeforeServer();

      await backToCart(page);
      await page.getByRole("button", { name: "Aumentar cantidad" }).click();
      await checkout(page);
      const second = await transport.next("createOrder", 1);
      expect(keyOf(second)).toBe(k1);
      await second.loseResponse(); // este sí se creó; el cliente no sabe cuál

      await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
      await (await transport.next("lookupOrderAttempt", 0)).deliver();
      await expect(drawerNotice(page)).toContainText("pero no sabemos con qué carrito");
      return k1;
    }

    test("no vacía, bloquea el envío, sobrevive a la recarga; 'Conservar carrito' exige compra nueva", async ({ page, request }) => {
      const { tenantId, transport } = await setup(page, request);
      const k1 = await reachAmbiguous(page, transport);
      await expect.poll(() => cartItems(page)).toEqual([`${FIXTURE_PRODUCT.id}×2`]);

      await page.getByRole("button", { name: /Confirmar pedido/ }).click();
      await expect(toasts(page).filter({ hasText: "Tienes un pedido anterior pendiente de revisar" })).toHaveCount(1);
      await settle(page);
      expect(transport.count("createOrder")).toBe(2);

      await page.reload();
      await expect(pageNotice(page)).toContainText("pero no sabemos con qué carrito");
      await page.getByRole("button", { name: "Abrir carrito" }).click();
      await expect(pageNotice(page)).toHaveCount(0);
      await drawerNotice(page).getByRole("button", { name: "Conservar carrito" }).click();
      await expect(drawerNotice(page)).toHaveCount(0);

      await checkout(page);
      const next = await transport.next("createOrder", 2);
      expect(keyOf(next)).not.toBe(k1);
      await next.deliver();
      await expect.poll(() => cartItems(page)).toEqual([]);
      expect(await orders(request, tenantId)).toBe(2);
    });

    test("'Es ese pedido: vaciar carrito' resuelve sin enviar nada", async ({ page, request }) => {
      const { tenantId, scope, transport } = await setup(page, request);
      await reachAmbiguous(page, transport);
      await drawerNotice(page).getByRole("button", { name: "Es ese pedido: vaciar carrito" }).click();
      await expect.poll(() => cartItems(page)).toEqual([]);
      expect(await storedAttempt(page, scope)).toBeNull();
      expect(transport.count("createOrder")).toBe(2);
      expect(await orders(request, tenantId)).toBe(1);
    });
  });

  test("CR-04: seis carritos con la misma clave; el primero (olvidado) restaurado sigue siendo ambiguo", async ({ page, request }) => {
    const { tenantId, scope, transport } = await setup(page, request);
    await addProduct(page, FIXTURE_PRODUCT.name);
    await checkout(page);
    const first = await transport.next("createOrder", 0);
    const k1 = keyOf(first);
    await first.loseResponse(); // ×1 queda registrado

    for (let n = 1; n <= 5; n += 1) {
      await backToCart(page);
      await page.getByRole("button", { name: "Aumentar cantidad" }).click();
      await checkout(page);
      const resend = await transport.next("createOrder", n);
      expect(keyOf(resend)).toBe(k1);
      await resend.dropBeforeServer();
    }
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, truncated: true });

    await backToCart(page);
    for (let n = 0; n < 5; n += 1) await page.getByRole("button", { name: "Disminuir cantidad" }).click();
    await expect.poll(() => cartItems(page)).toEqual([`${FIXTURE_PRODUCT.id}×1`]);

    await page.reload();
    await page.getByRole("button", { name: "Abrir carrito" }).click();
    await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
    await (await transport.next("lookupOrderAttempt", 0)).deliver();
    await expect(drawerNotice(page)).toContainText("pero no sabemos con qué carrito");
    await expect.poll(() => cartItems(page)).toEqual([`${FIXTURE_PRODUCT.id}×1`]);
    expect(await storedAttempt(page, scope)).toMatchObject({ key: k1, status: "ambiguous", truncated: true });
    expect(await orders(request, tenantId)).toBe(1);
  });

  test.describe("CR-05: recuperación desde el checkout abierto (móvil)", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("verificar desde el cajón abierto, sin cerrarlo", async ({ page, request }) => {
      const { tenantId, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await checkout(page);
      await (await transport.next("createOrder", 0)).loseResponse();

      await expect(drawerNotice(page)).toBeVisible();
      await expect(pageNotice(page)).toHaveCount(0);
      await drawerNotice(page).getByRole("button", { name: "Verificar pedido" }).click();
      await (await transport.next("lookupOrderAttempt", 0)).deliver();
      await expect(drawerNotice(page)).toContainText("Vaciamos el carrito de ese pedido");
      await expect.poll(() => cartItems(page)).toEqual([]);
      expect(await orders(request, tenantId)).toBe(1);
    });

    test("conflicto 409 real: ver el pedido y descartar desde el checkout, conservando los datos escritos", async ({ page, request }) => {
      const { tenantId, transport } = await setup(page, request);
      await addProduct(page, FIXTURE_PRODUCT.name);
      await checkout(page);
      const first = await transport.next("createOrder", 0);
      const firstCode = await codeOf(first);
      await first.loseResponse();

      await backToCart(page);
      await page.getByRole("button", { name: "Aumentar cantidad" }).click();
      await checkout(page);
      const second = await transport.next("createOrder", 1);
      expect((await second.forward()).status()).toBe(409);
      await second.deliver();

      await expect(drawerNotice(page)).toContainText("Tu intento anterior ya quedó registrado como pedido");
      await drawerNotice(page).getByRole("button", { name: "Ver pedido registrado" }).click();
      await (await transport.next("lookupOrderAttempt", 0)).deliver();
      await expect(drawerNotice(page)).toContainText(`Es el pedido #${firstCode}`);
      await expect(page.getByPlaceholder("Tu nombre completo")).toHaveValue("Ana Prueba");

      await drawerNotice(page).getByRole("button", { name: "Descartar intento anterior" }).click();
      await expect(drawerNotice(page)).toHaveCount(0);
      await page.getByRole("button", { name: /Confirmar pedido/ }).click();
      const third = await transport.next("createOrder", 2);
      expect(keyOf(third)).not.toBe(keyOf(first));
      await third.deliver();
      await expect.poll(() => cartItems(page)).toEqual([]);
      expect(await orders(request, tenantId)).toBe(2);
    });
  });
});
