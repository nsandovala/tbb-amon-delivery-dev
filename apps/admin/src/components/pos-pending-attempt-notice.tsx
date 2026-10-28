"use client";

import { useEffect, useRef, useState } from "react";
import { lookupPosAttemptApi } from "../lib/api/orders";
import {
  discardOrderAttempt,
  loadOrderAttempt,
  peekOrderAttempt,
  resolveFoundOrderAttempt,
  subscribeOrderAttempt,
  type OrderAttempt,
} from "../lib/order-attempt";

type Verification =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "found"; code: string; orderId: string; cart: "resolved" | "kept" | "conflict" }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

/**
 * ORDER-IDEMPOTENCY (O-01..O-04) — aviso de venta POS sin confirmar.
 *
 * Verificar es de solo lectura (exige `pos.create_sale`). Si la venta existe y
 * el carrito actual del POS es el que se envió con ese intento, el formulario
 * se resuelve (`onResolveCheckout`) para que no se registre dos veces; un
 * carrito distinto se respeta. `found: false` no es definitivo: se puede
 * verificar de nuevo con la misma clave. Resultados de un intento que ya cambió
 * se descartan.
 */
export function PosPendingAttemptNotice({
  tenantId,
  currentCartSignature,
  onResolveCheckout,
  onFoundOrder,
}: {
  tenantId: string;
  currentCartSignature: string;
  onResolveCheckout: () => void;
  onFoundOrder: (orderId: string) => void;
}) {
  const scope = `pos:${tenantId}`;
  const [attempt, setAttempt] = useState<OrderAttempt | null>(null);
  const [verification, setVerification] = useState<Verification>({ kind: "idle" });
  // El carrito puede cambiar mientras se verifica: se compara al llegar la respuesta.
  const cartRef = useRef(currentCartSignature);
  cartRef.current = currentCartSignature;

  useEffect(() => {
    setAttempt(loadOrderAttempt(scope));
    return subscribeOrderAttempt(scope, () => {
      const next = peekOrderAttempt(scope);
      setAttempt(next);
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

  async function verify() {
    if (!attempt) return;
    const key = attempt.key;
    setVerification({ kind: "checking" });
    try {
      const result = await lookupPosAttemptApi(tenantId, key);
      if (result.found && result.orderId) {
        const code = result.displayCode ?? result.orderId.slice(0, 6);
        const resolution = resolveFoundOrderAttempt(scope, key, cartRef.current, code);
        if (resolution === "stale" || resolution === "ambiguous") {
          setVerification({ kind: "idle" });
          return;
        }
        if (resolution === "resolve-checkout") onResolveCheckout();
        setVerification({
          kind: "found",
          orderId: result.orderId,
          code,
          cart: resolution === "resolve-checkout" ? "resolved" : resolution === "conflict" ? "conflict" : "kept",
        });
        return;
      }
      // O-04: sin resultado todavía; se conserva la clave y el estado incierto.
      setVerification(peekOrderAttempt(scope)?.key === key ? { kind: "notFound" } : { kind: "idle" });
    } catch (error) {
      if (peekOrderAttempt(scope)?.key !== key) {
        setVerification({ kind: "idle" });
        return;
      }
      setVerification({
        kind: "error",
        message: error instanceof Error ? error.message : "No pudimos verificar la venta.",
      });
    }
  }

  function discardPrevious() {
    discardOrderAttempt(scope);
    setVerification({ kind: "idle" });
  }

  /** O-05: decisión explícita en el caso ambiguo: el carrito actual ES la venta registrada. */
  function resolveAmbiguousAsSame() {
    discardOrderAttempt(scope);
    onResolveCheckout();
    setVerification({ kind: "idle" });
  }

  const summary = attempt
    ? `${attempt.summary.units} ${attempt.summary.units === 1 ? "unidad" : "unidades"} · $${attempt.summary.total.toLocaleString("es-CL")}`
    : "";
  const button = "rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
  const checking = verification.kind === "checking";

  return (
    <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-neutral-200">
      {verification.kind === "found" && verification.cart !== "conflict" ? (
        <>
          <p className="font-semibold text-emerald-300">La venta #{verification.code} quedó registrada.</p>
          <p className="mt-1 text-neutral-400">
            {verification.cart === "resolved"
              ? "Limpiamos el formulario de esa venta para que no se registre dos veces."
              : "El carrito actual no se modificó. Si lo registras, será una venta nueva."}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button className={`${button} border border-white/10`} onClick={() => onFoundOrder(verification.orderId)}>
              Ver comprobante
            </button>
            <button className={button} onClick={() => setVerification({ kind: "idle" })}>Cerrar</button>
          </div>
        </>
      ) : isAmbiguous ? (
        <>
          <p className="font-semibold text-amber-300">
            Encontramos la venta{attempt?.foundCode ? ` #${attempt.foundCode}` : ""}, pero no sabemos con qué carrito.
          </p>
          <p className="mt-1 text-neutral-400">
            Con este intento se enviaron varios carritos y no podemos saber cuál quedó registrado. Confirma si el carrito actual es esa venta antes de seguir.
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button className={`${button} border border-white/10`} onClick={discardPrevious}>
              Conservar carrito
            </button>
            <button className={`${button} bg-amber-400 text-black`} onClick={resolveAmbiguousAsSame}>
              Es esa venta: limpiar formulario
            </button>
          </div>
        </>
      ) : isConflict ? (
        <>
          <p className="font-semibold text-amber-300">La venta anterior ya quedó registrada con otro detalle.</p>
          <p className="mt-1 text-neutral-400">
            No se registró la venta actual.
            {verification.kind === "found" ? ` La anterior es la #${verification.code}.` : ""} Si además corresponde esta venta, descarta el intento anterior y vuelve a registrarla.
          </p>
          {verification.kind === "error" ? <p className="mt-1 text-red-300">{verification.message}</p> : null}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {verification.kind === "found" ? (
              <button className={`${button} border border-white/10`} onClick={() => onFoundOrder(verification.orderId)}>
                Ver comprobante anterior
              </button>
            ) : (
              <button className={`${button} border border-white/10`} onClick={verify} disabled={checking}>
                {checking ? "Verificando…" : "Ver venta registrada"}
              </button>
            )}
            <button className={`${button} bg-amber-400 text-black`} onClick={discardPrevious}>
              Descartar intento anterior
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold text-amber-300">Venta sin confirmar ({summary}).</p>
          <p className="mt-1 text-neutral-400">
            Verifica si quedó registrada antes de cobrar de nuevo. Reintentar con el mismo detalle no la duplica.
          </p>
          {verification.kind === "notFound" ? (
            <p className="mt-1 text-neutral-300">
              Todavía no aparece. Puede estar procesándose: verifica de nuevo en unos segundos. El intento se mantiene, así que reintentar no la duplica.
            </p>
          ) : null}
          {verification.kind === "error" ? <p className="mt-1 text-red-300">{verification.message}</p> : null}
          <div className="mt-2 flex justify-end">
            <button className={`${button} bg-amber-400 text-black`} onClick={verify} disabled={checking}>
              {checking ? "Verificando…" : verification.kind === "notFound" ? "Verificar de nuevo" : "Verificar venta"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
