import { test, expect } from "@playwright/test";
import * as mod from "../../apps/web/src/lib/order-attempt";

/**
 * ORDER-IDEMPOTENCY (O-01/O-02) — estado del intento en el cliente.
 *
 * Pruebas UNITARIAS de `apps/web/src/lib/order-attempt.ts` (el POS usa una copia
 * idéntica) con un `sessionStorage` simulado. La "recarga" se simula olvidando
 * la memoria del módulo y conservando el storage. NO reemplaza una prueba real
 * de navegador: no ejercita React, la red ni el ciclo de vida de la página.
 */

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  get length() { return this.data.size; }
  dump() { return Object.fromEntries(this.data); }
}

const storage = new FakeStorage();
const fakeWindow = Object.assign(new EventTarget(), { sessionStorage: storage });
(globalThis as unknown as { window: unknown }).window = fakeWindow;

// El módulo lee `window` solo al usarse, así que basta con instalarlo antes de las pruebas.
const WEB = "web:tenant-a";
const summary = { units: 2, total: 13000 };
const httpError = (status: number, code?: string) => Object.assign(new Error("x"), { status, code });
const networkError = () => new TypeError("Failed to fetch");

test.beforeEach(() => {
  storage.clear();
  mod.__simulatePageReloadForTests();
});

const CART_A = mod.cartSignature([{ productId: "burger", qty: 2 }]);
const CART_B = mod.cartSignature([{ productId: "burger", qty: 3 }]);

test("guarda solo clave, hora, estado, resumen y huella del carrito: sin datos personales", () => {
  mod.beginOrderAttempt(WEB, summary, CART_A);
  const stored = JSON.parse(Object.values(storage.dump())[0]);
  expect(Object.keys(stored).sort()).toEqual(["key", "sentCarts", "startedAt", "status", "summary", "uncertain", "v"]);
  expect(Object.keys(stored.summary).sort()).toEqual(["total", "units"]);
  expect(stored.key).toMatch(/^[A-Za-z0-9-]{32,36}$/);
  expect(stored.sentCarts).toEqual([CART_A]);
  expect(JSON.stringify(stored)).not.toContain("burger");
});

test("cartSignature: estable, sin nombres de producto, ignora orden y cantidades cero", () => {
  const a = mod.cartSignature([{ productId: "burger", qty: 2 }, { productId: "papas", qty: 1 }]);
  const b = mod.cartSignature([{ productId: "papas", qty: 1 }, { productId: "burger", qty: 2 }, { productId: "bebida", qty: 0 }]);
  expect(a).toBe(b);
  expect(a).toMatch(/^c[0-9a-f]{8}$/);
  expect(mod.cartSignature([{ productId: "burger", qty: 3 }, { productId: "papas", qty: 1 }])).not.toBe(a);
  expect(mod.cartSignature([])).toBe("");
});

test("reenvíos del mismo intento reutilizan la clave y acumulan huellas (máx. 5)", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  for (let qty = 1; qty <= 7; qty += 1) {
    expect(mod.beginOrderAttempt(WEB, summary, mod.cartSignature([{ productId: "x", qty }]))).toBe(key);
  }
  expect(mod.peekOrderAttempt(WEB)!.sentCarts).toHaveLength(5);
});

test("error de red o 5xx: queda incierto y conserva la clave", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  expect(mod.recordOrderAttemptFailure(WEB, networkError(), key)).toBe("uncertain");
  expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "pending", uncertain: true });
  expect(mod.recordOrderAttemptFailure(WEB, httpError(500, "INTERNAL_ERROR"), key)).toBe("uncertain");
  expect(mod.beginOrderAttempt(WEB, summary, CART_A)).toBe(key);
});

test("recarga durante el envío: el intento vuelve como incierto con la misma clave y su carrito", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.__simulatePageReloadForTests();
  const recovered = mod.loadOrderAttempt(WEB);
  expect(recovered).toMatchObject({ key, status: "pending", uncertain: true, summary, sentCarts: [CART_A] });
  expect(mod.beginOrderAttempt(WEB, summary, CART_A)).toBe(key);
});

test("4xx definitivo sin incertidumbre previa: se limpia (nada se creó)", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  expect(mod.recordOrderAttemptFailure(WEB, httpError(409, "STORE_CLOSED"), key)).toBe("definitive");
  expect(mod.peekOrderAttempt(WEB)).toBeNull();
});

