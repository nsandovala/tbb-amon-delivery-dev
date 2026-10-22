"use client";

import { useState } from "react";
import { Check, Copy, Printer, Share2, X } from "lucide-react";
import { buildPosReceiptText, type PosReceipt } from "@/lib/pos-receipt";

function money(value: number) {
  return `$${value.toLocaleString("es-CL")}`;
}

export function PosReceiptDialog({
  receipt,
  onClose,
  onNewSale,
  actionLabel = "Nueva venta",
}: {
  receipt: PosReceipt;
  onClose: () => void;
  onNewSale?: () => void;
  actionLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const formattedDate = receipt.createdAt ? new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(receipt.createdAt) : "Fecha sin registro";

  async function shareReceipt() {
    const text = buildPosReceiptText(receipt);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Comprobante TBB ${receipt.displayCode}`, text });
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("No se pudo compartir el comprobante:", error);
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copia el detalle del comprobante:", text);
    }
  }

  return (
    <div className="pos-receipt-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        aria-labelledby="pos-receipt-title"
        aria-modal="true"
        className="pos-receipt-dialog"
        role="dialog"
      >
        <header className="pos-receipt-modal-header">
          <div>
            <p className="pos-kicker">{receipt.status === "cancelled" ? "Pedido cancelado" : "Comprobante guardado"}</p>
            <h2 id="pos-receipt-title">Comprobante interno</h2>
          </div>
          <button type="button" className="pos-icon-button" onClick={onClose} aria-label="Cerrar comprobante">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="pos-receipt-scroll">
          <article className="pos-receipt-paper" data-pos-printable>
            <div className="pos-receipt-brand">
              <img
                src="/images/stubs/logotbb.png"
                alt="TBB"
                onError={(event) => { event.currentTarget.hidden = true; }}
              />
              <div>
                <p className="pos-receipt-brand-name">THE BEST BURGER</p>
                <p className="pos-receipt-brand-caption">Receta de la Abuela · Valparaíso</p>
              </div>
            </div>

            <div className="pos-receipt-order">
              <span>Pedido</span>
              <strong>#{receipt.displayCode}</strong>
              <time>{formattedDate}</time>
              {receipt.status === "cancelled" ? <strong className="pos-receipt-cancelled">PEDIDO CANCELADO</strong> : null}
            </div>

            <div className="pos-receipt-section">
              <p className="pos-receipt-label">Cliente</p>
              <strong>{receipt.customerName}</strong>
              {receipt.customerPhone ? <span>{receipt.customerPhone}</span> : null}
              {receipt.address ? <span>{receipt.address}</span> : null}
            </div>

            <div className="pos-receipt-section">
              <p className="pos-receipt-label">Detalle</p>
              {receipt.items.map((item, index) => (
                <div className="pos-receipt-line" key={`${item.name}-${index}`}>
                  <span>{item.quantity} × {item.name}</span>
                  <strong>{money(item.unitPrice * item.quantity)}</strong>
                </div>
              ))}
            </div>

            <div className="pos-receipt-totals">
              <div><span>Subtotal</span><span>{money(receipt.subtotal)}</span></div>
              {receipt.delivery > 0 ? <div><span>Delivery</span><span>{money(receipt.delivery)}</span></div> : null}
              <div className="pos-receipt-total"><strong>Total</strong><strong>{money(receipt.total)}</strong></div>
            </div>

            <div className="pos-receipt-meta">
              <span>{receipt.fulfillmentType === "delivery" ? "Delivery" : "Retiro en tienda"}</span>
              <span>Pago: {receipt.paymentLabel}</span>
              {receipt.acquisitionLabel ? <span>Origen: {receipt.acquisitionLabel}</span> : null}
              {receipt.acquisitionCampaign ? <span>Campaña/publicación: {receipt.acquisitionCampaign}</span> : null}
              {receipt.notes ? <span>Nota: {receipt.notes}</span> : null}
            </div>

            <p className="pos-receipt-disclaimer">
              Comprobante interno de venta. No es boleta tributaria ni documento válido ante el SII.
            </p>
          </article>
        </div>

        <footer className="pos-receipt-actions">
          <button type="button" className="pos-secondary-button" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" className="pos-secondary-button" onClick={() => void shareReceipt()}>
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {copied ? "Copiado" : "Compartir"}
          </button>
          {onNewSale ? <button type="button" className="pos-primary-button" onClick={onNewSale}>{actionLabel}</button> : null}
        </footer>
        <p className="pos-print-hint">Impresión del sistema · elige una impresora instalada en Windows</p>
      </section>
    </div>
  );
}
