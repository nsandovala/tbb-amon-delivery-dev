/**
 * ORDER-IDEMPOTENCY — estado del intento de compra (web y POS comparten esta lógica).
 *
 * Se persiste en `sessionStorage` SOLO lo necesario para recuperar un intento
 * cuya respuesta se perdió: la clave aleatoria, la hora, el estado, un resumen
 * (unidades y total) y la huella de los carritos enviados con esa clave
 * (hash de IDs de producto y cantidades). Nunca nombre, teléfono, email,
 * dirección ni notas.
 *
 * Estados:
 * - `pending`: hay un envío con esta clave. Si `uncertain` es true, no sabemos
 *   si se registró (error de red, 5xx, timeout o recarga durante el envío).
 * - `conflict`: el servidor respondió IDEMPOTENCY_KEY_REUSED: hay un pedido
 *   registrado con esta clave y otro contenido. No se envía nada más con ella
 *   hasta que la persona decida.
 * - `ambiguous` (O-05): la verificación encontró el pedido, pero con esta clave
 *   se enviaron varios carritos y el actual es uno de ellos: no se puede saber
 *   cuál se registró. No se vacía nada ni se envía nada hasta que la persona
 *   decida (`discardOrderAttempt`).
 *
 * Envíos activos (CR-02): la misma clave puede tener más de un envío en vuelo
 * (el checkout se cerró y se reabrió, o el POS se desmontó y volvió). Se cuentan
 * en memoria de la pestaña; un 4xx de UNO de ellos no prueba nada sobre los
 * demás, así que no borra el intento mientras otro siga activo. Tras una
 * recarga el contador se pierde, pero el intento `pending` vuelve como incierto.
 *
 * Historial truncado (CR-04): se guardan como máximo 5 huellas. Si hubo que
 * descartar alguna, `truncated` lo recuerda: un carrito que no está en la lista
 * ya no prueba que sea distinto del registrado, y la verificación lo trata como
 * ambiguo.
 *
 * Toda escritura asíncrona (respuesta del envío, verificación) recibe la clave
 * con la que empezó y solo actúa si sigue siendo la del intento actual: una
 * respuesta tardía de un intento viejo nunca limpia ni sobrescribe otro.
 *
 * Una clave nueva solo nace de `beginOrderAttempt` sin intento previo o de
 * `startNewOrderAttempt`, que la UI llama solo tras una decisión explícita.
 */

export type OrderAttemptSummary = { units: number; total: number };

export type OrderAttempt = {
  v: 2;
  key: string;
  startedAt: number;
  status: "pending" | "conflict" | "ambiguous";
  uncertain: boolean;
  /** Código del pedido encontrado (solo en `ambiguous`). */
  foundCode?: string;
  summary: OrderAttemptSummary;
  /** Huellas (sin PII) de los carritos enviados con esta clave, máx. 5. */
  sentCarts: string[];
  /** Se descartaron huellas antiguas: `sentCarts` ya no es el historial completo (CR-04). */
  truncated?: boolean;
};

/**
 * Resultado de un envío fallido. `pending-other`: hay otro envío con la misma
 * clave todavía activo; ese decidirá el resultado, así que la UI no informa
 * nada por este (CR-02).
 */
export type AttemptFailure = "conflict" | "uncertain" | "definitive" | "pending-other" | "stale";

/** Resultado de aplicar una respuesta exitosa (201/200) del envío (O-05). */
export type SuccessSettlement =
  /** Intento vigente y mismo carrito: aplicar los efectos normales (vaciar, cerrar, recibo). */
  | "apply"
  /** Intento vigente, pero el carrito cambió mientras se esperaba: no vaciarlo. */
  | "cart-changed"
  /** Respuesta de un intento que ya no es el vigente: sin efectos de UI. */
  | "stale";

/** Resultado de aplicar una verificación `found: true`. */
export type FoundResolution =
  /** El carrito actual es el del intento: el checkout queda resuelto (vaciar). */
  | "resolve-checkout"
  /** Carrito distinto (o vacío): se respeta; el intento queda cerrado. */
  | "keep-cart"
  /** Conflicto 409: el pedido encontrado no es el carrito actual; decide la persona. */
  | "conflict"
  /** Varios carritos enviados con la clave y el actual es uno: decide la persona (O-05). */
  | "ambiguous"
  /** El intento cambió mientras se verificaba: el resultado se descarta. */
  | "stale";