test("4xx definitivo tras un envío incierto: conserva la clave (el anterior pudo registrarse)", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.recordOrderAttemptFailure(WEB, networkError(), key);
  expect(mod.recordOrderAttemptFailure(WEB, httpError(400, "VALIDATION_ERROR"), key)).toBe("definitive");
  expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, uncertain: true });
});

test("409 IDEMPOTENCY_KEY_REUSED: conflicto, no se envía nada hasta decidir", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.recordOrderAttemptFailure(WEB, networkError(), key);
  mod.beginOrderAttempt(WEB, summary, CART_B);
  expect(mod.recordOrderAttemptFailure(WEB, httpError(409, "IDEMPOTENCY_KEY_REUSED"), key)).toBe("conflict");
  expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "conflict" });
  expect(() => mod.beginOrderAttempt(WEB, summary, CART_B)).toThrow("ORDER_ATTEMPT_CONFLICT");

  mod.__simulatePageReloadForTests();
  expect(mod.loadOrderAttempt(WEB)).toMatchObject({ key, status: "conflict" });

  const fresh = mod.startNewOrderAttempt(WEB, summary, CART_B);
  expect(fresh).not.toBe(key);
  expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key: fresh, status: "pending", uncertain: false, sentCarts: [CART_B] });
});

test("confirmación del envío: limpia memoria y storage, también tras recargar", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.recordOrderAttemptFailure(WEB, networkError(), key);
  expect(mod.finishOrderAttempt(WEB, key)).toBe(true);
  expect(mod.peekOrderAttempt(WEB)).toBeNull();
  expect(storage.length).toBe(0);
  mod.__simulatePageReloadForTests();
  expect(mod.loadOrderAttempt(WEB)).toBeNull();
});

test.describe("O-03: verificación con pedido encontrado", () => {
  test("mismo carrito: se resuelve el checkout (vaciar) y el intento se cierra", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, networkError(), key);
    expect(mod.resolveFoundOrderAttempt(WEB, key, CART_A)).toBe("resolve-checkout");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("tras recargar el POS y volver a cargar el mismo carrito, también se resuelve", () => {
    const POS = "pos:tenant-a";
    const key = mod.beginOrderAttempt(POS, summary, CART_A);
    mod.__simulatePageReloadForTests();
    mod.loadOrderAttempt(POS);
    expect(mod.resolveFoundOrderAttempt(POS, key, CART_A)).toBe("resolve-checkout");
  });

  test("carrito nuevo o distinto preparado durante la recuperación: se respeta", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, networkError(), key);
    expect(mod.resolveFoundOrderAttempt(WEB, key, CART_B)).toBe("keep-cart");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("carrito vacío: nada que resolver", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.resolveFoundOrderAttempt(WEB, key, "")).toBe("keep-cart");
  });

  test("tras resolver, el mismo carrito solo se envía como compra nueva (clave nueva) y explícita", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.resolveFoundOrderAttempt(WEB, key, CART_A);
    // La UI vació el carrito; volver a armarlo y confirmar es una compra nueva.
    const next = mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(next).not.toBe(key);
  });

  test("en conflicto: no toca el carrito ni cierra el intento", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, httpError(409, "IDEMPOTENCY_KEY_REUSED"), key);
    expect(mod.resolveFoundOrderAttempt(WEB, key, CART_A)).toBe("conflict");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "conflict" });
  });
});

test.describe("Callbacks asíncronos tardíos (intento viejo vs. intento nuevo)", () => {
  function supersede(): { oldKey: string; newKey: string } {
    const oldKey = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, httpError(409, "IDEMPOTENCY_KEY_REUSED"), oldKey);
    const newKey = mod.startNewOrderAttempt(WEB, summary, CART_B);
    return { oldKey, newKey };
  }

  test("verificación vieja que llega tarde: 'stale', no limpia ni vacía nada", () => {
    const { oldKey, newKey } = supersede();
    expect(mod.resolveFoundOrderAttempt(WEB, oldKey, CART_B)).toBe("stale");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key: newKey, sentCarts: [CART_B] });
  });

  test("éxito tardío del envío viejo: no cierra el intento nuevo", () => {
    const { oldKey, newKey } = supersede();
    expect(mod.finishOrderAttempt(WEB, oldKey)).toBe(false);
    expect(mod.peekOrderAttempt(WEB)?.key).toBe(newKey);
  });

  test("error tardío del envío viejo: no marca incierto ni en conflicto al nuevo", () => {
    const { oldKey, newKey } = supersede();
    expect(mod.recordOrderAttemptFailure(WEB, networkError(), oldKey)).toBe("stale");
    expect(mod.recordOrderAttemptFailure(WEB, httpError(409, "IDEMPOTENCY_KEY_REUSED"), oldKey)).toBe("stale");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key: newKey, status: "pending", uncertain: false });
  });
});

