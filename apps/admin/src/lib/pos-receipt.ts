export type PosReceipt = {
  orderId: string;
  displayCode: string;
  createdAt?: Date;
  customerName: string;
  customerPhone?: string;
  fulfillmentType: "delivery" | "pickup";
  paymentLabel: string;
  acquisitionLabel?: string;
  acquisitionCampaign?: string;
  address?: string;
  notes?: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  delivery: number;
  total: number;
  status?: string;
};

export type ReceiptOrderSnapshot = {
  id: string;
  displayCode?: string;
  displayOrderNumber?: number;
  createdAt?: unknown;
  status?: string;
  fulfillmentType?: string;
  paymentMethod?: string;
  acquisitionSource?: string;
  acquisitionCampaign?: string;
  customer?: { name?: string; phone?: string; address?: string; notes?: string };
  items?: { name?: string; productName?: string; productId?: string; qty?: number; unitPrice?: number }[];
  totals?: { subtotal?: number; delivery?: number; deliveryFee?: number; total?: number };
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  pending: "Pendiente",
};

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  in_person: "Presencial",
  other: "Otro",
};

function asAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function receiptFromOrder(order: ReceiptOrderSnapshot): PosReceipt {
  const timestamp = order.createdAt as { toDate?: () => Date; seconds?: number; _seconds?: number } | string | number | Date | undefined;
  const createdAt = timestamp === undefined
    ? undefined
    : timestamp instanceof Date
      ? timestamp
      : typeof timestamp === "object" && timestamp !== null && typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : typeof timestamp === "object" && timestamp !== null && typeof (timestamp.seconds ?? timestamp._seconds) === "number"
          ? new Date(Number(timestamp.seconds ?? timestamp._seconds) * 1000)
          : new Date(timestamp as string | number);
  const fulfillmentType = order.fulfillmentType === "delivery" ? "delivery" : "pickup";
  const subtotal = asAmount(order.totals?.subtotal);
  const delivery = asAmount(order.totals?.deliveryFee ?? order.totals?.delivery);

  return {
    orderId: order.id,
    displayCode: order.displayCode ?? String(order.displayOrderNumber ?? order.id.slice(-6)),
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : undefined,
    customerName: order.customer?.name || "Cliente mostrador",
    customerPhone: order.customer?.phone,
    fulfillmentType,
    paymentLabel: PAYMENT_LABELS[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "Sin definir",
    acquisitionLabel: order.acquisitionSource
      ? SOURCE_LABELS[order.acquisitionSource] ?? order.acquisitionSource
      : undefined,
    acquisitionCampaign: order.acquisitionCampaign,
    address: order.customer?.address,
    notes: order.customer?.notes,
    items: (order.items ?? []).map((item) => ({
      name: item.name || item.productName || item.productId || "Producto",
      quantity: asAmount(item.qty),
      unitPrice: asAmount(item.unitPrice),
    })),
    subtotal,
    delivery,
    total: asAmount(order.totals?.total),
    status: order.status,
  };
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-CL")}`;
}

export function buildPosReceiptText(receipt: PosReceipt) {
  const date = receipt.createdAt ? new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(receipt.createdAt) : "Fecha sin registro";
  const lines = receipt.items.map((item) =>
    `${item.quantity} × ${item.name}  ${formatMoney(item.unitPrice * item.quantity)}`
  );
  return [
    "THE BEST BURGER · TBB",
    "Comprobante interno de venta",
    `Pedido ${receipt.displayCode} · ${date}`,
    `Cliente: ${receipt.customerName}`,
    ...(receipt.customerPhone ? [`Teléfono: ${receipt.customerPhone}`] : []),
    ...(receipt.address ? [`Dirección: ${receipt.address}`] : []),
    `Entrega: ${receipt.fulfillmentType === "delivery" ? "Delivery" : "Retiro"}`,
    ...lines,
    `Subtotal: ${formatMoney(receipt.subtotal)}`,
    ...(receipt.delivery > 0 ? [`Delivery: ${formatMoney(receipt.delivery)}`] : []),
    `TOTAL: ${formatMoney(receipt.total)}`,
    `Pago: ${receipt.paymentLabel}`,
    ...(receipt.acquisitionLabel ? [`Origen: ${receipt.acquisitionLabel}`] : []),
    ...(receipt.acquisitionCampaign ? [`Campaña/publicación: ${receipt.acquisitionCampaign}`] : []),
    ...(receipt.notes ? [`Nota: ${receipt.notes}`] : []),
    ...(receipt.status === "cancelled" ? ["ESTADO: PEDIDO CANCELADO"] : []),
    "Documento interno, no tributario.",
  ].join("\n");
}