const STORAGE_PREFIX = "amon-order-attempt:";
const MAX_SENT_CARTS = 5;
const memory = new Map<string, OrderAttempt>();
/** Envíos en vuelo por clave, solo en memoria de esta pestaña (CR-02). */
const inFlight = new Map<string, number>();

/**
 * CR-01: al recargar o salir de la página, el navegador aborta las peticiones
 * en vuelo y sus promesas fallan DESPUÉS de `pagehide`, todavía dentro de la
 * página que se va. Esa página ya no decide nada: no cierra ni modifica el
 * intento (la página nueva lo encuentra intacto y lo trata como incierto).
 */
let pageHiding = false;
let lifecycleWatched = false;
function watchPageLifecycle(): void {
  if (lifecycleWatched || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  lifecycleWatched = true;
  window.addEventListener("pagehide", () => {
    pageHiding = true;
  });
  window.addEventListener("pageshow", () => {
    pageHiding = false;
  });
}

/** Termina un envío de `key`; devuelve cuántos siguen activos con esa clave. */
function endSubmission(key: string): number {
  const remaining = Math.max(0, (inFlight.get(key) ?? 0) - 1);
  if (remaining === 0) inFlight.delete(key);
  else inFlight.set(key, remaining);
  return remaining;
}

function randomKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Huella del carrito: FNV-1a de los pares producto×cantidad ordenados. No
 * incluye precios ni datos del cliente; un carrito vacío no tiene huella.
 */
export function cartSignature(items: Array<{ productId: string; qty: number }>): string {
  const canonical = items
    .filter((item) => item.qty > 0)
    .map((item) => `${item.productId}×${item.qty}`)
    .sort()
    .join("|");
  if (!canonical) return "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `c${hash.toString(16).padStart(8, "0")}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function parse(raw: string | null): OrderAttempt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Omit<Partial<OrderAttempt>, "v"> & { v?: number };
    if (
      (value.v === 1 || value.v === 2) &&
      typeof value.key === "string" &&
      typeof value.startedAt === "number" &&
      (value.status === "pending" || value.status === "conflict" || value.status === "ambiguous")
    ) {
      return {
        v: 2,
        key: value.key,
        startedAt: value.startedAt,
        status: value.status,
        uncertain: value.uncertain === true,
        summary: {
          units: Number(value.summary?.units) || 0,
          total: Number(value.summary?.total) || 0,
        },
        ...(typeof value.foundCode === "string" ? { foundCode: value.foundCode } : {}),
        ...(value.truncated === true ||
        (Array.isArray(value.sentCarts) && value.sentCarts.length > MAX_SENT_CARTS)
          ? { truncated: true }
          : {}),
        sentCarts: Array.isArray(value.sentCarts)
          ? value.sentCarts.filter((entry): entry is string => typeof entry === "string").slice(-MAX_SENT_CARTS)
          : [],
      };
    }
  } catch {
    /* Valor corrupto: se ignora. */
  }
  return null;
}

const CHANGE_EVENT = "amon-order-attempt-change";

function save(scope: string, attempt: OrderAttempt | null): void {
  if (attempt) memory.set(scope, attempt);
  else memory.delete(scope);
  const store = storage();
  if (store) {
    try {
      if (attempt) store.setItem(STORAGE_PREFIX + scope, JSON.stringify(attempt));
      else store.removeItem(STORAGE_PREFIX + scope);
    } catch {
      /* Sin almacenamiento: queda solo en memoria de la pestaña. */
    }
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { scope } }));
  }
}

function read(scope: string): OrderAttempt | null {
  return memory.get(scope) ?? parse(storage()?.getItem(STORAGE_PREFIX + scope) ?? null);
}

/** Intento actual de la clave esperada; null si ya no es el intento vigente. */
function readCurrent(scope: string, expectedKey: string): OrderAttempt | null {
  const current = read(scope);
  return current && current.key === expectedKey ? current : null;
}