test("O-04: 'found: false' no cambia el estado; una verificación posterior encuentra el pedido tardío", () => {
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.recordOrderAttemptFailure(WEB, networkError(), key);
  // Verificación sin resultado: la UI no llama a ninguna transición de estado.
  expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, uncertain: true });
  expect(mod.beginOrderAttempt(WEB, summary, CART_A)).toBe(key);
  // El pedido se crea tarde; la segunda verificación lo encuentra.
  expect(mod.resolveFoundOrderAttempt(WEB, key, CART_A)).toBe("resolve-checkout");
});

test("tenant y canal separados: cada alcance tiene su propio intento", () => {
  const web = mod.beginOrderAttempt("web:tenant-a", summary, CART_A);
  const otherTenant = mod.beginOrderAttempt("web:tenant-b", summary, CART_A);
  const pos = mod.beginOrderAttempt("pos:tenant-a", summary, CART_A);
  expect(new Set([web, otherTenant, pos]).size).toBe(3);
  mod.recordOrderAttemptFailure("web:tenant-a", httpError(409, "IDEMPOTENCY_KEY_REUSED"), web);
  expect(mod.beginOrderAttempt("pos:tenant-a", summary, CART_A)).toBe(pos);
  expect(mod.beginOrderAttempt("web:tenant-b", summary, CART_A)).toBe(otherTenant);
  expect(mod.resolveFoundOrderAttempt("web:tenant-b", pos, CART_A)).toBe("stale");
});

test("notifica cambios a los avisos suscritos", () => {
  const seen: string[] = [];
  const unsubscribe = mod.subscribeOrderAttempt(WEB, () => seen.push("change"));
  const key = mod.beginOrderAttempt(WEB, summary, CART_A);
  mod.beginOrderAttempt("pos:tenant-a", summary, CART_A);
  mod.finishOrderAttempt(WEB, key);
  unsubscribe();
  mod.beginOrderAttempt(WEB, summary, CART_A);
  expect(seen).toEqual(["change", "change"]);
});

test("almacenamiento corrupto se ignora; un registro v1 previo se lee sin huellas", () => {
  storage.setItem("amon-order-attempt:" + WEB, "{no-json");
  expect(mod.loadOrderAttempt(WEB)).toBeNull();
  storage.setItem(
    "amon-order-attempt:" + WEB,
    JSON.stringify({ v: 1, key: "11111111-2222-4333-8444-555555555555", startedAt: 1, status: "pending", uncertain: true, summary })
  );
  expect(mod.loadOrderAttempt(WEB)).toMatchObject({ v: 2, sentCarts: [], uncertain: true });
});

test.describe("O-05: efectos de respuestas exitosas", () => {
  test("respuesta vigente con el mismo carrito: 'apply' y se cierra el intento", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_A)).toBe("apply");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("carrito modificado mientras se esperaba: 'cart-changed', se cierra pero no se vacía", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_B)).toBe("cart-changed");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
    // Confirmar el carrito modificado es una compra nueva, con otra clave.
    expect(mod.beginOrderAttempt(WEB, summary, CART_B)).not.toBe(key);
  });

  test("respuesta de un intento ya resuelto por verificación: 'stale', no toca el intento nuevo", () => {
    const oldKey = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, networkError(), oldKey);
    expect(mod.resolveFoundOrderAttempt(WEB, oldKey, CART_A)).toBe("resolve-checkout");
    const newKey = mod.beginOrderAttempt(WEB, summary, CART_B);
    expect(mod.settleOrderAttemptSuccess(WEB, oldKey, CART_A, CART_B)).toBe("stale");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key: newKey, status: "pending", sentCarts: [CART_B] });
  });

  test("respuesta tardía sin intento vigente: 'stale' y no crea estado", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.discardOrderAttempt(WEB);
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_A)).toBe("stale");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("vista desmontada: el intento vigente queda incierto; uno ajeno no se toca", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.markOrderAttemptUnconfirmed(WEB, key)).toBe(true);
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "pending", uncertain: true });
    expect(mod.markOrderAttemptUnconfirmed(WEB, "otra-clave-cualquiera")).toBe(false);
  });
});

