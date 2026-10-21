import { expect, test } from "@playwright/test";
import { buildPosReceiptText, receiptFromOrder, type PosReceipt } from "../../apps/admin/src/lib/pos-receipt";

const baseReceipt: PosReceipt = {
  orderId: "order-1",
  displayCode: "024",
  createdAt: new Date("2026-10-21T16:30:00.000Z"),
  customerName: "Cliente mostrador",
  fulfillmentType: "pickup",
  paymentLabel: "Efectivo",
  items: [{ name: "Shenlong Burger", quantity: 2, unitPrice: 8_500 }],
  subtotal: 17_000,
  delivery: 0,
  total: 17_000,
};

test.describe("Comprobante interno POS", () => {
  test("resume la venta de retiro con formato chileno y etiqueta no tributaria", () => {
    const text = buildPosReceiptText(baseReceipt);

    expect(text).toContain("Pedido 024");
    expect(text).toContain("2 × Shenlong Burger  $17.000");
    expect(text).toContain("TOTAL: $17.000");
    expect(text).toContain("Retiro");
    expect(text).toContain("Documento interno, no tributario.");
    expect(text).not.toContain("boleta tributaria");
    expect(text).not.toContain("Delivery: $0");
  });

  test("incluye datos de entrega, canal de origen y costo de delivery", () => {
    const text = buildPosReceiptText({
      ...baseReceipt,
      customerName: "Ana Pérez",
      customerPhone: "+56912345678",
      fulfillmentType: "delivery",
      acquisitionLabel: "Instagram",
      acquisitionCampaign: "Publicación mechada octubre",
      address: "Pasaje Nueve 344",
      delivery: 1_500,
      total: 18_500,
    });

    expect(text).toContain("Entrega: Delivery");
    expect(text).toContain("Cliente: Ana Pérez");
    expect(text).toContain("Delivery: $1.500");
    expect(text).toContain("Instagram");
    expect(text).toContain("Campaña/publicación: Publicación mechada octubre");
  });

  test("reconstruye el comprobante desde un pedido persistido e identifica cancelaciones", () => {
    const receipt = receiptFromOrder({
      id: "order-2",
      displayCode: "025",
      createdAt: { seconds: 1_792_602_600 },
      status: "cancelled",
      fulfillmentType: "delivery",
      paymentMethod: "transfer",
      acquisitionSource: "whatsapp",
      customer: { name: "Ana Pérez", address: "Playa Ancha" },
      items: [{ productId: "burger-1", qty: 2, unitPrice: 8_500 }],
      totals: { subtotal: 17_000, deliveryFee: 1_500, total: 18_500 },
    });
    const text = buildPosReceiptText(receipt);

    expect(receipt.displayCode).toBe("025");
    expect(receipt.paymentLabel).toBe("Transferencia");
    expect(receipt.acquisitionLabel).toBe("WhatsApp");
    expect(text).toContain("Dirección: Playa Ancha");
    expect(text).toContain("ESTADO: PEDIDO CANCELADO");
    expect(text).toContain("TOTAL: $18.500");
  });
});
