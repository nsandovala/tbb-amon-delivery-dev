"use client";

import { useEffect, useState } from "react";
import { lookupOrderAttemptApi } from "@/lib/api/orders";
import {
  cartSignature,
  discardOrderAttempt,
  loadOrderAttempt,
  peekOrderAttempt,
  resolveFoundOrderAttempt,
  subscribeOrderAttempt,
  type OrderAttempt,
} from "@/lib/order-attempt";
import { useCartStore } from "@/lib/store/cart-store";

type Verification =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "found"; code: string; cart: "resolved" | "kept" | "conflict" }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

function currentCartSignature(): string {
  return cartSignature(
    useCartStore.getState().items.map((item) => ({ productId: item.product.id, qty: item.quantity }))
  );
}

/**
 * ORDER-IDEMPOTENCY (O-01..O-04) — aviso de un intento de compra sin confirmar.
 *
 * - "Verificar" es de solo lectura: nunca crea un pedido.
 * - Pedido encontrado (O-03): si el carrito actual es el que se envió con ese
 *   intento, se vacía (el checkout queda resuelto, como tras un 201) para que
 *   un clic accidental no lo envíe otra vez con una clave nueva. Un carrito
 *   distinto se respeta: confirmarlo será una compra nueva y explícita.
 * - Sin resultado (O-04): no es definitivo; el pedido puede estar
 *   procesándose. Se conserva la clave y se puede verificar de nuevo.
 * - Un resultado que llega después de que el intento cambió se descarta.
 */