test.describe("O-05: carritos históricos ambiguos", () => {
  function ambiguous(): string {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.recordOrderAttemptFailure(WEB, networkError(), key);
    mod.beginOrderAttempt(WEB, summary, CART_B);
    mod.recordOrderAttemptFailure(WEB, networkError(), key);
    return key;
  }

  test("varios carritos con la misma clave y el actual es uno: 'ambiguous', no se vacía ni se cierra", () => {
    const key = ambiguous();
    expect(mod.resolveFoundOrderAttempt(WEB, key, CART_B, "A12")).toBe("ambiguous");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "ambiguous", uncertain: false, foundCode: "A12" });
  });

  test("bloquea nuevos envíos hasta decidir y sobrevive a una recarga", () => {
    const key = ambiguous();
    mod.resolveFoundOrderAttempt(WEB, key, CART_A, "A12");
    expect(() => mod.beginOrderAttempt(WEB, summary, CART_A)).toThrow("ORDER_ATTEMPT_AMBIGUOUS");
    mod.__simulatePageReloadForTests();
    expect(mod.loadOrderAttempt(WEB)).toMatchObject({ key, status: "ambiguous", foundCode: "A12" });
    expect(() => mod.beginOrderAttempt(WEB, summary, CART_A)).toThrow("ORDER_ATTEMPT_AMBIGUOUS");
  });

  test("decidir 'conservar' descarta el intento: el siguiente envío usa clave nueva", () => {
    const key = ambiguous();
    mod.resolveFoundOrderAttempt(WEB, key, CART_B);
    mod.discardOrderAttempt(WEB);
    expect(mod.beginOrderAttempt(WEB, summary, CART_B)).not.toBe(key);
  });

  test("un carrito que no es ninguno de los enviados se respeta sin ambigüedad", () => {
    const key = ambiguous();
    const other = mod.cartSignature([{ productId: "papas", qty: 1 }]);
    expect(mod.resolveFoundOrderAttempt(WEB, key, other)).toBe("keep-cart");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });
});

test.describe("CR-02: varios envíos activos con la misma clave", () => {
  test("un 400 de un envío no borra el intento mientras otro sigue activo; el 201 del otro lo cierra", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A); // envío A
    expect(mod.beginOrderAttempt(WEB, summary, CART_A)).toBe(key); // envío B (checkout reabierto)
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400, "VALIDATION_ERROR"), key)).toBe("pending-other");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "pending", uncertain: false });
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_A)).toBe("apply");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("si el último envío activo también da 4xx, recién entonces se cierra (nada se creó)", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), key)).toBe("pending-other");
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), key)).toBe("definitive");
    expect(mod.peekOrderAttempt(WEB)).toBeNull();
  });

  test("error de red con otro envío activo: queda incierto sin avisar; un 4xx posterior no lo borra", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.beginOrderAttempt(WEB, summary, CART_A);
    expect(mod.recordOrderAttemptFailure(WEB, networkError(), key)).toBe("pending-other");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, uncertain: true });
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), key)).toBe("definitive");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, uncertain: true });
  });

  test("recarga con envíos activos: el contador se pierde, el intento vuelve incierto con su clave", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.__simulatePageReloadForTests();
    expect(mod.loadOrderAttempt(WEB)).toMatchObject({ key, status: "pending", uncertain: true });
    // Una respuesta 4xx que llegara ahora no lo borra: venía incierto.
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), key)).toBe("definitive");
    expect(mod.peekOrderAttempt(WEB)?.key).toBe(key);
  });

  test("respuestas tardías de un intento anterior no tocan los envíos del intento nuevo", () => {
    const oldKey = mod.beginOrderAttempt(WEB, summary, CART_A);
    mod.settleOrderAttemptSuccess(WEB, oldKey, CART_A, CART_A);
    const newKey = mod.beginOrderAttempt(WEB, summary, CART_B);
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), oldKey)).toBe("stale");
    expect(mod.settleOrderAttemptSuccess(WEB, oldKey, CART_A, CART_B)).toBe("stale");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key: newKey, status: "pending" });
    // El único envío del intento nuevo sigue contando: su 400 sí lo cierra.
    expect(mod.recordOrderAttemptFailure(WEB, httpError(400), newKey)).toBe("definitive");
  });
});

