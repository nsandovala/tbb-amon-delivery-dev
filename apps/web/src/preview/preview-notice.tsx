"use client";

import { PREVIEW_MARKER } from "@/preview/disabled";

/**
 * TBB-TABLET-PREVIEW-01 — reemplaza `PendingOrderNotice` en la vista previa: no hay
 * intentos de compra que revisar y el aviso deja claro que no se toman pedidos.
 * Va abajo y bajo el carrito (z-60/70) para no tapar la cabecera ni el checkout.
 */
export function PendingOrderNotice(_props: { tenantId: string }) {
  return (
    <div
      role="status"
      data-amon-preview={PREVIEW_MARKER}
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[55] flex justify-center px-4"
    >
      <p className="pointer-events-auto rounded-full border border-amber-300/30 bg-[#1a1408]/95 px-4 py-1.5 text-center text-xs font-medium text-amber-100 shadow-lg backdrop-blur">
        Vista previa · Los pedidos y pagos están deshabilitados
      </p>
    </div>
  );
}