export function PendingOrderNotice({ tenantId }: { tenantId: string }) {
  const scope = `web:${tenantId}`;
  const clearCart = useCartStore((s) => s.clearCart);
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null);
  const [verification, setVerification] = useState<Verification>({ kind: "idle" });

  useEffect(() => {
    setAttempt(loadOrderAttempt(scope));
    return subscribeOrderAttempt(scope, () => {
      const next = peekOrderAttempt(scope);
      setAttempt(next);
      // Un problema nuevo (otro envío incierto o un 409) reinicia la verificación.
      if (next && (next.uncertain || next.status !== "pending")) {
        setVerification((current) =>
          current.kind === "checking" || current.kind === "notFound" ? current : { kind: "idle" }
        );
      }
    });
  }, [scope]);

  const isConflict = attempt?.status === "conflict";
  const isAmbiguous = attempt?.status === "ambiguous";
  const visible =
    verification.kind === "found" ||
    (attempt !== null && (isConflict || isAmbiguous || attempt.uncertain));
  if (!visible) return null;

  const summary = attempt
    ? `${attempt.summary.units} ${attempt.summary.units === 1 ? "producto" : "productos"} · $${attempt.summary.total.toLocaleString("es-CL")}`
    : "";

  async function verify() {
    if (!attempt) return;
    const key = attempt.key;
    setVerification({ kind: "checking" });
    try {
      const result = await lookupOrderAttemptApi(tenantId, key);
      if (result.found) {
        const code = result.displayCode ?? result.orderId?.slice(0, 6) ?? "";
        const resolution = resolveFoundOrderAttempt(scope, key, currentCartSignature(), code);
        if (resolution === "stale" || resolution === "ambiguous") {
          // Ambiguo: el estado del intento pasa a `ambiguous` y el aviso pide decidir.
          setVerification({ kind: "idle" });
          return;
        }
        if (resolution === "resolve-checkout") clearCart();
        setVerification({
          kind: "found",
          code,
          cart: resolution === "resolve-checkout" ? "resolved" : resolution === "conflict" ? "conflict" : "kept",
        });
        return;
      }
      // O-04: sin resultado todavía. Se conserva la clave y el estado incierto.
      setVerification(peekOrderAttempt(scope)?.key === key ? { kind: "notFound" } : { kind: "idle" });
    } catch (error) {
      if (peekOrderAttempt(scope)?.key !== key) {
        setVerification({ kind: "idle" });
        return;
      }
      setVerification({
        kind: "error",
        message: error instanceof Error ? error.message : "No pudimos verificar. Intenta otra vez.",
      });
    }
  }

  function discardPrevious() {
    discardOrderAttempt(scope);
    setVerification({ kind: "idle" });
  }

  /** O-05: decisión explícita en el caso ambiguo: el carrito actual ES el pedido registrado. */
  function resolveAmbiguousAsSame() {
    discardOrderAttempt(scope);
    clearCart();
    setVerification({ kind: "idle" });
  }

  const checking = verification.kind === "checking";
  const primary = "rounded-lg bg-amber-400/90 px-3 py-1.5 font-semibold text-black hover:bg-amber-300 disabled:opacity-50";
  const secondary = "rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-50";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-2xl border border-amber-400/30 bg-[#141210] p-4 text-sm text-neutral-200 shadow-2xl"
    >
      {verification.kind === "found" && verification.cart !== "conflict" ? (
        <>
          <p className="font-semibold text-emerald-300">Tu pedido #{verification.code} quedó registrado.</p>
          <p className="mt-1 text-neutral-400">
            {verification.cart === "resolved"
              ? "Vaciamos el carrito de ese pedido para que no se envíe dos veces."
              : "Tu carrito actual no se modificó. Si lo confirmas, será un pedido nuevo."}
          </p>
          <div className="mt-3 flex justify-end">
            <button className="rounded-lg px-3 py-1.5 text-neutral-300 hover:bg-white/5" onClick={() => setVerification({ kind: "idle" })}>
              Cerrar
            </button>
          </div>
        </>
      ) : isAmbiguous ? (
        <>
          <p className="font-semibold text-amber-300">
            Encontramos tu pedido{attempt?.foundCode ? ` #${attempt.foundCode}` : ""}, pero no sabemos con qué carrito.
          </p>
          <p className="mt-1 text-neutral-400">
            Durante los reintentos enviaste más de un carrito y el actual es uno de ellos. Antes de seguir, dinos si el carrito actual es ese pedido.
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button className={secondary} onClick={discardPrevious}>
              Conservar carrito
            </button>
            <button className={primary} onClick={resolveAmbiguousAsSame}>
              Es ese pedido: vaciar carrito
            </button>
          </div>
        </>
      ) : isConflict ? (
        <>
          <p className="font-semibold text-amber-300">Tu intento anterior ya quedó registrado como pedido.</p>
          <p className="mt-1 text-neutral-400">
            Tiene un contenido distinto al carrito actual, así que no enviamos nada nuevo.
            {verification.kind === "found" ? ` Es el pedido #${verification.code}.` : ""}
          </p>
          <p className="mt-1 text-neutral-500">
            Si además quieres el pedido actual, descarta el intento anterior y vuelve a confirmar desde el carrito.
          </p>
          {verification.kind === "error" ? <p className="mt-2 text-red-300">{verification.message}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {verification.kind === "found" ? null : (
              <button className={secondary} onClick={verify} disabled={checking}>
                {checking ? "Verificando…" : "Ver pedido registrado"}
              </button>
            )}
            <button className={primary} onClick={discardPrevious}>
              Descartar intento anterior
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold text-amber-300">No pudimos confirmar tu último pedido.</p>
          <p className="mt-1 text-neutral-400">
            {summary}. Verifica si quedó registrado antes de volver a enviarlo; si lo reenvías desde el carrito con los mismos datos, no se duplicará.
          </p>
          {verification.kind === "notFound" ? (
            <p className="mt-2 text-neutral-300">
              Todavía no lo encontramos. Puede estar procesándose: verifica de nuevo en unos segundos. Tu intento se mantiene, así que reenviarlo no lo duplicará.
            </p>
          ) : null}
          {verification.kind === "error" ? <p className="mt-2 text-red-300">{verification.message}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button className={primary} onClick={verify} disabled={checking}>
              {checking ? "Verificando…" : verification.kind === "notFound" ? "Verificar de nuevo" : "Verificar pedido"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