test.describe("CR-01: la página que se va no decide el intento", () => {
  test("respuestas que llegan tras 'pagehide' (peticiones abortadas al recargar) no cierran ni modifican el intento", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    fakeWindow.dispatchEvent(new Event("pagehide"));
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_A)).toBe("stale");
    expect(mod.recordOrderAttemptFailure(WEB, networkError(), key)).toBe("stale");
    expect(mod.markOrderAttemptUnconfirmed(WEB, key)).toBe(false);
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "pending", uncertain: false });
    // La página nueva lo encuentra y lo trata como incierto.
    mod.__simulatePageReloadForTests();
    expect(mod.loadOrderAttempt(WEB)).toMatchObject({ key, uncertain: true });
  });

  test("'pageshow' (vuelta desde la caché del navegador) reactiva el intento normal", () => {
    const key = mod.beginOrderAttempt(WEB, summary, CART_A);
    fakeWindow.dispatchEvent(new Event("pagehide"));
    fakeWindow.dispatchEvent(new Event("pageshow"));
    expect(mod.settleOrderAttemptSuccess(WEB, key, CART_A, CART_A)).toBe("apply");
  });
});

test.describe("CR-04: historial de carritos truncado", () => {
  const carts = [1, 2, 3, 4, 5, 6].map((qty) => mod.cartSignature([{ productId: "burger", qty }]));

  function sixCarts(): string {
    const key = mod.beginOrderAttempt(WEB, summary, carts[0]);
    mod.recordOrderAttemptFailure(WEB, networkError(), key);
    for (const cart of carts.slice(1)) {
      mod.beginOrderAttempt(WEB, summary, cart);
      mod.recordOrderAttemptFailure(WEB, networkError(), key);
    }
    return key;
  }

  test("con 5 carritos no hay truncamiento; el sexto lo marca y se persiste", () => {
    const key = mod.beginOrderAttempt(WEB, summary, carts[0]);
    for (const cart of carts.slice(1, 5)) mod.beginOrderAttempt(WEB, summary, cart);
    expect(mod.peekOrderAttempt(WEB)?.truncated).toBeUndefined();
    mod.beginOrderAttempt(WEB, summary, carts[5]);
    const stored = JSON.parse(Object.values(storage.dump())[0]);
    expect(stored).toMatchObject({ key, truncated: true });
    expect(stored.sentCarts).toEqual(carts.slice(1));
  });

  test("el primer carrito (olvidado) restaurado: ambiguo, sin vaciar ni perder la clave, también tras recargar", () => {
    const key = sixCarts();
    mod.__simulatePageReloadForTests();
    expect(mod.loadOrderAttempt(WEB)).toMatchObject({ key, truncated: true, uncertain: true });
    expect(mod.resolveFoundOrderAttempt(WEB, key, carts[0], "A01")).toBe("ambiguous");
    expect(mod.peekOrderAttempt(WEB)).toMatchObject({ key, status: "ambiguous", truncated: true });
    expect(() => mod.beginOrderAttempt(WEB, summary, carts[0])).toThrow("ORDER_ATTEMPT_AMBIGUOUS");
  });

  test("con historial truncado, cualquier carrito con productos es ambiguo; vacío no tiene nada que proteger", () => {
    const key = sixCarts();
    const other = mod.cartSignature([{ productId: "papas", qty: 1 }]);
    expect(mod.resolveFoundOrderAttempt(WEB, key, other)).toBe("ambiguous");
    mod.discardOrderAttempt(WEB);
    const key2 = sixCarts();
    expect(mod.resolveFoundOrderAttempt(WEB, key2, "")).toBe("keep-cart");
  });

  test("un registro con más de 5 huellas (otra versión) se lee como truncado", () => {
    storage.setItem(
      "amon-order-attempt:" + WEB,
      JSON.stringify({ v: 2, key: "k".repeat(32), startedAt: 1, status: "pending", uncertain: true, summary, sentCarts: carts })
    );
    expect(mod.loadOrderAttempt(WEB)).toMatchObject({ truncated: true, sentCarts: carts.slice(1) });
  });
});

test("web y POS usan exactamente la misma lógica de intento", async () => {
  const { readFileSync } = await import("node:fs");
  const web = readFileSync("apps/web/src/lib/order-attempt.ts", "utf8");
  const admin = readFileSync("apps/admin/src/lib/order-attempt.ts", "utf8");
  expect(admin).toBe(web);
});