/** Notifica cambios del intento (para que el aviso y el checkout se sincronicen). */
export function subscribeOrderAttempt(scope: string, onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    if ((event as CustomEvent<{ scope?: string }>).detail?.scope === scope) onChange();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/** Intento actual sin efectos (para re-render tras un cambio). */
export function peekOrderAttempt(scope: string): OrderAttempt | null {
  return read(scope);
}

/**
 * Intento guardado al cargar la página. Un `pending` que sobrevivió a una
 * recarga estaba en vuelo o sin confirmar: se trata como incierto.
 */
export function loadOrderAttempt(scope: string): OrderAttempt | null {
  const attempt = read(scope);
  if (!attempt) return null;
  if (attempt.status === "pending" && !attempt.uncertain && !memory.has(scope)) {
    const recovered = { ...attempt, uncertain: true };
    save(scope, recovered);
    return recovered;
  }
  memory.set(scope, attempt);
  return attempt;
}

/**
 * Clave para enviar. Reutiliza la del intento en curso (pendiente o incierto):
 * reenviar con la misma clave nunca duplica. Registra la huella del carrito
 * enviado. Lanza si el intento está en conflicto: la UI debe pedir una
 * decisión explícita (`startNewOrderAttempt`).
 */
export function beginOrderAttempt(
  scope: string,
  summary: OrderAttemptSummary,
  cart: string = ""
): string {
  watchPageLifecycle();
  const current = read(scope);
  if (current?.status === "conflict") {
    throw new Error("ORDER_ATTEMPT_CONFLICT");
  }
  if (current?.status === "ambiguous") {
    throw new Error("ORDER_ATTEMPT_AMBIGUOUS");
  }
  const isNewCart = (carts: string[]) => Boolean(cart) && !carts.includes(cart);
  const withCart = (carts: string[]) =>
    isNewCart(carts) ? [...carts, cart].slice(-MAX_SENT_CARTS) : carts;
  const overflows = (carts: string[]) => isNewCart(carts) && carts.length >= MAX_SENT_CARTS;
  if (current) {
    save(scope, {
      ...current,
      summary,
      sentCarts: withCart(current.sentCarts),
      ...(current.truncated || overflows(current.sentCarts) ? { truncated: true } : {}),
    });
    inFlight.set(current.key, (inFlight.get(current.key) ?? 0) + 1);
    return current.key;
  }
  const created: OrderAttempt = {
    v: 2,
    key: randomKey(),
    startedAt: Date.now(),
    status: "pending",
    uncertain: false,
    summary,
    sentCarts: withCart([]),
  };
  save(scope, created);
  inFlight.set(created.key, 1);
  return created.key;
}

/** Decisión explícita de la persona: descartar el intento anterior y empezar otro. */
export function startNewOrderAttempt(scope: string, summary: OrderAttemptSummary, cart = ""): string {
  save(scope, null);
  return beginOrderAttempt(scope, summary, cart);
}

/**
 * Venta confirmada (201 o 200). Limpia el estado SOLO si `expectedKey` sigue
 * siendo el intento vigente. Devuelve false si era una respuesta tardía.
 */
export function finishOrderAttempt(scope: string, expectedKey: string): boolean {
  endSubmission(expectedKey);
  if (!readCurrent(scope, expectedKey)) return false;
  save(scope, null);
  return true;
}

/**
 * Respuesta exitosa (201 o 200) del envío `expectedKey` (O-05). Decide qué
 * efectos de UI aplicar, en vez de aplicarlos a ciegas:
 * - "stale": el intento ya no es el vigente (otro intento empezó o ya se
 *   resolvió por verificación). No se toca carrito, formulario, comprobante
 *   ni estado.
 * - "cart-changed": intento vigente, se cierra, pero el carrito actual no es el
 *   que se envió: no se vacía.
 * - "apply": intento vigente y mismo carrito: se cierra y la UI aplica los
 *   efectos normales.
 */
export function settleOrderAttemptSuccess(
  scope: string,
  expectedKey: string,
  sentCart: string,
  currentCart: string
): SuccessSettlement {
  endSubmission(expectedKey);
  if (pageHiding || !readCurrent(scope, expectedKey)) return "stale";
  save(scope, null);
  return currentCart === sentCart ? "apply" : "cart-changed";
}

/**
 * La respuesta exitosa de `expectedKey` llegó cuando la vista que envió ya no
 * estaba montada (O-05): nadie vio la confirmación. En vez de cerrar el intento
 * en silencio, queda incierto para que la vista actual pida verificarlo. Si el
 * intento ya no es el vigente, no hace nada y devuelve false.
 */
export function markOrderAttemptUnconfirmed(scope: string, expectedKey: string): boolean {
  endSubmission(expectedKey);
  if (pageHiding) return false;
  const current = readCurrent(scope, expectedKey);
  if (!current || current.status !== "pending") return false;
  save(scope, { ...current, uncertain: true });
  return true;
}

/** Descartar por decisión explícita (aviso de conflicto o ambigüedad), sin condicionar a clave. */
export function discardOrderAttempt(scope: string): void {
  save(scope, null);
}

/**
 * Aplica una verificación `found: true` del intento `expectedKey`:
 * - Si el intento cambió mientras se verificaba → "stale", sin efectos.
 * - En conflicto → "conflict": el pedido encontrado NO es el carrito actual
 *   (eso probó el 409); no se toca nada y decide la persona.
 * - Si el carrito actual es EL ÚNICO enviado con esta clave → el intento se
 *   cierra y la UI debe resolver el checkout (vaciar ese carrito), igual que
 *   tras un 201: así un clic accidental no puede volver a enviarlo.
 * - Si con esta clave se enviaron varios carritos y el actual es uno de ellos,
 *   o si el historial se truncó y hay carrito (CR-04) → "ambiguous": no se
 *   sabe cuál se registró. Se conserva el carrito, el
 *   intento queda bloqueado y la persona decide (O-05).
 * - Si el carrito es distinto o está vacío → el intento se cierra y el carrito
 *   se respeta; enviarlo será una compra nueva con confirmación explícita.
 */
export function resolveFoundOrderAttempt(
  scope: string,
  expectedKey: string,
  currentCart: string,
  foundCode = ""
): FoundResolution {
  const current = readCurrent(scope, expectedKey);
  if (!current) return "stale";
  if (current.status === "conflict") return "conflict";
  const matches = Boolean(currentCart) && current.sentCarts.includes(currentCart);
  // CR-04: con historial truncado, que el carrito no aparezca no prueba nada.
  const unknown = Boolean(currentCart) && current.truncated === true;
  if (unknown || (matches && current.sentCarts.length > 1)) {
    save(scope, { ...current, status: "ambiguous", uncertain: false, foundCode });
    return "ambiguous";
  }
  save(scope, null);
  return matches ? "resolve-checkout" : "keep-cart";
}

/**
 * Clasifica un error del envío del intento `expectedKey` y actualiza el estado:
 * - El intento ya no es el vigente → "stale", sin efectos.
 * - IDEMPOTENCY_KEY_REUSED → `conflict` (se conserva la clave).
 * - 4xx de negocio o validación → definitivo, nada se creó con ESTE envío. Si
 *   el intento no venía incierto, se limpia; si venía incierto, se conserva,
 *   porque un envío anterior con la misma clave pudo haberse registrado.
 * - Red, timeout, 5xx o sin código → `uncertain`.
 * - Si otro envío con la misma clave sigue activo (CR-02), un 4xx no borra el
 *   intento y la UI no informa nada (`pending-other`): decide ese otro envío.
 *   Un error de red marca el intento incierto, pero también espera al otro.
 */
export function recordOrderAttemptFailure(
  scope: string,
  error: unknown,
  expectedKey: string
): AttemptFailure {
  const othersActive = endSubmission(expectedKey) > 0;
  if (pageHiding) return "stale";
  const current = readCurrent(scope, expectedKey);
  if (!current) return "stale";
  const code = apiErrorCode(error);
  const status = apiErrorStatus(error);

  if (code === "IDEMPOTENCY_KEY_REUSED") {
    save(scope, { ...current, status: "conflict", uncertain: false });
    return "conflict";
  }
  if (status !== undefined && status >= 400 && status < 500) {
    if (othersActive) return "pending-other";
    if (!current.uncertain) save(scope, null);
    return "definitive";
  }
  save(scope, { ...current, uncertain: true });
  return othersActive ? "pending-other" : "uncertain";
}

/** Código de error de la API (ej. IDEMPOTENCY_KEY_REUSED, STORE_CLOSED). */
export function apiErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Estado HTTP adjuntado por `apiFetch`; undefined si no hubo respuesta (red). */
export function apiErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Solo pruebas: olvida el estado en memoria, como una carga nueva de la página.
 * `sessionStorage` se conserva, igual que en una recarga real.
 */
export function __simulatePageReloadForTests(): void {
  memory.clear();
  inFlight.clear();
  pageHiding = false;
}
